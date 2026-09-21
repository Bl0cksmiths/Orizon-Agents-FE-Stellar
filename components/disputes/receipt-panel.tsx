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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KVRow } from "@/components/ui/kv-row";
import { formatAge } from "@/components/ui/stale-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { formatUsdc } from "@/lib/disputes";
import type {
  DisputePanelView,
  SettlementStepView,
  StepDisputeState,
} from "@/lib/types";

import { DisputeStatusBadge } from "./dispute-status-badge";
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
  onDispute,
  onConnect,
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
  // Only someone the page cannot yet place is told how to become able to
  // dispute. A payer already has the buttons; a connected wallet that did not
  // pay is not the payer, and a prompt would invite them to try.
  const promptToConnect = view.viewer === "anonymous" && view.window.open;

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

        {promptToConnect && <ConnectPrompt onConnect={onConnect} />}

        <div className="space-y-3 border-t border-border/60 pt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-cyan">
            Steps
          </h3>
          {steps === 0 ? (
            <p className="text-xs leading-relaxed text-muted">
              No steps were recorded for this settlement.
            </p>
          ) : (
            <ol className="space-y-3">
              {view.steps.map(({ step, state }) => (
                <StepItem
                  key={step.step_index}
                  step={step}
                  state={state}
                  onDispute={onDispute}
                />
              ))}
            </ol>
          )}
        </div>
      </Card>
    </section>
  );
}

/**
 * The one line an anonymous viewer gets. They may well be the payer — on
 * another device, or before connecting — so they are told what would let them
 * dispute, and handed the control that does it, rather than shown Dispute
 * buttons that could only fail once a signature was asked for.
 */
function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="clip-cyber-sm flex flex-col gap-3 border border-violet/40 bg-violet/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-relaxed text-text/90">
        If you paid for this workflow, connect that wallet to dispute a step.
      </p>
      <Button
        type="button"
        size="sm"
        onClick={onConnect}
        className="shrink-0 self-start sm:self-auto"
      >
        Connect wallet
      </Button>
    </div>
  );
}

/** `step_index` counts from 0, as the backend enumerates the plan. */
function stepNumber(step: SettlementStepView): number {
  return step.step_index + 1;
}

/** The agent's name, or its id when it registered none. */
function agentLabel(step: SettlementStepView): string {
  return step.agent_name?.trim() || step.agent_id;
}

/**
 * One step of the receipt.
 *
 * Below `sm` everything stacks — identity, then price and state — so a long
 * agent name or output line wraps inside the row instead of pushing it past a
 * 360px screen, where the page's `overflow-x: hidden` would cut it off rather
 * than scroll it.
 */
function StepItem({
  step,
  state,
  onDispute,
}: {
  step: SettlementStepView;
  state: StepDisputeState;
  onDispute: (step: SettlementStepView) => void;
}) {
  const n = stepNumber(step);
  const name = agentLabel(step);
  return (
    <li className="clip-cyber-sm border border-border/60 bg-bg/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center border border-border font-mono text-[11px] text-muted"
          >
            {String(n).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="break-words font-medium leading-snug text-text">
              <span className="sr-only">Step {n}: </span>
              {name}
            </p>
            {name !== step.agent_id && (
              <p className="mt-0.5 break-all font-mono text-[10px] text-muted">
                {step.agent_id}
              </p>
            )}
            {step.output_summary && (
              <p className="mt-2 break-words text-xs leading-relaxed text-muted">
                {step.output_summary}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pl-10 sm:shrink-0 sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
          <StepPrice step={step} charged={state.kind !== "not_charged"} />
          <StepAction step={step} state={state} onDispute={onDispute} />
        </div>
      </div>
      <StepDetail state={state} />
    </li>
  );
}

/**
 * What the step cost. A step that never delivered was never billed, so its
 * price is struck through rather than listed as if it had been paid — a
 * receipt that adds up to more than was charged is not a receipt.
 */
function StepPrice({
  step,
  charged,
}: {
  step: SettlementStepView;
  charged: boolean;
}) {
  const price = formatUsdc(step.price_usdc);
  if (charged) {
    return <span className="font-mono text-sm text-text">{price}</span>;
  }
  return (
    <span className="font-mono text-sm text-muted">
      <span aria-hidden="true" className="line-through">
        {price}
      </span>
      <span className="sr-only">Not charged, priced at {price}</span>
    </span>
  );
}

/**
 * The step's one control, or its outcome. Only `disputable` carries an
 * action. Every other state renders no control at all — not a disabled one:
 * a greyed-out Dispute button tells a viewer who may not dispute that there
 * is something here they are being kept from.
 */
function StepAction({
  step,
  state,
  onDispute,
}: {
  step: SettlementStepView;
  state: StepDisputeState;
  onDispute: (step: SettlementStepView) => void;
}) {
  switch (state.kind) {
    case "disputable":
      return (
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          {/* Several rows each carry a "Dispute" button, so the accessible
              name says which step this one opens — and starts with the
              visible word, so voice control still finds it (WCAG 2.5.3). */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Dispute step ${stepNumber(step)}, ${agentLabel(step)}`}
            onClick={() => onDispute(step)}
          >
            Dispute
          </Button>
          {step.creditable_usdc > 0 && (
            <span className="font-mono text-[10px] text-muted">
              credits {formatUsdc(step.creditable_usdc)} if upheld
            </span>
          )}
        </div>
      );
    case "disputed":
      return <DisputeStatusBadge status={state.dispute.status} />;
    // The price beside this already tells a screen reader "not charged";
    // the badge is the same fact for the eye, so it is not read twice.
    case "not_charged":
      return (
        <span aria-hidden="true">
          <Badge tone="muted">not charged</Badge>
        </span>
      );
    // A closed window is explained once, by the window state above the list;
    // repeating it on every row adds noise and no information.
    case "window_closed":
    // Someone who did not pay is shown the receipt and nothing else — no
    // control, no hint, no disabled button.
    case "view_only":
      return null;
  }
}

/** A full-width line under the step, for the states that owe an explanation. */
function StepDetail({ state }: { state: StepDisputeState }) {
  if (state.kind === "not_charged") {
    return (
      <p className="mt-3 border-t border-border/40 pt-3 text-xs leading-relaxed text-muted">
        This step did not deliver, so it was never charged — there is nothing to
        dispute.
      </p>
    );
  }
  if (state.kind !== "disputed") return null;

  const { dispute, showReason } = state;
  // The reason is one buyer's own words, shown only where the view says so —
  // never inferred here from who happens to be looking. A refund, by
  // contrast, is a public transaction, so its link is evidence for anyone.
  if (!showReason && !dispute.refund_tx) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
      {showReason && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
            your reason
          </p>
          <blockquote className="mt-1 whitespace-pre-line break-words border-l-2 border-violet/40 pl-3 text-xs leading-relaxed text-text/90">
            {dispute.reason}
          </blockquote>
        </div>
      )}
      {dispute.refund_tx && (
        <StellarExpertLink
          kind="tx"
          id={dispute.refund_tx}
          className="inline-block"
        >
          view refund on stellar.expert ▸
        </StellarExpertLink>
      )}
    </div>
  );
}
