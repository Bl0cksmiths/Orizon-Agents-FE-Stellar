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

import { formatUsdc } from "@/lib/disputes";
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

/**
 * A dispute the backend marked credited with no refund transaction on record.
 * The data layer reads that as a transfer still pending, never confirmed, and
 * keeps the promise as the only figure.
 */
const UNRECONCILED: Partial<DisputeReceiptView> = {
  amount: { usdc: 0.027, final: false },
  refund: { txHash: null, state: "pending" },
};

function renderReceipt(
  view: DisputeReceiptView,
  props: { viewer?: "payer" | "other" | "anonymous" } = {},
) {
  return render(
    <DisputeReceipt view={view} agentName={AGENT} nowMs={NOW} {...props} />,
  );
}

function text(): string {
  return document.body.textContent ?? "";
}

/** The on-chain row for one artifact, found by its visible name. */
function artifactRow(name: RegExp): HTMLElement {
  const term = screen.getByText(name, { selector: "dt" });
  return term.parentElement as HTMLElement;
}

function txHrefs(): string[] {
  return screen
    .queryAllByRole("link")
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => h.includes("/tx/"));
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

  it("never wears the Refunded badge for a credit whose transfer is unconfirmed", () => {
    // The badge is what a screenshot is read by first. A record marked
    // credited with no transfer on record reads as a refund in progress, and
    // the sentence below it says why — the two must not disagree.
    renderReceipt(receipt("credited", UNRECONCILED));
    const group = screen.getByRole("group", { name: /dispute receipt/i });
    expect(group.textContent).toContain("Refund in progress");
    expect(group.textContent).not.toContain("Refunded");
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

  it("does not print one instant twice when nothing has changed", () => {
    // An older backend stamps no transitions, so the last change falls back
    // to the opening. Two identical lines read as though the platform had
    // moved on the dispute when it has not.
    const { container } = renderReceipt(
      receipt("open", { lastChangedAtMs: OPENED_AT }),
    );
    const times = [...container.querySelectorAll("time")];
    expect(times).toHaveLength(1);
    expect(text()).toContain("Raised");
    expect(text()).not.toContain("Updated");
  });

  it("names the agent in its heading for anyone navigating by headings", () => {
    renderReceipt(receipt("open"));
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading.textContent).toBe(`Dispute receipt, ${AGENT}`);
  });
});

