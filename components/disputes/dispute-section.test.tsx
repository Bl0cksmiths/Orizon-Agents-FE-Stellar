// @vitest-environment jsdom
/**
 * DisputeSection's one escrow v2 duty: a receipt whose settlement FAILED
 * offers the reclaim — but only to the session that signed the
 * authorization, which is the only place its id is held. The panel and its
 * hooks are stubbed; they have suites of their own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { DisputePanelView } from "@/lib/types";

const { panel } = vi.hoisted(() => ({
  panel: { view: { kind: "hidden" } as DisputePanelView },
}));
vi.mock("@/lib/use-dispute-panel", () => ({
  useDisputePanel: () => ({
    view: panel.view,
    loading: false,
    error: null,
    refresh: vi.fn(),
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

import { rememberHeldAuthorization } from "@/lib/held-authorizations";
import { DisputeSection } from "./dispute-section";

const HELD = {
  authIdHex: "0123456789abcdef0123456789abcdef",
  payer: "GBPAYER".padEnd(56, "A"),
  expiresAt: 1_700_000_000,
};
const reclaimHeading = () =>
  screen.queryByRole("heading", { name: "Reclaim your funds" });

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("DisputeSection — reclaim after a failed settlement", () => {
  it("offers it when the settlement failed and this session signed", async () => {
    rememberHeldAuthorization("task_1", HELD);
    panel.view = {
      kind: "not_settled",
      running: false,
      settlementState: "failed",
    };
    render(<DisputeSection taskId="task_1" workflowDone demo={false} />);
    expect(
      await screen.findByRole("heading", { name: "Reclaim your funds" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain(HELD.payer);
  });

  it("offers nothing when this session did not sign the authorization", () => {
    panel.view = {
      kind: "not_settled",
      running: false,
      settlementState: "failed",
    };
    render(<DisputeSection taskId="task_1" workflowDone demo={false} />);
    expect(reclaimHeading()).toBeNull();
  });

  it.each(["released", "unconfirmed", "skipped", null] as const)(
    "offers nothing when the settlement state is %s",
    (state) => {
      rememberHeldAuthorization("task_1", HELD);
      panel.view = {
        kind: "not_settled",
        running: false,
        settlementState: state,
      };
      render(<DisputeSection taskId="task_1" workflowDone demo={false} />);
      expect(reclaimHeading()).toBeNull();
    },
  );
});
