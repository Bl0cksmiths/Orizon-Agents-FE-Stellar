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

import { useEffect, useId, useState, type RefObject } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettlementBadge } from "@/components/ui/settlement-badge";
import { KVRow } from "@/components/ui/kv-row";
import { formatAge } from "@/components/ui/stale-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { agentLabel, formatCreditShare } from "@/lib/disputes";
import { useFormatAmount } from "./amount-asset";
import {
  V1_CANNOT_SETTLE,
  type EscrowGeneration,
} from "@/lib/escrow-generation";
import { cn } from "@/lib/utils";
import type {
  CreditPolicy,
  DisputePanelView,
  SettlementRemainder,
  SettlementState,
  DisputeViewer,
  SettlementStepView,
  StepDisputeState,
  StepPayout,
} from "@/lib/types";

import type { ReasonUnlockStatus } from "@/lib/use-reason-unlock";

import { DisputeReceipt } from "./dispute-receipt";
import { ReasonUnlock } from "./reason-unlock";
import { WindowState, formatLocalTime } from "./window-state";

type SettledView = Extract<DisputePanelView, { kind: "settled" }>;

/** The payer's offer to sign for their withheld words, as the page runs it. */
export type ReasonUnlockControl = {
  status: ReasonUnlockStatus;
  onUnlock: () => void;
};

export function ReceiptPanel({
  view,
  headingRef,
  onDispute,
  onConnect,
  reasonUnlock = null,
  escrowGeneration,
}: {
  view: DisputePanelView;
  /**
   * The escrow the deployment settles through (`escrowGeneration`), which
   * decides what a failed settlement did with the buyer's money.
   */
  escrowGeneration: EscrowGeneration;
  /**
   * The settled receipt's own heading, for a page that needs somewhere to put
   * focus. The Dispute button a dialog was opened from is gone by the time it
   * closes — the step shows its receipt instead — and this heading is the one
   * thing on the panel that outlives that swap.
   */
  headingRef?: RefObject<HTMLHeadingElement>;
  /** The payer chose to dispute this step. */
  onDispute: (step: SettlementStepView) => void;
  /** An anonymous viewer asked to connect the wallet that paid. */
  onConnect: () => void;
  /**
   * The page's "show my reason" action, or null where it has none to give —
   * drawn only when the view also says the payer's words were withheld.
   */
  reasonUnlock?: ReasonUnlockControl | null;
}) {
  // Called before any early return: hooks run in the same order every render.
  const headingId = useId();

  if (view.kind === "hidden") return null;
  if (view.kind === "not_settled") {
    return (
      <NotSettled
        headingId={headingId}
        running={view.running}
        settlementState={view.settlementState ?? null}
        stoppedChecking={view.settlementStoppedChecking ?? false}
        generation={escrowGeneration}
      />
    );
  }
  return (
    <SettledReceipt
      view={view}
      headingId={headingId}
      headingRef={headingRef}
      onDispute={onDispute}
      onConnect={onConnect}
      reasonUnlock={reasonUnlock}
      generation={escrowGeneration}
    />
  );
}

/**
 * No receipt yet — or none coming. Kept quiet on purpose: this sits above the
 * trace a buyer came to watch, and "not settled" is an answer, not an alarm.
 * It still says why, because a panel that silently vanishes reads as broken.
 *
 * Escrow v2 gave "why" more answers than "not yet" and "nothing on record": a
 * settlement that failed or went unconfirmed writes no record, but the
 * backend still says which it was, and each one means something different
 * for the buyer's money — so each is said, and the two that leave funds in
 * escrow are not quiet. The sentence is a polite live region: it changes on
 * its own when a running workflow's settlement lands or fails.
 */