describe("DisputeReceipt — what happens next", () => {
  it("open: the platform reviews it, and says what upholding would do", () => {
    renderReceipt(receipt("open"));
    expect(text()).toContain(
      `The platform is reviewing this dispute; if it is upheld, the step's credit is paid to your wallet and ${AGENT}'s reputation records the dispute.`,
    );
  });

  it("upheld: says the credit has not been sent, and why nothing links", () => {
    renderReceipt(receipt("upheld"));
    expect(text()).toContain(
      "The platform upheld this dispute; the credit has not been sent yet — the transfer to your wallet is queued, and there is no transaction to look up until the platform submits it.",
    );
    // An upheld dispute has no transfer on record, so a sentence claiming one
    // is on its way sends a buyer hunting the explorer for nothing.
    expect(text()).not.toContain("the credit is being sent");
    expect(text()).not.toContain("was submitted");
  });

  it("crediting: waiting on Stellar, reconciled by hand, never twice", () => {
    renderReceipt(receipt("crediting"));
    expect(text()).toContain(
      "The refund was submitted and is waiting for confirmation on Stellar; if it cannot be confirmed, the platform reconciles it by hand — you will not be paid twice, and will not be skipped.",
    );
  });

  it("crediting with no hash: claims no submission the record cannot show", () => {
    renderReceipt(
      receipt("crediting", { refund: { txHash: null, state: "pending" } }),
    );
    expect(text()).toContain(
      "The refund is being sent and has no transaction on record yet; if it cannot be confirmed, the platform reconciles it by hand — you will not be paid twice, and will not be skipped.",
    );
    // The row beneath says "Being sent" — which is to say not submitted. The
    // sentence above it must not say the opposite.
    expect(text()).not.toContain("was submitted");
    expect(txHrefs()).toHaveLength(0);
  });

  it("credited: says what was received and what it cost the agent", () => {
    renderReceipt(receipt("credited"));
    expect(text()).toContain(
      `Done: you received ${formatUsdc(0.027)}, and it cost ${AGENT} a dispute rating on its reputation.`,
    );
  });

  it("credited: does not claim a cost the rating has not confirmed", () => {
    renderReceipt(
      receipt("credited", { rating: { txHash: RATING_TX, state: "pending" } }),
    );
    expect(text()).toContain(
      `Done: you received ${formatUsdc(0.027)}; the dispute rating it costs ${AGENT} is not confirmed yet.`,
    );
    expect(text()).not.toContain(`it cost ${AGENT}`);
  });

  it("credited without a settled figure: never restates the promise as paid", () => {
    renderReceipt(
      receipt("credited", { amount: { usdc: 0.027, final: false } }),
    );
    expect(text()).toContain("Done: you received the credit,");
    expect(text()).not.toContain(`received ${formatUsdc(0.027)}`);
  });

  it("credited without a confirmed refund: never says the money arrived", () => {
    renderReceipt(receipt("credited", UNRECONCILED));
    expect(text()).toContain(
      "The platform recorded this credit as paid, but the refund transfer is not confirmed on Stellar yet; the platform reconciles it by hand — you will not be paid twice, and will not be skipped.",
    );
    expect(text()).not.toContain("Done");
    expect(text()).not.toContain(`received ${formatUsdc(0.027)}`);
    expect(text()).not.toContain("received the credit");
  });

  it("rejected: no credit, reputation unchanged, reason below", () => {
    renderReceipt(receipt("rejected"));
    expect(text()).toContain(
      `The platform did not uphold this dispute: no credit was issued, ${AGENT}'s reputation is unchanged, and the reason is below.`,
    );
  });

  it("rejected without a reason to show: does not point below", () => {
    renderReceipt(receipt("rejected", { rejectionReason: null }));
    expect(text()).toContain(`${AGENT}'s reputation is unchanged.`);
    expect(text()).not.toContain("below");
  });
});

describe("DisputeReceipt — the credit line", () => {
  const FUNDED = "funded by the platform, not clawed back from the agent";

  /** The one paragraph carrying the figure. */
  function creditLine(): HTMLElement {
    const figure = screen.getByText(formatUsdc(0.027), { selector: "span" });
    return figure.closest("p") as HTMLElement;
  }

  it("states a final amount as credited, funder on the same line", () => {
    renderReceipt(receipt("credited"));
    expect(creditLine().textContent).toBe(
      `credit · ${formatUsdc(0.027)} credited to your wallet — ${FUNDED}.`,
    );
  });

  it("states a promise as what would be credited, never as paid", () => {
    renderReceipt(receipt("open"));
    const line = creditLine().textContent ?? "";
    expect(line).toBe(
      `credit · Up to ${formatUsdc(0.027)} would be credited to your wallet if upheld — ${FUNDED}.`,
    );
  });

  it.each<DisputeStatus>(["upheld", "crediting"])(
    "%s: the amount is still only on its way",
    (status) => {
      renderReceipt(receipt(status));
      const line = creditLine().textContent ?? "";
      expect(line).toContain(`Up to ${formatUsdc(0.027)} to be credited`);
      expect(line).toContain(FUNDED);
      expect(line).not.toMatch(/\d credited/);
    },
  );

  it("keeps the hedge when a credited dispute has no settled figure", () => {
    renderReceipt(
      receipt("credited", { amount: { usdc: 0.027, final: false } }),
    );
    expect(creditLine().textContent).toContain(
      `Up to ${formatUsdc(0.027)} credited to your wallet — ${FUNDED}`,
    );
  });

  it("keeps a credited dispute's amount on its way until the refund is confirmed", () => {
    renderReceipt(receipt("credited", UNRECONCILED));
    expect(creditLine().textContent).toBe(
      `credit · Up to ${formatUsdc(0.027)} to be credited to your wallet — ${FUNDED}.`,
    );
  });

  it("shows no credit line on a rejection", () => {
    renderReceipt(receipt("rejected"));
    expect(screen.queryByText(formatUsdc(0.027))).toBeNull();
    expect(text()).not.toContain("funded by");
  });
});

