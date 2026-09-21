// @vitest-environment jsdom
/**
 * Unit tests for DisputeReceipt — story 4.06's receipt, one decided state at
 * a time.
 *
 * The receipt is screen-recorded evidence: a reviewer matches it against
 * Stellar Expert. So beyond "each status renders", these pin the claims it
 * must never overstate — a pending transaction never wears the confirmed
 * mark, a promised amount is never called a payment — and that the funder is
 * named on the same line as the figure it pays.
 *
 * Amounts and times are compared against the app's own formatters rather
 * than literal strings, so a formatting change there is not a failure here.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type {
  DisputeArtifact,
  DisputeReceiptView,
  DisputeStatus,
} from "@/lib/types";
import { formatAge } from "@/components/ui/stale-badge";
import { DisputeReceipt } from "./dispute-receipt";
import { formatLocalTime } from "./window-state";

afterEach(cleanup);

const MIN = 60_000;
const HOUR = 60 * MIN;
const OPENED_AT = Date.UTC(2026, 8, 21, 10, 0, 0);
const CHANGED_AT = OPENED_AT + 2 * HOUR;
const NOW = OPENED_AT + 3 * HOUR;
const AGENT = "Code Critic";
const REFUND_TX = "d".repeat(56) + "0123abcd";
const RATING_TX = "e".repeat(56) + "4567cdef";
const REASON = "The summary missed the second half of the brief.";
const REJECTION = "The output matched the brief as written.";

const NONE: DisputeArtifact = { txHash: null, state: "none" };

/**
 * A receipt as the data layer would derive it for each status: the promise
 * until credited, the settled figure after; artifacts only as far as the
 * lifecycle has reached; the rejection reason only on a rejection.
 */
function receipt(
  status: DisputeStatus,
  over: Partial<DisputeReceiptView> = {},
): DisputeReceiptView {
  const base: DisputeReceiptView = {
    status,
    openedAtMs: OPENED_AT,
    lastChangedAtMs: status === "open" ? OPENED_AT : CHANGED_AT,
    amount: { usdc: 0.027, final: false },
    fundedBy: "platform",
    refund: NONE,
    rating: NONE,
    reason: REASON,
    rejectionReason: null,
  };
  switch (status) {
    case "upheld":
      base.refund = { txHash: null, state: "pending" };
      break;
    case "crediting":
      base.refund = { txHash: REFUND_TX, state: "pending" };
      break;
    case "credited":
      base.amount = { usdc: 0.027, final: true };
      base.refund = { txHash: REFUND_TX, state: "confirmed" };
      base.rating = { txHash: RATING_TX, state: "confirmed" };
      break;
    case "rejected":
      base.rejectionReason = REJECTION;
      break;
  }
  return { ...base, ...over };
}

function renderReceipt(
  view: DisputeReceiptView,
  props: { viewer?: "payer" | "other" | "anonymous" } = {},
) {
  return render(
    <DisputeReceipt view={view} agentName={AGENT} nowMs={NOW} {...props} />,
  );
}

describe("DisputeReceipt — the header, in every state", () => {
  const STATUSES: DisputeStatus[] = [
    "open",
    "upheld",
    "crediting",
    "credited",
    "rejected",
  ];
  const LABELS: Record<DisputeStatus, string> = {
    open: "Under review",
    upheld: "Upheld",
    crediting: "Refund in progress",
    credited: "Refunded",
    rejected: "Rejected",
  };

  it.each(STATUSES)("names %s with the shared status badge", (status) => {
    renderReceipt(receipt(status));
    const group = screen.getByRole("group", { name: /dispute receipt/i });
    expect(group.textContent).toContain(LABELS[status]);
    expect(group.textContent).toContain("Dispute status:");
  });

  it("says when it was raised and last updated, in local time and age", () => {
    const { container } = renderReceipt(receipt("upheld"));
    const times = [...container.querySelectorAll("time")];
    expect(times.map((t) => t.getAttribute("dateTime"))).toEqual([
      new Date(OPENED_AT).toISOString(),
      new Date(CHANGED_AT).toISOString(),
    ]);
    expect(times[0].textContent).toBe(formatLocalTime(OPENED_AT));
    expect(times[1].textContent).toBe(formatLocalTime(CHANGED_AT));

    const raised = times[0].parentElement?.textContent ?? "";
    const updated = times[1].parentElement?.textContent ?? "";
    expect(raised).toMatch(/^Raised /);
    expect(raised).toContain(formatAge(NOW - OPENED_AT));
    expect(updated).toMatch(/^Updated /);
    expect(updated).toContain(formatAge(NOW - CHANGED_AT));
  });

  it("names the agent in its heading for anyone navigating by headings", () => {
    renderReceipt(receipt("open"));
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.textContent).toBe(`Dispute receipt, ${AGENT}`);
  });
});