function NotSettled({
  headingId,
  running,
  settlementState,
  stoppedChecking,
  generation,
}: {
  headingId: string;
  running: boolean;
  generation: EscrowGeneration;
  settlementState: SettlementState | null;
  /** The panel stopped re-reading an unconfirmed settlement. */
  stoppedChecking: boolean;
}) {
  const said = running ? null : settlementState;
  const loud = said === "failed" || said === "unconfirmed";
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "clip-cyber-sm border px-4 py-3",
        loud
          ? "border-magenta/40 bg-magenta/5"
          : "border-border/60 bg-surface/40",
      )}
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
        {said !== null && <SettlementBadge state={said} />}
        <p role="status" className="text-xs leading-relaxed text-muted">
          {notSettledSentence(running, said, generation)}
          {stoppedChecking && said === "unconfirmed"
            ? " This page has stopped checking for it — reload to look again."
            : null}
        </p>
      </div>
    </section>
  );
}

/**
 * What a receipt with no settlement on record says, by what the backend
 * knows. Each sentence states what is established and no more: "no charge is
 * on record" is not "nothing was charged", and "submitted" is not "paid".
 */
function notSettledSentence(
  running: boolean,
  state: SettlementState | null,
  generation: EscrowGeneration,
): string {
  if (running)
    return "The receipt appears here once this workflow settles, and disputes open then.";
  switch (state) {
    case null:
      // What is known, not more: the panel has found no charge on record,
      // which is not proof that nothing was ever charged — a record can be
      // lost, or land after the wait was spent.
      return "No charge is on record for this workflow, so there is nothing to dispute.";
    case "released":
      return "Nothing was delivered, so the settlement paid no agent and returned the whole authorization from escrow to the wallet that paid. There is nothing to dispute.";
    case "skipped":
      return "Nothing was delivered, so nothing was charged and there is nothing to dispute.";
    case "unconfirmed":
      return "The settlement was sent but is not confirmed on-chain, and it may still land. Until it is confirmed nothing here is shown as paid, and there is nothing to dispute.";
    case "failed":
      return failedSentence(generation);
    case "settled":
      return "This workflow settled on-chain, but its receipt is not on record here, so it cannot be disputed from this page.";
  }
}

/**
 * What a failed settlement did with the buyer's money, by the escrow it went
 * through. Not "your funds": anyone with the link may be reading.
 *
 * - v2 took custody at authorize, so the buyer is told how it comes back —
 *   hedged ("anything … moved"), since a run may have held nothing.
 * - v1 took none and cannot complete a payment at all (D-039): nothing was
 *   charged, and there is nothing to reclaim.
 * - unknown says only what failed.
 */
function failedSentence(generation: EscrowGeneration): string {
  const failed = "The settlement did not go through, so no agent was paid.";
  switch (generation) {
    case "v2":
      return `${failed} Anything the authorization moved into escrow stays there: the platform returns it automatically when it can, and otherwise the wallet that paid can reclaim it once the authorization expires.`;
    case "v1":
      return `${failed} ${V1_CANNOT_SETTLE}`;
    case "unknown":
      return failed;
  }
}

/**
 * One on-chain hash with its explorer link — the trace page's own TxRow
 * shape. The labels match that page's on-chain receipts card too ("charge",
 * "seal"): the same two hashes appear there, and one transaction under two
 * names on one page reads as two transactions.
 *
 * A hash the backend did not record is said to be missing rather than
 * dropped: a receipt with a row quietly absent looks complete when it is not.
 *
 * The link carries the row's own name. `StellarExpertLink`'s default text is
 * the same for every link on the page, and three of them sit here — payer,
 * charge, seal — so a screen reader's links list read "view on stellar.expert"
 * three times over three different resources (WCAG 2.4.4). The dispute
 * receipt already names its two; these are named on the same terms.
 */
function TxRow({ label, hash }: { label: string; hash: string | null }) {
  return (
    <KVRow k={label}>
      {hash ? (
        <>
          <span className="block break-all">{hash}</span>
          {/* At least 24px tall (WCAG 2.5.8), not the 20px its text made. */}
          <StellarExpertLink
            kind="tx"
            id={hash}
            className="mt-1 inline-flex min-h-6 items-center gap-[1ch]"
          >
            view {label} on stellar.expert
            <span aria-hidden="true"> ▸</span>
          </StellarExpertLink>
        </>
      ) : (
        <span className="text-muted">not recorded</span>
      )}
    </KVRow>
  );
}

