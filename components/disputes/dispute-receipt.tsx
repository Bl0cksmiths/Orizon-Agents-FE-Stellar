"use client";
/**
 * The receipt of one dispute, as a buyer reads it on the trace page: where it
 * stands, what happens next, what it pays and who pays it, and the two
 * on-chain transactions that prove it — the refund transfer and the dispute
 * rating.
 *
 * It is evidence as much as interface. A grant reviewer watching a screen
 * recording matches what is drawn here against Stellar Expert, so no line may
 * claim more than the record vouches for: a transaction that was merely
 * submitted is drawn as pending and never with a success look, because an
 * optimistic "refunded" the chain later contradicts is worse than no receipt.
 *
 * Presentational by contract, like the panel it sits in. Whether the amount
 * is final, whether each transaction is confirmed, and which reasons this
 * viewer may read all arrive decided in DisputeReceiptView; this file only
 * chooses how each decided state looks and reads.
 */

import { useId } from "react";

import { formatAge } from "@/components/ui/stale-badge";
import { formatUsdc } from "@/lib/disputes";
import type { DisputeReceiptView, DisputeViewer } from "@/lib/types";
import { cn } from "@/lib/utils";

import { DisputeStatusBadge } from "./dispute-status-badge";
import { formatLocalTime } from "./window-state";

/**
 * Who the copy addresses. Only the payer is "you": a shared trace shows
 * anyone the same public receipt, and telling a stranger a credit went to
 * "your wallet" would be a false line on an evidence page. An anonymous viewer
 * may be the payer on another device, but "the payer" is true either way.
 */
type Voice = {
  /** Opens a sentence about the dispute: "Your dispute …" / "The dispute …". */
  owner: string;
  /** Where the credit goes. */
  wallet: string;
  /** Who is paid. */
  who: string;
};

const PAYER_VOICE: Voice = { owner: "Your", wallet: "your wallet", who: "you" };
const OTHER_VOICE: Voice = {
  owner: "The",
  wallet: "the payer's wallet",
  who: "the payer",
};

export function DisputeReceipt({
  view,
  agentName,
  viewer = "payer",
  nowMs,
  className,
}: {
  view: DisputeReceiptView;
  /** The disputed step's agent, as the step row names it. */
  agentName: string;
  /** Who is looking. Only the payer is addressed as "you". */
  viewer?: DisputeViewer;
  /**
   * "Now" for the relative ages, in epoch ms. The panel passes its own
   * server-corrected clock so a skewed laptop cannot print a dispute as
   * raised in the future; left out, the device clock stands in.
   */
  nowMs?: number;
  className?: string;
}) {
  const headingId = useId();
  const voice = viewer === "payer" ? PAYER_VOICE : OTHER_VOICE;
  const now = nowMs ?? Date.now();

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className={cn("space-y-4", className)}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4
            id={headingId}
            className="font-mono text-[10px] uppercase tracking-widest text-cyan"
          >
            Dispute receipt
            {/* Several steps can carry one; heard out of its row, the
                heading says which agent this one is about. */}
            <span className="sr-only">, {agentName}</span>
          </h4>
          <DisputeStatusBadge status={view.status} />
        </div>
        <div className="flex flex-col gap-0.5 font-mono text-[11px] text-muted sm:flex-row sm:flex-wrap sm:gap-x-5">
          <Moment label="Raised" ms={view.openedAtMs} nowMs={now} />
          <Moment label="Updated" ms={view.lastChangedAtMs} nowMs={now} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text/90">
        {nextStep(view, agentName, voice)}
      </p>
    </div>
  );
}

/** One instant: local time with its zone for the record, and its age. */
function Moment({
  label,
  ms,
  nowMs,
}: {
  label: string;
  ms: number;
  nowMs: number;
}) {
  return (
    <p>
      {label}{" "}
      <time dateTime={new Date(ms).toISOString()} className="text-text/90">
        {formatLocalTime(ms)}
      </time>{" "}
      {/* Kept together: a "·" ending one line and the age opening the next
          reads, at 360px, as two separate facts. */}
      <span className="whitespace-nowrap">· {formatAge(nowMs - ms)}</span>
    </p>
  );
}

/**
 * What happens next, in one plain sentence per status. `credited` is the one
 * that says what it cost the agent, and says it only as far as the rating
 * transaction vouches for: a rating not yet confirmed is not yet a cost.
 */
function nextStep(
  view: DisputeReceiptView,
  agent: string,
  voice: Voice,
): string {
  switch (view.status) {
    case "open":
      return `The platform is reviewing this dispute; if it is upheld, the step's credit is paid to ${voice.wallet} and ${agent}'s reputation records the dispute.`;
    case "upheld":
      return `The platform upheld this dispute; the credit is being sent to ${voice.wallet}.`;
    case "crediting":
      return `The refund was submitted and is waiting for confirmation on Stellar; if it cannot be confirmed, the platform reconciles it by hand — ${voice.who} will not be paid twice, and will not be skipped.`;
    case "credited": {
      // The backend can mark a dispute credited with no transfer on record to
      // prove it — its own tooling treats that as unreconciled. The badge
      // still reports the status, but the sentence only says money arrived
      // once the refund is confirmed on Stellar.
      if (view.refund.state !== "confirmed") {
        return `The platform recorded this credit as paid, but the refund transfer is not confirmed on Stellar yet; the platform reconciles it by hand — ${voice.who} will not be paid twice, and will not be skipped.`;
      }
      // A promise is never restated as a payment: without the settled figure
      // the sentence says the credit arrived, not how much.
      const paid = view.amount.final
        ? formatUsdc(view.amount.usdc)
        : "the credit";
      return view.rating.state === "confirmed"
        ? `Done: ${voice.who} received ${paid}, and it cost ${agent} a dispute rating on its reputation.`
        : `Done: ${voice.who} received ${paid}; the dispute rating it costs ${agent} is not confirmed yet.`;
    }
    case "rejected":
      return `The platform did not uphold this dispute: no credit was issued, ${agent}'s reputation is unchanged${
        view.rejectionReason !== null ? ", and the reason is below" : ""
      }.`;
  }
}