describe("DisputeReceipt — the on-chain artifacts", () => {
  it("shows both confirmed transactions in full, each with its link", () => {
    renderReceipt(receipt("credited"));

    const refund = artifactRow(/^Refund transfer/);
    expect(refund.textContent).toContain("what you received");
    expect(refund.textContent).toContain("Confirmed on Stellar");
    expect(refund.textContent).toContain(REFUND_TX);

    const rating = artifactRow(new RegExp(`^Dispute rating against ${AGENT}`));
    expect(rating.textContent).toContain("what it cost the agent");
    expect(rating.textContent).toContain("Confirmed on Stellar");
    expect(rating.textContent).toContain(RATING_TX);

    expect(txHrefs()).toEqual([
      expect.stringMatching(new RegExp(`/tx/${REFUND_TX}$`)),
      expect.stringMatching(new RegExp(`/tx/${RATING_TX}$`)),
    ]);
    // Distinct names: a links list reading "view on stellar.expert" twice
    // cannot tell a screen reader which transaction is which.
    expect(
      screen.getByRole("link", { name: "view refund on stellar.expert" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "view rating on stellar.expert" }),
    ).toBeTruthy();
  });

  // The caption is the line a reviewer reads first on a recording, and it
  // was a constant: "what you received" sat over an upheld dispute's empty
  // refund row, which is a statement of settlement nothing had made.
  it.each<DisputeStatus>(["upheld", "crediting"])(
    "%s: never captions an unconfirmed refund as money received",
    (status) => {
      renderReceipt(receipt(status));
      const refund = artifactRow(/^Refund transfer/);
      expect(refund.textContent).toContain("what is owed to you");
      expect(refund.textContent).not.toContain("what you received");
    },
  );

  it("captions a credited dispute's unrecorded refund as still owed", () => {
    renderReceipt(receipt("credited", UNRECONCILED));
    const refund = artifactRow(/^Refund transfer/);
    expect(refund.textContent).toContain("what is owed to you");
    expect(refund.textContent).not.toContain("what you received");
  });

  it("never captions an unconfirmed rating as a cost already paid", () => {
    renderReceipt(
      receipt("credited", { rating: { txHash: RATING_TX, state: "pending" } }),
    );
    const rating = artifactRow(/^Dispute rating/);
    expect(rating.textContent).toContain("what it will cost the agent");
    expect(rating.textContent).not.toContain("what it cost the agent");
  });

  it("speaks of the payer, not to them, in an unconfirmed caption", () => {
    renderReceipt(receipt("upheld", { reason: null }), { viewer: "other" });
    const refund = artifactRow(/^Refund transfer/);
    expect(refund.textContent).toContain("what is owed to the payer");
    expect(refund.textContent).not.toMatch(/\byou\b/i);
  });

  it("never shows a pending transaction with the confirmed mark", () => {
    renderReceipt(receipt("crediting"));
    const refund = artifactRow(/^Refund transfer/);
    expect(refund.textContent).toContain("Submitted, waiting for confirmation");
    expect(refund.textContent).not.toMatch(/confirmed/i);
    expect(refund.textContent).not.toContain("✓");
    expect(refund.querySelector(".text-cyan:not(a)")).toBeNull();
    // Submitted is still evidence: the hash and its link are shown.
    expect(refund.textContent).toContain(REFUND_TX);
    expect(txHrefs()).toEqual([
      expect.stringMatching(new RegExp(`/tx/${REFUND_TX}$`)),
    ]);
  });

  it("says a refund with no hash yet is being sent, and links nothing", () => {
    renderReceipt(receipt("upheld"));
    const refund = artifactRow(/^Refund transfer/);
    expect(refund.textContent).toContain("Being sent");
    expect(refund.textContent).not.toMatch(/confirmed/i);
    expect(refund.textContent).not.toContain("✓");
    expect(txHrefs()).toHaveLength(0);
  });

  it("draws a credited dispute's unrecorded refund as pending, not done", () => {
    renderReceipt(receipt("credited", UNRECONCILED));
    const refund = artifactRow(/^Refund transfer/);
    expect(refund.textContent).toContain("Being sent");
    expect(refund.textContent).not.toMatch(/confirmed/i);
    expect(refund.textContent).not.toContain("✓");
    expect(screen.queryByRole("link", { name: /refund/i })).toBeNull();
  });

  it("marks each artifact by its own state", () => {
    renderReceipt(
      receipt("credited", { rating: { txHash: RATING_TX, state: "pending" } }),
    );
    expect(artifactRow(/^Refund transfer/).textContent).toContain(
      "Confirmed on Stellar",
    );
    const rating = artifactRow(/^Dispute rating/);
    expect(rating.textContent).toContain("Submitted, waiting for confirmation");
    expect(rating.textContent).not.toContain("✓");
  });

  it.each<DisputeStatus>(["open", "rejected"])(
    "%s: renders no on-chain record at all",
    (status) => {
      renderReceipt(receipt(status));
      expect(text()).not.toContain("On-chain record");
      expect(text()).not.toContain("Refund transfer");
      expect(txHrefs()).toHaveLength(0);
    },
  );

  it("explains a credited dispute's rating that has not landed", () => {
    renderReceipt(receipt("credited", { rating: NONE }));
    const rating = artifactRow(/^Dispute rating/);
    expect(rating.textContent).toBe(
      `Dispute rating against ${AGENT} — not recorded on-chain yet.`,
    );
    expect(txHrefs()).toHaveLength(1);
  });

  it("leaves out an absent rating while the dispute is still moving", () => {
    renderReceipt(receipt("crediting"));
    expect(text()).not.toContain("Dispute rating");
  });
});