/** What a settled receipt says about its settlement, by the reported state. */
function settledSentence(
  state: SettlementState,
  generation: EscrowGeneration,
): string {
  switch (state) {
    case "settled":
      return "Settled on-chain: each delivered step with an on-chain operator was paid from escrow in one transaction, and the rest of the authorization went back to the wallet that paid.";
    case "unconfirmed":
      return "The settlement was sent but is not confirmed on-chain yet, and it may still land. Nothing on this receipt is shown as paid until it is.";
    case "failed":
      return failedSentence(generation);
    case "released":
    case "skipped":
      return notSettledSentence(false, state, generation);
  }
}

/**
 * What came back to the payer from escrow. One word for the key, like the
 * rows beside it. A figure only when the backend reported one: the rest of an
 * authorization is never worked out here from the cap and the payouts.
 */
function RemainderRow({ remainder }: { remainder: SettlementRemainder }) {
  const formatAmount = useFormatAmount();
  const value = (() => {
    switch (remainder.kind) {
      case "returned":
        return `${formatAmount(remainder.usdc)} to the payer`;
      case "unreported":
        return "the rest, to the payer · amount not reported";
      case "pending":
        return "not confirmed yet";
      case "held":
        return "none yet · still held in escrow";
    }
  })();
  return (
    <KVRow k="returned">
      {/* break-words, not the row's break-all: this is prose, not a hash. */}
      <span className="break-words">{value}</span>
    </KVRow>
  );
}

/**
 * The coarse cadence the shared stale badge falls back to past an hour. A
 * closed window is at least a whole window old, so nothing finer than this
 * can change in the ages beside it.
 */
const CLOSED_CLOCK_TICK_MS = 300_000;

/**
 * "Now" for the ages on a receipt whose dispute window has closed, or null
 * until the first reading is taken.
 *
 * An open window carries the server's clock inside the view itself —
 * `closesAt` minus what is left — and wants nothing from here. A closed one
 * carries none, and `Date.now()` read during render is an impure render;
 * worse, nothing re-renders a closed window on its own, so every age froze at
 * first paint until an unrelated poll happened to land. Read after the
 * commit, and again on the badge's own coarse cadence.
 *
 * Never a second opinion about the time: the panel's hook stops its own tick
 * exactly when the window closes (`disputeTickMs`), so only one clock runs.
 */
function useClosedWindowClock(open: boolean): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (open) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), CLOSED_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [open]);
  return nowMs;
}

