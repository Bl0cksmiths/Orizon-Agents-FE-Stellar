// @vitest-environment jsdom
/**
 * DisputeSection through an outage of the dispute records: the banner it
 * draws instead of the request line, and what its polite region says as the
 * outage runs, gives up and ends. The panel's hook is stubbed — its retries
 * have a suite of their own — so each test sets what the hook reports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { StoreOutage } from "@/lib/store-outage";
import type { DisputePanelView } from "@/lib/types";

type Panel = {
  view: DisputePanelView;
  error: string | null;
  outage: StoreOutage | null;
  outageGaveUp: boolean;
};

const { panel } = vi.hoisted(() => ({ panel: {} as Panel }));
vi.mock("@/lib/use-dispute-panel", () => ({
  useDisputePanel: () => ({
    ...panel,
    loading: false,
    refresh: vi.fn(async () => {}),
    offsetMs: 0,
    adopt: vi.fn(),
  }),
}));
vi.mock("@/lib/use-reason-unlock", () => ({
  useReasonUnlock: () => ({
    status: { kind: "idle" },
    unavailable: true,
    unlock: vi.fn(),
  }),
}));
vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({
    connected: false,
    address: null,
    connect: vi.fn(),
    signXdr: vi.fn(),
    refreshBalance: vi.fn(),
  }),
}));

import { DisputeSection } from "./dispute-section";

const RAW =
  "GET /tasks/tsk_2a55b0229bccf4e0/disputes → 503 — store unavailable";
const STORE: StoreOutage = {
  kind: "store",
  retryAfterMs: 5_000,
  requestId: "req0000000000503",
};

/**
 * Draws the section. The section is memoized on its props, and the hook is a
 * stub, so a redraw flips `asset` to make React call the hook again.
 */
function draw() {
  const section = (asset: string | null) => (
    <DisputeSection
      taskId="task_1"
      workflowDone
      demo={false}
      asset={asset}
      escrowGeneration="v2"
    />
  );
  let asset: string | null = "native";
  const { rerender } = render(section(asset));
  return {
    redraw: (next: Partial<Panel>) => {
      Object.assign(panel, next);
      asset = asset === null ? "native" : null;
      rerender(section(asset));
    },
  };
}

/** The section's polite region, found by attribute: it may be empty. */
const politeRegion = () =>
  document.querySelector<HTMLOutputElement>('output[aria-live="polite"]');

beforeEach(() => {
  Object.assign(panel, {
    view: { kind: "hidden" },
    error: RAW,
    outage: STORE,
    outageGaveUp: false,
  } satisfies Panel);
});
afterEach(cleanup);

describe("DisputeSection — an outage of the dispute records", () => {
  it("says what happened in words, and never the request line", () => {
    draw();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("receipt unavailable");
    expect(alert.textContent).toContain(
      "the dispute records are temporarily unreachable",
    );
    expect(alert.textContent).not.toContain("GET /tasks");
    expect(alert.textContent).not.toContain("→ 503");
    // Still there for a support request, folded away.
    expect(
      screen.getByText("technical detail").closest("details")?.textContent,
    ).toContain(RAW);
    expect(screen.getByRole("button", { name: "↻ retry" })).toBeTruthy();
  });

  it("dates a receipt on screen rather than denying it", () => {
    panel.view = { kind: "not_settled", running: false };
    draw();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("this receipt may be out of date");
    expect(alert.textContent).not.toContain("receipt unavailable");
  });

  it("says politely that it is retrying, that it stopped, and that the records are back", () => {
    const { redraw } = draw();
    expect(politeRegion()?.textContent).toBe("Retrying automatically.");

    redraw({ outageGaveUp: true, outage: { ...STORE } });
    expect(politeRegion()?.textContent).toBe(
      "Stopped retrying automatically — press retry to try again.",
    );

    redraw({
      view: { kind: "not_settled", running: false },
      error: null,
      outage: null,
      outageGaveUp: false,
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(politeRegion()?.textContent).toBe(
      "The dispute records are reachable again — the receipt is up to date.",
    );
  });

  it("keeps the request line for a failure that is not an outage, with no outage status", () => {
    Object.assign(panel, { error: "Failed to fetch", outage: null });
    draw();
    expect(screen.getByRole("alert").textContent).toContain(
      "⚠ receipt unavailable — Failed to fetch",
    );
    expect(politeRegion()).toBeNull();
  });

  it("carries no outage region on a receipt that never met one", () => {
    Object.assign(panel, {
      view: { kind: "not_settled", running: false },
      error: null,
      outage: null,
    });
    draw();
    expect(politeRegion()).toBeNull();
  });
});