describe("DisputeReceipt — reasons", () => {
  it("shows the buyer's own reason, labelled as theirs", () => {
    renderReceipt(receipt("open"));
    const quote = screen.getByText(REASON);
    expect(quote.tagName).toBe("BLOCKQUOTE");
    expect(quote.previousElementSibling?.textContent).toBe("Your reason");
  });

  it("shows why a rejection was made, labelled", () => {
    renderReceipt(receipt("rejected"));
    const quote = screen.getByText(REJECTION);
    expect(quote.tagName).toBe("BLOCKQUOTE");
    expect(quote.previousElementSibling?.textContent).toBe(
      "Why it was rejected",
    );
  });

  it("renders neither reason when the view carries none", () => {
    renderReceipt(
      receipt("rejected", { reason: null, rejectionReason: null }),
      { viewer: "other" },
    );
    expect(text()).not.toContain("Your reason");
    expect(text()).not.toContain("Why it was rejected");
    expect(screen.queryAllByRole("blockquote")).toHaveLength(0);
    expect(document.querySelectorAll("blockquote")).toHaveLength(0);
  });
});

describe("DisputeReceipt — who is reading", () => {
  it.each(["other", "anonymous"] as const)(
    "never tells a %s viewer the credit went to their wallet",
    (viewer) => {
      renderReceipt(receipt("credited", { reason: null }), { viewer });
      expect(text()).not.toMatch(/\byour\b|\byou\b/i);
      expect(text()).toContain("credited to the payer's wallet");
      expect(text()).toContain("Done: the payer received");
      expect(text()).toContain("what the payer received");
    },
  );
});

