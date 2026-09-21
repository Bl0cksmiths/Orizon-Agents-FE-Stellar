"use client";
/**
 * The receipt a buyer sees above the trace on a settled workflow: what moved,
 * who paid, until when it can be disputed, and what each step cost.
 *
 * Presentational by contract. Every rule story 4.05 states — who may dispute,
 * which steps can be disputed, whether the window is open — is decided
 * upstream by disputeView() and arrives here as a finished view model. This
 * file only chooses how each decided state looks, so a rule changed here
 * would be a rule changed in the wrong place.
 */

import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KVRow } from "@/components/ui/kv-row";
import { formatAge } from "@/components/ui/stale-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { formatUsdc } from "@/lib/disputes";
import type { DisputePanelView, SettlementStepView } from "@/lib/types";

import { WindowState, formatLocalTime } from "./window-state";

type SettledView = Extract<DisputePanelView, { kind: "settled" }>;

export function ReceiptPanel({
  view,
  onDispute,
  onConnect,
}: {
  view: DisputePanelView;
  /** The payer chose to dispute this step. */
  onDispute: (step: SettlementStepView) => void;
  /** An anonymous viewer asked to connect the wallet that paid. */
  onConnect: () => void;
}) {
  // Called before any early return: hooks run in the same order every render.
  const headingId = useId();

  if (view.kind === "hidden") return null;
  if (view.kind === "not_settled") {
    return <NotSettled headingId={headingId} running={view.running} />;
  }
  return (
    <SettledReceipt
      view={view}
      headingId={headingId}
      onDispute={onDispute}
      onConnect={onConnect}
    />
  );
}

/**
 * No receipt yet — or none coming. Kept quiet on purpose: this sits above the
 * trace a buyer came to watch, and "not settled" is an answer, not an alarm.
 * It still says why, because a panel that silently vanishes reads as broken.
 */
function NotSettled({
  headingId,
  running,
}: {
  headingId: string;
  running: boolean;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="clip-cyber-sm border border-border/60 bg-surface/40 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id={headingId}
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted"
        >
          {running && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet shadow-[0_0_8px_#B026FF] animate-pulseGlow"
            />
          )}
          Receipt
        </h2>
        <p className="text-xs leading-relaxed text-muted">
          {running
            ? "The receipt appears here once this workflow settles, and disputes open then."
            : "Nothing on this workflow was charged, so there is nothing to dispute."}
        </p>
      </div>
    </section>
  );
}

/**
 * One on-chain hash with its explorer link — the trace page's own TxRow
 * shape. The labels match that page's on-chain receipts card too ("charge",
 * "seal"): the same two hashes appear there, and one transaction under two
 * names on one page reads as two transactions.
 *
 * A hash the backend did not record is said to be missing rather than
 * dropped: a receipt with a row quietly absent looks complete when it is not.
 */
function TxRow({ label, hash }: { label: string; hash: string | null }) {
  return (
    <KVRow k={label}>
      {hash ? (
        <>
          <span className="block break-all">{hash}</span>
          <StellarExpertLink
            kind="tx"
            id={hash}
            className="mt-1 inline-block"
          />
        </>
      ) : (
        <span className="text-muted">not recorded</span>
      )}
    </KVRow>
  );
}

function SettledReceipt({
  view,
  headingId,
}: {
  view: SettledView;
  headingId: string;
  onDispute: (step: SettlementStepView) => void;
  onConnect: () => void;
}) {
  // "Settled 3h ago" is measured on the server's clock where the view carries
  // it — an open window is closesAt minus what is left — so a skewed laptop
  // clock cannot print a settlement as happening in the future. Once the
  // window has closed the settlement is a whole window old, and a few seconds
  // of skew no longer show in an age that coarse.
  const nowMs = view.window.open
    ? view.window.closesAtMs - view.window.remainingMs
    : Date.now();
  const steps = view.steps.length;

  return (
    <section aria-labelledby={headingId}>
      <Card className="space-y-6 p-4 sm:p-6">
        {/* A plain div, not <header>: some engines expose a header inside a
            section as a page banner landmark, and this is not one. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id={headingId}
                className="text-lg font-semibold tracking-tight"
              >
                Receipt
              </h2>
              <Badge tone="success">
                <span aria-hidden="true">✓</span> settled
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              Settled{" "}
              <time dateTime={new Date(view.settledAtMs).toISOString()}>
                {formatAge(nowMs - view.settledAtMs)}
              </time>{" "}
              · {steps} step{steps === 1 ? "" : "s"}
            </p>
          </div>
          <StatTile
            label="total charged"
            value={formatUsdc(view.settledUsdc)}
            className="sm:text-right"
          />
        </div>

        <dl className="space-y-3 font-mono text-sm">
          <KVRow k="paid by">
            <span className="block break-all">{view.payer}</span>
            <StellarExpertLink
              kind="account"
              id={view.payer}
              className="mt-1 inline-block"
            />
          </KVRow>
          <KVRow k="settled" value={formatLocalTime(view.settledAtMs)} />
          <TxRow label="charge" hash={view.chargeTx} />
          <TxRow label="seal" hash={view.proofTx} />
        </dl>

        <WindowState window={view.window} settledAtMs={view.settledAtMs} />
      </Card>
    </section>
  );
}