function SettledReceipt({
  view,
  headingId,
  headingRef,
  onDispute,
  onConnect,
  reasonUnlock,
  generation,
}: {
  view: SettledView;
  headingId: string;
  generation: EscrowGeneration;
  headingRef?: RefObject<HTMLHeadingElement>;
  onDispute: (step: SettlementStepView) => void;
  onConnect: () => void;
  reasonUnlock: ReasonUnlockControl | null;
}) {
  const formatAmount = useFormatAmount();
  // "Settled 3h ago" is measured on the server's clock where the view carries
  // it — an open window is closesAt minus what is left — so a skewed laptop
  // clock cannot print a settlement as happening in the future. Once the
  // window has closed the settlement is a whole window old, and a few seconds
  // of skew no longer show in an age that coarse. Until the first reading is
  // taken, the close itself stands in: one frame's worth of under-reporting,
  // against an age measured in hours.
  const closedNowMs = useClosedWindowClock(view.window.open);
  const nowMs = view.window.open
    ? view.window.closesAtMs - view.window.remainingMs
    : (closedNowMs ?? view.window.closesAtMs);
  const steps = view.steps.length;
  // What a settled receipt could always claim before escrow v2: a record on
  // file meant a confirmed charge. A reported state other than `settled`
  // withdraws that, and nothing on the receipt may then read as paid.
  const confirmed =
    view.settlementState == null || view.settlementState === "settled";
  // Only someone the page cannot yet place is told how to become able to
  // dispute. A payer already has the buttons; a connected wallet that did not
  // pay is not the payer, and a prompt would invite them to try.
  const promptToConnect = view.viewer === "anonymous" && view.window.open;
  // The terms travel with the action: shown wherever a Dispute button is,
  // and nowhere a viewer has nothing to act on.
  const canDispute = view.steps.some(
    ({ state }) => state.kind === "disputable",
  );

  return (
    <section aria-labelledby={headingId}>
      <Card className="p-4 sm:p-6">
        {/* Spaced here, not on the Card: Card wraps its children in an inner
            div of its own, so a space-y on the Card never reaches them. */}
        <div className="space-y-6">
          {/* A plain div, not <header>: some engines expose a header inside a
            section as a page banner landmark, and this is not one. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* tabIndex -1: focusable by script as a landing point when
                    a dialog closes onto a page whose opener has gone, never
                    an extra Tab stop on the way down the receipt. */}
                <h2
                  id={headingId}
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-tight focus:outline-none"
                >
                  Receipt
                </h2>
                {/* A backend that reports no state wrote this record only
                    for a confirmed charge, so it reads as settled, as it
                    always has. */}
                <SettlementBadge state={view.settlementState ?? "settled"} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {confirmed ? "Settled" : "Recorded"}{" "}
                <time dateTime={new Date(view.settledAtMs).toISOString()}>
                  {formatAge(nowMs - view.settledAtMs)}
                </time>{" "}
                · {steps} step{steps === 1 ? "" : "s"}
              </p>
            </div>
            {/* Only a confirmed settlement has a total that moved. Any other
                state gets a dash and a reason — never the record's figure,
                which would state as paid what the chain has not confirmed. */}
            <StatTile
              label="total charged"
              value={
                confirmed ? (
                  formatAmount(view.settledUsdc)
                ) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">not confirmed</span>
                  </>
                )
              }
              hint={confirmed ? undefined : "nothing is shown as paid"}
              className="sm:text-right"
            />
          </div>

          {view.settlementState != null &&
            // "Paid from escrow, the rest returned" is v2's story. A v1
            // record under a state-aware backend has no per-step payout,
            // and charged a total from custody it never held.
            (view.settlementState !== "settled" ||
              view.steps.some(({ payout }) => payout !== undefined)) && (
              <p
                role="status"
                className="max-w-2xl text-xs leading-relaxed text-muted"
              >
                {settledSentence(view.settlementState, generation)}
                {view.settlementStoppedChecking
                  ? " This page has stopped checking for it — reload to look again."
                  : null}
              </p>
            )}

          <dl className="space-y-3 font-mono text-sm">
            {/* One word: a two-word key wraps onto two lines beside a
                56-character address on a 360px screen. */}
            <KVRow k="payer">
              <span className="block break-all">{view.payer}</span>
              <StellarExpertLink
                kind="account"
                id={view.payer}
                className="mt-1 inline-flex min-h-6 items-center gap-[1ch]"
              >
                view payer on stellar.expert
                <span aria-hidden="true"> ▸</span>
              </StellarExpertLink>
            </KVRow>
            <KVRow
              k={confirmed ? "settled" : "recorded"}
              value={formatLocalTime(view.settledAtMs)}
            />
            {/* "Still held in escrow" is v2's: v1 held nothing, and while
                the escrow is unknown it is not claimed. */}
            {view.remainder &&
              (view.remainder.kind !== "held" || generation === "v2") && (
                <RemainderRow remainder={view.remainder} />
              )}
            <TxRow label="charge" hash={view.chargeTx} />
            <TxRow label="seal" hash={view.proofTx} />
          </dl>

          <WindowState window={view.window} settledAtMs={view.settledAtMs} />

          {promptToConnect && <ConnectPrompt onConnect={onConnect} />}

          {canDispute && <CreditTerms policy={view.policy} />}

          {/* Above the steps whose words it would show. `reasonsWithheld` is
              the payer alone, so no one else is ever offered a signature. */}
          {view.reasonsWithheld && reasonUnlock !== null && (
            <ReasonUnlock
              status={reasonUnlock.status}
              onUnlock={reasonUnlock.onUnlock}
            />
          )}

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
                {view.steps.map(({ step, state, payout }) => (
                  <StepItem
                    key={step.step_index}
                    step={step}
                    state={state}
                    payout={payout}
                    viewer={view.viewer}
                    nowMs={nowMs}
                    onDispute={onDispute}
                  />
                ))}
              </ol>
            )}
          </div>
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