describe("DisputeReceipt — the live announcement", () => {
  function liveRegion(): HTMLElement {
    return screen.getByRole("status");
  }

  it("is a polite live region, present and silent on first render", () => {
    renderReceipt(receipt("crediting"));
    const region = liveRegion();
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
  });

  it("announces a status change once, and a repeat poll not at all", () => {
    const { rerender } = renderReceipt(receipt("crediting"));
    const region = liveRegion();

    // Every write to the region's text is a chance for a screen reader to
    // speak, so the count of DOM mutations is the count of announcements.
    let writes = 0;
    const observer = new MutationObserver((records) => {
      writes += records.length;
    });
    observer.observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const redraw = (view: DisputeReceiptView) =>
      rerender(<DisputeReceipt view={view} agentName={AGENT} nowMs={NOW} />);

    // A poll that changed nothing, then the refund landing, then two more
    // polls that brought the same status back — one with a newer timestamp.
    redraw(receipt("crediting"));
    expect(region.textContent).toBe("");
    redraw(receipt("credited"));
    redraw(receipt("credited"));
    redraw(receipt("credited", { lastChangedAtMs: CHANGED_AT + MIN }));
    writes += observer.takeRecords().length;
    observer.disconnect();

    // The same node throughout: a region replaced is a region re-read.
    expect(liveRegion()).toBe(region);
    expect(region.textContent).toBe(
      `Your dispute against ${AGENT} was refunded.`,
    );
    expect(writes).toBe(1);
  });

  it("does not announce a refund the record has not confirmed", () => {
    const { rerender } = renderReceipt(receipt("crediting"));
    rerender(
      <DisputeReceipt
        view={receipt("credited", UNRECONCILED)}
        agentName={AGENT}
        nowMs={NOW}
      />,
    );
    const said = liveRegion().textContent ?? "";
    expect(said).toBe(
      `Your dispute against ${AGENT} was marked as paid, but its refund is not confirmed on Stellar yet.`,
    );
    expect(said).not.toContain("refunded");
  });

  // The badge flips amber → green here with the record's status unmoved. The
  // region watched that status, so the one change the buyer is waiting for —
  // the money landing — was the one it never spoke.
  it("announces a refund confirming under an unchanged status", () => {
    const { rerender } = renderReceipt(receipt("credited", UNRECONCILED));
    const region = liveRegion();
    expect(region.textContent).toBe("");

    rerender(
      <DisputeReceipt
        view={receipt("credited")}
        agentName={AGENT}
        nowMs={NOW}
      />,
    );
    expect(liveRegion()).toBe(region);
    expect(region.textContent).toBe(
      `Your dispute against ${AGENT} was refunded.`,
    );
  });

  it("says nothing when a poll brings the same unreconciled credit back", () => {
    const { rerender } = renderReceipt(receipt("credited", UNRECONCILED));
    rerender(
      <DisputeReceipt
        view={receipt("credited", UNRECONCILED)}
        agentName={AGENT}
        nowMs={NOW}
      />,
    );
    expect(liveRegion().textContent).toBe("");
  });

  it("announces each later change in turn", () => {
    const { rerender } = renderReceipt(receipt("open"));
    const redraw = (view: DisputeReceiptView) =>
      rerender(<DisputeReceipt view={view} agentName={AGENT} nowMs={NOW} />);

    redraw(receipt("upheld"));
    expect(liveRegion().textContent).toBe(
      `Your dispute against ${AGENT} was upheld.`,
    );
    redraw(receipt("crediting"));
    expect(liveRegion().textContent).toBe(
      `Your dispute against ${AGENT} is being refunded.`,
    );
  });

  it("speaks about the dispute, not to its owner, for anyone else", () => {
    const { rerender } = renderReceipt(receipt("open"), { viewer: "other" });
    rerender(
      <DisputeReceipt
        view={receipt("rejected")}
        agentName={AGENT}
        nowMs={NOW}
        viewer="other"
      />,
    );
    expect(liveRegion().textContent).toBe(
      `The dispute against ${AGENT} was rejected.`,
    );
  });
});

describe("DisputeReceipt — accessibility", () => {
  it("hides every decorative mark and labels every link", () => {
    const { container } = renderReceipt(
      receipt("credited", { rating: { txHash: RATING_TX, state: "pending" } }),
    );
    for (const mark of container.querySelectorAll("[aria-hidden='true']")) {
      expect(mark.textContent ?? "").not.toMatch(/[A-Za-z]/);
    }
    for (const link of screen.getAllByRole("link")) {
      expect((link.textContent ?? "").trim()).not.toBe("");
    }
  });

  it("stills the pending pulse for anyone who asked for less motion", () => {
    const { container } = renderReceipt(receipt("crediting"));
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
    for (const pulse of pulses) {
      expect(pulse.className).toContain("motion-reduce:animate-none");
    }
  });
});
