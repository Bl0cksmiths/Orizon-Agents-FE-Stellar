// @vitest-environment jsdom
/**
 * The receipt's outage banner (components/disputes/receipt-outage.tsx): its
 * words for each thing that can be on screen beneath it, what it keeps out
 * of the alert, and its retry.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { StoreOutage } from "@/lib/store-outage";
import {
  ReceiptOutageNote,
  receiptOutageStatus,
  receiptOutageText,
} from "./receipt-outage";

const STORE: StoreOutage = {
  kind: "store",
  retryAfterMs: 5_000,
  requestId: "req0000000000503",
};
const SERVER: StoreOutage = {
  kind: "server",
  retryAfterMs: null,
  requestId: null,
};
const RAW =
  "GET /tasks/tsk_2a55b0229bccf4e0/disputes → 503 — store unavailable";

afterEach(cleanup);

describe("receiptOutageText", () => {
  it("with nothing drawn, says the receipt is unavailable and why, and vouches for no payment it never read", () => {
    const text = receiptOutageText("hidden", STORE);
    expect(text).toBe(
      "⚠ receipt unavailable — the dispute records are temporarily unreachable, so this run's receipt can't be shown yet. Nothing already settled on-chain is affected, and nor is the trace below.",
    );
    expect(text).not.toMatch(/your payment/i);
  });

  it("over a settled receipt, dates it rather than denies it", () => {
    expect(receiptOutageText("settled", STORE)).toBe(
      "⚠ this receipt may be out of date — the dispute records are temporarily unreachable, so it is shown as last read. Nothing already settled on-chain is affected.",
    );
  });

  it("over an unsettled answer, claims nothing on-chain", () => {
    expect(receiptOutageText("not_settled", STORE)).toBe(
      "⚠ this receipt may be out of date — the dispute records are temporarily unreachable, so it is shown as last read.",
    );
  });

  it("does not blame the store for a failure that did not name it", () => {
    const text = receiptOutageText("hidden", SERVER);
    expect(text).toContain("receipt unavailable");
    expect(text).toContain(
      "the server couldn't read the dispute records just now",
    );
    expect(text).not.toContain("unreachable");
  });

  it("never prints the request line", () => {
    for (const shown of ["hidden", "settled", "not_settled"] as const) {
      for (const outage of [STORE, SERVER]) {
        expect(receiptOutageText(shown, outage)).not.toMatch(/GET|→|\b50\d\b/);
      }
    }
  });
});

describe("receiptOutageStatus", () => {
  it("says it is retrying, and then that it stopped", () => {
    expect(receiptOutageStatus(false)).toBe("Retrying automatically.");
    expect(receiptOutageStatus(true)).toBe(
      "Stopped retrying automatically — press retry to try again.",
    );
  });
});

describe("ReceiptOutageNote", () => {
  function draw(props: Partial<Parameters<typeof ReceiptOutageNote>[0]> = {}) {
    const onRetry = vi.fn();
    render(
      <ReceiptOutageNote
        shown="hidden"
        outage={STORE}
        gaveUp={false}
        error={RAW}
        onRetry={onRetry}
        retrying={false}
        {...props}
      />,
    );
    return { onRetry };
  }

  it("alerts the sentence alone, with the retry beside it", () => {
    draw();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(receiptOutageText("hidden", STORE));
    expect(alert.textContent).not.toContain("GET /tasks");
    expect(alert.textContent).not.toContain("Retrying automatically");
    expect(alert.textContent).not.toContain("req0000000000503");
  });

  it("folds the technical line and the request id away, outside the alert", () => {
    draw();
    const details = screen.getByText("technical detail").closest("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain(RAW);
    expect(details?.textContent).toContain("request id req0000000000503");
    expect(screen.getByRole("alert").contains(details)).toBe(false);
  });

  it("names no request id it was not given", () => {
    draw({ outage: SERVER });
    expect(screen.queryByText(/request id/)).toBeNull();
  });

  it("shows what it is doing to the eye, and leaves it to the polite region for the ear", () => {
    draw();
    const status = screen.getByText("Retrying automatically.");
    expect(status.getAttribute("aria-hidden")).toBe("true");
  });

  it("says when it has stopped", () => {
    draw({ gaveUp: true });
    expect(
      screen.getByText(
        "Stopped retrying automatically — press retry to try again.",
      ),
    ).toBeTruthy();
  });

  it("retries on a press, and holds the button while one is out", () => {
    const { onRetry } = draw();
    const button = screen.getByRole("button", { name: "↻ retry" });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);

    cleanup();
    draw({ retrying: true });
    const busy = screen.getByRole("button", { name: "retrying…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });
});