// Keyed by the policy's own literal types, so a new funder or adjudicator
// cannot reach the buyer without someone writing down what it means for them.
const FUNDED_BY: Record<CreditPolicy["funded_by"], string> = {
  platform: "paid by the platform and never clawed back from the agent",
};
const ADJUDICATED_BY: Record<CreditPolicy["adjudicated_by"], string> = {
  platform:
    "The platform decides each dispute; there is no on-chain arbitration.",
};

/**
 * What a dispute can get the buyer, stated before they commit to one. The
 * figures are the backend's policy in force, never a number written into the
 * UI: a buyer shown the wrong share has been promised money they will not get.
 *
 * The share is `formatCreditShare`'s, the same one the dispute form prints.
 * This line used `Intl.NumberFormat` at one decimal place, which read 0.0625
 * as "6.3%" beside the form's "6.25%" — and rounded UP, promising a larger
 * share than the policy pays.
 */
function CreditTerms({ policy }: { policy: CreditPolicy }) {
  return (
    <p className="max-w-2xl text-xs leading-relaxed text-muted">
      <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
        terms ·{" "}
      </span>
      {/* A policy that credits nothing is stated as nothing — the form says
          it the same way — never as "0%" of a charge, which reads as a
          figure still owed. */}
      {policy.credited_fraction > 0 ? (
        <>
          An upheld dispute credits{" "}
          {formatCreditShare(policy.credited_fraction)} of that step&apos;s
          charge back to you, {FUNDED_BY[policy.funded_by]}.
        </>
      ) : (
        "Under the current terms an upheld dispute credits nothing back."
      )}{" "}
      {ADJUDICATED_BY[policy.adjudicated_by]}
    </p>
  );
}

/** `step_index` counts from 0, as the backend enumerates the plan. */
function stepNumber(step: SettlementStepView): number {
  return step.step_index + 1;
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
  payout,
  viewer,
  nowMs,
  onDispute,
}: {
  step: SettlementStepView;
  state: StepDisputeState;
  /** Escrow v2's word on this step's payout; absent on a v1 receipt. */
  payout?: StepPayout;
  viewer: DisputeViewer;
  /** The receipt's clock, on the server's time where the view carries it. */
  nowMs: number;
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
          <StepPrice
            step={step}
            charged={
              state.kind === "not_charged"
                ? "no"
                : state.kind === "payout_unconfirmed"
                  ? "pending"
                  : "yes"
            }
          />
          {payout && <StepPayoutLine step={step} payout={payout} />}
          <StepAction step={step} state={state} onDispute={onDispute} />
        </div>
      </div>
      <StepDetail step={step} state={state} viewer={viewer} nowMs={nowMs} />
    </li>
  );
}

/**
 * What the step cost. A step that was not charged has its price struck
 * through rather than listed as if it had been paid — a receipt that adds up
 * to more than was charged is not a receipt.
 */
