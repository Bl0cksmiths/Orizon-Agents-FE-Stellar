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
import type { DisputeReceiptView } from "@/lib/types";
import { cn } from "@/lib/utils";

import { DisputeStatusBadge } from "./dispute-status-badge";
import { formatLocalTime } from "./window-state";

export function DisputeReceipt({
  view,
  agentName,
  nowMs,
  className,
}: {
  view: DisputeReceiptView;
  /** The disputed step's agent, as the step row names it. */
  agentName: string;
  /**
   * "Now" for the relative ages, in epoch ms. The panel passes its own
   * server-corrected clock so a skewed laptop cannot print a dispute as
   * raised in the future; left out, the device clock stands in.
   */
  nowMs?: number;
  className?: string;
}) {
  const headingId = useId();
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