function StepPrice({
  step,
  charged,
}: {
  step: SettlementStepView;
  /** `pending`: an unconfirmed settlement — neither paid nor struck off. */
  charged: "yes" | "no" | "pending";
}) {
  const formatAmount = useFormatAmount();
  const price = formatAmount(step.price_usdc);
  if (charged === "yes") {
    return <span className="font-mono text-sm text-text">{price}</span>;
  }
  if (charged === "pending") {
    return (
      <span className="font-mono text-sm text-muted">
        <span aria-hidden="true">{price}</span>
        <span className="sr-only">Payout not confirmed, priced at {price}</span>
      </span>
    );
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
 * What escrow v2 paid this step's operator, stated as far as the backend has
 * confirmed it (`stepPayout` decides; this only draws). A paid step links the
 * settlement transaction its payout happened in, named for its step so a
 * links list tells one row's link from another's (WCAG 2.4.4). A seeded
 * platform agent's step is never shown as paid: it has no on-chain owner, so
 * the settlement left it out and its share went back to the payer.
 */
function StepPayoutLine({
  step,
  payout,
}: {
  step: SettlementStepView;
  payout: StepPayout;
}) {
  const formatAmount = useFormatAmount();
  const label = "font-mono text-[10px] leading-relaxed";
  switch (payout.kind) {
    case "paid":
      return (
        <span className="flex flex-col items-start gap-1 sm:items-end">
          <span className={cn(label, "text-emerald-300")}>
            paid {formatAmount(payout.usdc)} to the operator
          </span>
          {payout.tx && (
            <StellarExpertLink
              kind="tx"
              id={payout.tx}
              className="inline-flex min-h-6 items-center gap-[1ch]"
            >
              view step {stepNumber(step)} payout on stellar.expert
              <span aria-hidden="true"> ▸</span>
            </StellarExpertLink>
          )}
        </span>
      );
    case "platform":
      return (
        <span className={cn(label, "text-muted")}>
          {step.delivered ? "delivered · " : ""}not billed (platform agent)
        </span>
      );
    case "not_billed":
      return (
        <span className={cn(label, "text-muted")}>
          {step.delivered ? "delivered · " : ""}
          {NOT_BILLED[payout.reason]}
        </span>
      );
    case "pending":
      return (
        <span className={cn(label, "text-muted")}>payout not confirmed</span>
      );
    case "not_paid":
      return <span className={cn(label, "text-muted")}>not paid</span>;
    case "unreported":
      return (
        <span className={cn(label, "text-muted")}>payout not reported</span>
      );
  }
}

/** Why a delivered step was paid nothing, in the buyer's words. */
const NOT_BILLED: Record<
  Extract<StepPayout, { kind: "not_billed" }>["reason"],
  string
> = {
  free: "not billed (free step)",
  owner_unreadable: "not paid (operator could not be read)",
  over_cap: "not paid (over the authorized maximum)",
};

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
  // Before the switch: hooks, called whichever state the step is in.
  const creditId = useId();
  const formatAmount = useFormatAmount();
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
            // What an uphold would credit is read with the action it follows.
            aria-describedby={step.creditable_usdc > 0 ? creditId : undefined}
            onClick={() => onDispute(step)}
          >
            Dispute
          </Button>
          {/* "up to": the credit is a ceiling the backend bounds by what the
              settlement moved (D-071), as the dispute receipt says it. */}
          {step.creditable_usdc > 0 && (
            <span id={creditId} className="font-mono text-[10px] text-muted">
              credits up to {formatAmount(step.creditable_usdc)} if upheld
            </span>
          )}
        </div>
      );
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
    // Explained under the row; nothing to act on until the payout confirms.
    case "payout_unconfirmed":
    // The dispute's receipt under the row opens with its status badge; a
    // second badge up here would say the same thing twice in one step.
    case "disputed":
      return null;
  }
}

/**
 * A full-width block under the step, for the states that owe an explanation:
 * why an uncharged step offers nothing, and a disputed step's whole receipt.
 */
function StepDetail({
  step,
  state,
  viewer,
  nowMs,
}: {
  step: SettlementStepView;
  state: StepDisputeState;
  viewer: DisputeViewer;
  nowMs: number;
}) {
  if (state.kind === "not_charged") {
    return (
      <p className="mt-3 border-t border-border/40 pt-3 text-xs leading-relaxed text-muted">
        {/* Worded for every way a step ends up here — it did not deliver,
            it was priced at zero, or the whole settlement moved nothing — so
            it never claims a cause the view did not establish. */}
        Nothing was charged for this step, so there is nothing to dispute.
      </p>
    );
  }
  if (state.kind === "payout_unconfirmed") {
    return (
      <p className="mt-3 border-t border-border/40 pt-3 text-xs leading-relaxed text-muted">
        This step&apos;s payout is not confirmed on-chain yet, so it cannot be
        disputed until it is.
      </p>
    );
  }
  if (state.kind !== "disputed") return null;
  // Drawn from the receipt the view derived, never from the raw dispute:
  // which reasons this viewer may read and how far each transaction is
  // confirmed were decided there, and re-deciding them here is how a
  // non-payer would come to read a buyer's words.
  return (
    <DisputeReceipt
      view={state.receipt}
      agentName={agentLabel(step)}
      viewer={viewer}
      nowMs={nowMs}
      className="mt-3 border-t border-border/40 pt-3"
    />
  );
}
