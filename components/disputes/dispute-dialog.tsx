"use client";

/**
 * The form a buyer fills in to dispute one settled step (story 4.05).
 *
 * It is the one consequential action in the dispute flow, so before anything
 * is signed it states, in this order, everything the buyer is agreeing to: the
 * step and what it produced, what it cost and what an upheld dispute would
 * credit, the terms that credit is paid under, the buyer's own reason, and
 * what signing will and will not do. The story's words: "the buyer should not
 * have to guess what they are asking for."
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorNote } from "@/components/ui/error-note";
import { KVRow } from "@/components/ui/kv-row";
import {
  DisputeRefusal,
  MAX_DISPUTE_REASON_CHARS,
  agentLabel,
  disputeErrorCode,
  formatCreditShare,
  formatUsdc,
  raiseDispute,
} from "@/lib/disputes";
import { rateLimitMessage } from "@/lib/rate-limit-message";
import type {
  CreditPolicy,
  Dispute,
  SettlementStepView,
  SettlementView,
} from "@/lib/types";
import { inputCls } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";
import { classifyError } from "@/lib/wallet-errors";

import { disputeStatusLabel } from "./dispute-status-badge";

/**
 * Why the dialog asked to be closed, passed to `onClose`. The page closes it
 * for every reason alike; the reason says whether its receipt is still true.
 *
 * - `"dismissed"` — the buyer closed it: Cancel, ✕, Escape, the backdrop, or
 *   Done after a dispute was raised (which `onSubmitted` already reported).
 *   Nothing changed that the page does not know about.
 * - `"duplicate_dispute"` — the step already had a dispute: raised from
 *   another tab, or by a submit that raced this one. Not a failure, and not
 *   this dialog's dispute to hand to `onSubmitted`, so the dialog closes
 *   ITSELF at once with this reason — and with the original dispute the 409
 *   carried, when it carried one this build can read. The page shows that
 *   dispute on the step at once (D-057) and refetches; a re-read that fails
 *   must not leave the step offering a second one.
 * - `"stale"` — the buyer closed it after a refusal that proves the page's
 *   picture of this step is out of date: the window has closed, or the step
 *   was never settled or never charged. The page should refetch.
 */
export type DisputeDialogCloseReason =
  "dismissed" | "duplicate_dispute" | "stale";

export type DisputeDialogProps = {
  /** Shown only while this is true AND both `step` and `settlement` are set. */
  open: boolean;
  /** The step being disputed. */
  step: SettlementStepView | null;
  /** The settlement the step was charged under; its `policy` is the terms. */
  settlement: SettlementView | null;
  /**
   * The dialog asks to be closed; the page closes it by clearing `open`. Refetch
   * on any reason but `"dismissed"` (see DisputeDialogCloseReason). A handler
   * that takes no argument still type-checks — it just cannot refetch.
   */
  onClose: (
    reason: DisputeDialogCloseReason,
    /** On `"duplicate_dispute"`, the step's original dispute, if known. */
    existing?: Dispute | null,
  ) => void;
  /** Called once, with the stored dispute, when the backend accepts it. */
  onSubmitted: (dispute: Dispute) => void;
  /**
   * Where focus goes when this closes and the Dispute button it was opened
   * from is no longer on the page — which is the HAPPY path: raising a
   * dispute turns the step from disputable to disputed, so the button is gone
   * before the buyer presses Done. Without it focus lands on `document.body`.
   */
  returnFocusRef?: RefObject<HTMLElement>;
  /**
   * Whether the dispute window is still open, as the page's panel judges it
   * on the server-corrected clock. A dialog left open across the close must
   * not go on offering a signature the server will refuse (D-060): once this
   * is false the form says the window has closed, offers only a way out, and
   * never asks the wallet for anything.
   */
  windowOpen: boolean;
  /** The server's clock minus this browser's, for `raiseDispute`. */
  offsetMs: number;
  /**
   * When the window closes, in epoch ms on the server's clock — exact, where
   * the settlement's `window_closes_at` may have been rounded to seconds.
   */
  windowClosesAtMs: number;
};

/**
 * The mono section label the console uses above a block ("▸ intent"). With
 * `htmlFor` the heading's text is also the field's <label>, so the reason's
 * visible title and its accessible name are one and the same.
 */
function SectionLabel({
  id,
  htmlFor,
  children,
}: {
  id: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <h3
      id={id}
      className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan"
    >
      <span aria-hidden>▸ </span>
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : children}
    </h3>
  );
}

/** Within this many characters of the cap the counter starts to speak. */
const COUNTER_WARN_AT = 25;

/**
 * The counts the EAR is told about. The visible counter stays live on every
 * keystroke — that is for the eye, which can ignore it — but a live region
 * rewritten on every keystroke inside the warn zone reads twenty-five counts
 * over a screen-reader user's own echo, while they compose the very words the
 * platform will judge them on. Three landmarks say the same thing.
 */
const COUNTER_SPEAKS_AT = [0, 10, COUNTER_WARN_AT] as const;

/**
 * The landmark `remaining` has reached, or null while it is above them all.
 * ASCENDING order matters: the first one the count is at or under is the
 * nearest it has crossed, and a descending list would answer 25 all the way
 * to the cap and announce once for the whole zone.
 */
function counterThreshold(remaining: number): number | null {
  return COUNTER_SPEAKS_AT.find((at) => remaining <= at) ?? null;
}

/**
 * What the counter says out loud: written only when `remaining` crosses into
 * a new landmark, and cleared once it climbs back above all of them, so the
 * zone can be entered again and announced again.
 *
 * The sentence carries the REAL count, not the landmark, so a paste that
 * drops it from 40 to 6 is announced as 6. Derived during render, as the
 * receipt's status announcement is, so the words land in the same commit as
 * the count they describe.
 */
function useCounterAnnouncement(remaining: number): string {
  const threshold = counterThreshold(remaining);
  const [spoken, setSpoken] = useState(threshold);
  const [notice, setNotice] = useState("");
  if (threshold !== spoken) {
    setSpoken(threshold);
    setNotice(
      threshold === null
        ? ""
        : remaining === 0
          ? "Character limit reached."
          : `${remaining} character${remaining === 1 ? "" : "s"} left.`,
    );
  }
  return notice;
}

/** Why an attempt failed, in the buyer's words, and what can follow it. */
type Failure = {
  message: string;
  /**
   * What the footer offers next: the same submit again, or only a way out
   * when nothing inside this dialog can change the answer.
   */
  next: "retry" | "close";
  /** The reason itself is what has to change. */
  field: boolean;
  /** Proves the page's view of this step is out of date. */
  stale: boolean;
};

/**
 * One state at a time, never a set of booleans that can disagree:
 *
 *   idle → signing → submitting → done
 *              ↘          ↘
 *               error ←────┘   (or back to idle, when the buyer cancelled)
 *
 * `signing` covers fetching the challenge as well as the wallet prompt, since
 * the wallet is asked the moment the challenge lands; `prompt` says which
 * part is on screen, and `again` marks the one re-sign `raiseDispute` asks for
 * when a challenge expired while the first prompt sat open.
 */
type FormState =
  | { kind: "idle"; notice: string | null }
  | { kind: "signing"; prompt: "preparing" | "wallet" | "again" }
  | { kind: "submitting" }
  | { kind: "done"; dispute: Dispute }
  | { kind: "error"; failure: Failure };

const IDLE: FormState = { kind: "idle", notice: null };

const GENERIC_FAILURE: Failure = {
  message:
    "Your dispute couldn't be submitted. Your reason is still here — try again.",
  next: "retry",
  field: false,
  stale: false,
};

/** The same submit can succeed on a second press. */
const retryable = (message: string): Failure => ({
  message,
  next: "retry",
  field: false,
  stale: false,
});

/** Nothing in this dialog can change the answer; only a way out is offered. */
const closeOnly = (message: string, stale: boolean): Failure => ({
  message,
  next: "close",
  field: false,
  stale,
});

const CANCELLED_NOTICE = "You cancelled the signature. Nothing was sent.";

/**
 * A failure inside the wallet, classified exactly as the bind page classifies
 * one — lib/wallet-errors' `classifyError`, whose `user_rejected` is a
 * declined or closed prompt. That is the buyer changing their mind, not a
 * failure, so it answers null and the form goes back to idle, reason intact.
 *
 * The classifier's own sentences are not reused: they were written for
 * transactions ("click Register again", "nothing was sent on-chain"), and
 * this prompt signs a message.
 */
function walletFailure(err: unknown): Failure | null {
  switch (classifyError(err).kind) {
    case "user_rejected":
      return null;
    case "wallet_locked":
      return retryable(
        "Your wallet is locked. Unlock it and try again — nothing was sent.",
      );
    case "wallet_not_found":
      return retryable(
        "No Stellar wallet answered in this browser. Check that the wallet that paid is installed and enabled, then try again.",
      );
    default:
      return retryable(
        "Your wallet couldn't sign the message, so nothing was sent. Check your wallet and try again.",
      );
  }
}

/**
 * A refusal in the buyer's words, keyed on the machine-readable code and
 * never on the backend's own sentence, which may be reworded at any time.
 * Anything without a code this form knows — a dropped connection, a second
 * expired challenge — is the generic, retryable failure: the reason stays
 * and the same button tries again.
 */
function refusalFailure(err: unknown, payer: string): Failure {
  switch (disputeErrorCode(err)) {
    case "not_the_payer":
      // Not stale: the receipt is right, the wrong wallet is connected.
      return closeOnly(
        `The connected wallet isn't the one that paid for this workflow. Close this, connect ${shortAddress(payer)}, and try again.`,
        false,
      );
    case "dispute_window_closed":
      return closeOnly(WINDOW_CLOSED, true);
    case "step_not_settled":
      return closeOnly(
        "This step was never settled, so there is nothing to dispute on it.",
        true,
      );
    case "nothing_was_charged":
      return closeOnly(
        "Nothing was charged for this step, so there is nothing to dispute on it.",
        true,
      );
    // The platform has no settlement under this job: the receipt on the page
    // is the thing that is wrong, and signing again would ask the same
    // question of the same missing record.
    case "unknown_job":
      return closeOnly(
        "The platform has no record of this settlement, so this step can't be disputed from here. Nothing was sent.",
        true,
      );
    // The wallet's signature could not be read. Another press costs another
    // signature from the same wallet, which would come back the same way —
    // so the form offers a way out, not a second prompt.
    case "signature_malformed":
      return closeOnly(
        "Your wallet returned a signature the platform couldn't read, so nothing was sent. Signing again with it would fail the same way — check that the wallet is up to date, then raise the dispute again.",
        false,
      );
    case "rate_limited":
      return retryable(
        rateLimitMessage(err) ??
          "Too many requests — wait a moment and try again. Nothing was lost.",
      );
    // The reason itself was refused — blank, too long, or refused by the
    // platform's own bounds (D-061). A field failure, not a generic one: it
    // is marked on the field, described by the platform's own sentence, and
    // focus goes to the words that have to change, not to a retry that would
    // send them unchanged.
    case "reason_invalid":
      return {
        message:
          err instanceof DisputeRefusal
            ? err.message
            : "The platform couldn't accept this reason. Say what went wrong with this step, in words, in at most 500 characters.",
        next: "retry",
        field: true,
        stale: false,
      };
    default:
      return GENERIC_FAILURE;
  }
}

/** The one live line under the form: what is happening right now. */
function statusLine(state: FormState, walletName: string | null): string {
  switch (state.kind) {
    case "idle":
      return state.notice ?? "";
    case "signing":
      if (state.prompt === "preparing") return "Preparing the message to sign…";
      if (state.prompt === "again") {
        return "The first signature expired before it could be used. Waiting for your wallet to sign once more…";
      }
      return `Waiting for your wallet… Approve the signature in ${walletName ?? "your wallet"}.`;
    case "submitting":
      return "Signed. Submitting your dispute…";
    case "done":
      return "Your dispute was raised.";
    case "error":
      return "";
  }
}

/** The dispute as the backend stored it, shown once the form is done. */
function DisputeRaised({
  dispute,
  step,
}: {
  dispute: Dispute;
  step: SettlementStepView;
}) {
  return (
    <div className="space-y-4">
      <Badge tone="success" dot>
        dispute raised
      </Badge>
      <p className="text-sm leading-relaxed text-text">
        {/* `agentLabel`, not `agent_name ?? agent_id`: a registered name that
            is present but empty passed the nullish check and printed "Step 2
            () is now under review." — an empty parenthesis in the record of a
            consequential action. */}
        {/* "Up to": the figure is a ceiling, bounded by what the settlement
            actually moved, never a promise of that exact sum (D-071) — the
            receipt below says it the same way. */}
        Step {stepNumber(step)} ({agentLabel(step)}) is now under review.{" "}
        {dispute.creditable_usdc > 0 ? (
          <>
            If the platform upholds your dispute, up to{" "}
            <span className="font-mono text-cyan">
              {formatUsdc(dispute.creditable_usdc)}
            </span>{" "}
            is credited to the wallet that paid.
          </>
        ) : (
          "Under the current terms an upheld dispute credits nothing back."
        )}{" "}
        This receipt shows the outcome once it is decided.
      </p>
      <dl className="space-y-2 font-mono text-sm">
        <KVRow k="Status">
          {/* The badge's own words, never the wire's. A backend that answers
              a POST with anything but `open` — which it may yet — would
              otherwise print its own state name ("crediting", "credited") at
              a buyer, which is what `disputeStatusLabel` exists to stop. */}
          <Badge tone="cyan">{disputeStatusLabel(dispute.status)}</Badge>
        </KVRow>
        <KVRow k="Charged" value={formatUsdc(dispute.charged_usdc)} />
        <KVRow
          k="Credited if upheld"
          value={upTo(dispute.creditable_usdc)}
          valueClassName="text-cyan"
        />
      </dl>
      <blockquote className="break-words border-l-2 border-violet/60 bg-bg/40 px-3 py-2 text-sm text-text">
        {dispute.reason}
      </blockquote>
    </div>
  );
}

/** Steps count from 0 on the wire, as the backend enumerates the plan. */
const stepNumber = (step: SettlementStepView) => step.step_index + 1;

/**
 * An upheld dispute's credit, as the ceiling it is (D-071). The backend
 * bounds it by what the settlement actually moved, so the figure is the most
 * that can be credited, never a sum the buyer is owed to the unit — and the
 * receipt already prints it as "Up to".
 */
const upTo = (usdc: number) =>
  usdc > 0 ? `Up to ${formatUsdc(usdc)}` : "Nothing, under the current terms";

/** GABC…WXYZ — enough of a G-address to recognise the wallet by. */
const shortAddress = (address: string) =>
  `${address.slice(0, 4)}…${address.slice(-4)}`;

// The two literal fields are switched on exhaustively: widen either type and
// this stops compiling, rather than describing a new funder or adjudicator
// with the old sentence.
function fundedByLine(funder: CreditPolicy["funded_by"]): string {
  switch (funder) {
    case "platform":
      return "The platform pays the credit. Nothing is clawed back from the agent.";
    default: {
      const unhandled: never = funder;
      return unhandled;
    }
  }
}

function adjudicatedByLine(judge: CreditPolicy["adjudicated_by"]): string {
  switch (judge) {
    case "platform":
      return "The platform reviews the dispute and decides. There is no on-chain arbitration.";
    default: {
      const unhandled: never = judge;
      return unhandled;
    }
  }
}

/**
 * The terms in the buyer's words, read off the policy the backend served and
 * never written into the UI: what the buyer reads is what is in force.
 */
function creditTerms(policy: CreditPolicy): string[] {
  const credit =
    policy.credited_fraction > 0
      ? `An upheld dispute credits ${formatCreditShare(policy.credited_fraction)} of this step's charge back to the wallet that paid.`
      : "Under the current terms an upheld dispute credits nothing back.";
  return [
    credit,
    fundedByLine(policy.funded_by),
    adjudicatedByLine(policy.adjudicated_by),
  ];
}

/**
 * One draft per step. The page may hand back `null` between opens, so the key
 * only moves when a DIFFERENT step arrives: closing by accident and reopening
 * the same step finds the reason still there, while a new step starts clean.
 */
export function DisputeDialog(props: DisputeDialogProps) {
  const { step, settlement } = props;
  const targetKey =
    step && settlement ? `${settlement.job_id_hex}:${step.step_index}` : null;
  const [draftKey, setDraftKey] = useState(targetKey);
  if (targetKey !== null && targetKey !== draftKey) setDraftKey(targetKey);
  return <DisputeForm key={draftKey ?? "none"} {...props} />;
}

/** What the form says once the window has closed under it. */
const WINDOW_CLOSED =
  "The dispute window for this workflow has closed, so this step can no longer be disputed.";

function DisputeForm({
  open,
  step,
  settlement,
  onClose,
  onSubmitted,
  returnFocusRef,
  windowOpen,
  offsetMs,
  windowClosesAtMs,
}: DisputeDialogProps) {
  const wallet = useWallet();
  const shown = open && step !== null && settlement !== null;
  const [reason, setReason] = useState("");
  const [state, setState] = useState<FormState>(IDLE);
  // A second guard beside the disabled button: a double click can land
  // before React has re-rendered the button disabled.
  const inFlight = useRef(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  const uid = useId();
  const ids = {
    form: `${uid}-form`,
    step: `${uid}-step`,
    amounts: `${uid}-amounts`,
    terms: `${uid}-terms`,
    reasonHeading: `${uid}-reason-heading`,
    reason: `${uid}-reason`,
    reasonHint: `${uid}-reason-hint`,
    reasonCount: `${uid}-reason-count`,
    error: `${uid}-error`,
  };
  // Counted exactly as `maxLength` counts (UTF-16 units), so the counter and
  // the field's own limit can never disagree about what fits.
  const remaining = MAX_DISPUTE_REASON_CHARS - reason.length;
  const countdownNotice = useCounterAnnouncement(remaining);

  const busy = state.kind === "signing" || state.kind === "submitting";
  const finished =
    state.kind === "done" ||
    (state.kind === "error" && state.failure.next === "close");
  const canSubmit =
    reason.trim().length > 0 &&
    !busy &&
    !finished &&
    windowOpen &&
    wallet.address !== null;
  // Read by the signing wrapper at the moment it would prompt, not at the
  // press: the window can close while the challenge is being fetched.
  const windowOpenRef = useRef(windowOpen);
  windowOpenRef.current = windowOpen;

  // The window closing under a form that is waiting on the buyer — fresh,
  // or showing a failure it offers to retry — is an answer, not a disabled
  // button with no reason given: it says so, and offers only the way back to
  // a receipt that now needs reading again. A sequence already running is
  // left to finish — the wrapper below refuses its signature itself — and a
  // raised dispute stays raised.
  useEffect(() => {
    if (windowOpen) return;
    setState((current) =>
      current.kind === "idle" ||
      (current.kind === "error" && current.failure.next === "retry")
        ? { kind: "error", failure: closeOnly(WINDOW_CLOSED, true) }
        : current,
    );
  }, [windowOpen]);

  // The submit button is disabled while the sequence runs, and browsers drop
  // focus from a control the moment it is disabled — a keyboard user would be
  // left on the page body. When the attempt settles, focus goes to what comes
  // next: the reason when it is the reason that must change, otherwise the
  // footer's primary action (try again, back to the receipt, or Done).
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const fixReason = state.kind === "error" && state.failure.field;
      (fixReason ? reasonRef : primaryRef).current?.focus();
    }
    wasBusy.current = busy;
  }, [busy, state]);

  // Closing retires the last attempt's message. A reopened dialog opens on
  // the reason as it was left, not on an error from before — which may no
  // longer be true (the buyer has since connected the wallet that paid). A
  // raised dispute stays raised, and a sequence still running keeps its state
  // until it settles.
  useEffect(() => {
    if (shown) return;
    setState((current) =>
      current.kind === "done" ||
      current.kind === "signing" ||
      current.kind === "submitting"
        ? current
        : IDLE,
    );
  }, [shown]);

  async function submit() {
    if (!canSubmit || inFlight.current) return;
    if (!step || !settlement || !wallet.address) return;
    inFlight.current = true;
    const payer = wallet.address;
    // What happened inside the wallet, recorded where it happened rather than
    // guessed from whatever raiseDispute rethrows: a wallet error and a
    // backend refusal need different words, and only this wrapper knows for
    // certain which one it was.
    const attempt: {
      signatures: number;
      walletError: { cause: unknown } | null;
    } = { signatures: 0, walletError: null };
    setState({ kind: "signing", prompt: "preparing" });

    // Handed to raiseDispute in place of the wallet's own signMessage so the
    // form can follow the sequence it runs: the prompt opening, the signature
    // coming back, and a second prompt if the first challenge expired.
    const signMessage = async (message: string): Promise<string> => {
      // Never a prompt for a window the page has watched close: the server
      // would refuse the signature, and the buyer would have signed for
      // nothing (D-060). Refused as the server would refuse it, so it lands
      // on the same screen.
      if (!windowOpenRef.current) {
        throw new DisputeRefusal(
          "dispute_window_closed",
          "The dispute window for this workflow has closed.",
        );
      }
      attempt.signatures += 1;
      setState({
        kind: "signing",
        prompt: attempt.signatures > 1 ? "again" : "wallet",
      });
      let signature: string;
      try {
        signature = await wallet.signMessage(message);
      } catch (cause) {
        attempt.walletError = { cause };
        throw cause;
      }
      setState({ kind: "submitting" });
      return signature;
    };

    try {
      const dispute = await raiseDispute({
        settlement,
        step,
        reason,
        payer,
        signMessage,
        // Judged on the server's clock, as the server will judge it.
        offsetMs,
        windowClosesAtMs,
      });
      setState({ kind: "done", dispute });
      onSubmitted(dispute);
    } catch (err) {
      if (attempt.walletError) {
        const failure = walletFailure(attempt.walletError.cause);
        setState(
          failure
            ? { kind: "error", failure }
            : { kind: "idle", notice: CANCELLED_NOTICE },
        );
      } else if (disputeErrorCode(err) === "duplicate_dispute") {
        // The step already has its dispute: an answer, not an error. The
        // page shows the one the 409 carried at once, and refetches.
        setState(IDLE);
        onClose(
          "duplicate_dispute",
          err instanceof DisputeRefusal ? err.dispute : null,
        );
      } else {
        setState({
          kind: "error",
          failure: refusalFailure(err, settlement.payer),
        });
      }
    } finally {
      inFlight.current = false;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  // Ctrl/Cmd+Enter submits from inside the reason, as in most message boxes;
  // a plain Enter stays a new line.
  function handleReasonKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  // Editing the reason retires whatever the last attempt concluded; leaving a
  // "try again" on screen over a different reason would describe the wrong one.
  function editReason(value: string) {
    setReason(value);
    if (
      (state.kind === "idle" && state.notice !== null) ||
      (state.kind === "error" && state.failure.next === "retry")
    ) {
      setState(IDLE);
    }
  }

  // Every way the buyer can close the dialog goes through here, so a stale
  // receipt is reported however they leave.
  function requestClose() {
    onClose(
      state.kind === "error" && state.failure.stale ? "stale" : "dismissed",
    );
  }

  const status = statusLine(state, wallet.walletName);
  const reasonRefused = state.kind === "error" && state.failure.field;

  const footer = (
    <div className="space-y-3">
      {state.kind === "error" && (
        <ErrorNote id={ids.error}>{state.failure.message}</ErrorNote>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Always mounted, so a screen reader is already listening when the
            text changes; out of the layout while it has nothing to say. */}
        <p
          role="status"
          className={cn(
            status ? "min-w-0 font-mono text-xs leading-relaxed" : "sr-only",
            busy ? "text-cyan" : "text-muted",
          )}
        >
          {busy && (
            <span
              aria-hidden
              className="mr-2 inline-block h-1.5 w-1.5 animate-pulseGlow rounded-full bg-cyan align-middle shadow-[0_0_8px_#00FFD1]"
            />
          )}
          {status}
        </p>
        <div className="flex shrink-0 items-center justify-end gap-3 sm:ml-auto">
          {finished ? (
            <Button
              ref={primaryRef}
              type="button"
              variant={state.kind === "done" ? "primary" : "outline"}
              onClick={requestClose}
              className="flex-1 sm:flex-none"
            >
              {/* Not "Close": the ✕ in the header already carries that
                  name, and two buttons with one name tell a screen reader
                  user nothing about which is which. */}
              {state.kind === "done" ? "Done" : "Back to the receipt"}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={requestClose}
                disabled={busy}
              >
                Cancel
              </Button>
              {/* While the sequence runs the button is MARKED unavailable,
                  not disabled: a browser blurs a control the moment it is
                  disabled, and this press opens a wallet prompt that can sit
                  open for half a minute with Escape correctly vetoed — which
                  left a keyboard user on <body>, with no position in the
                  dialog and no way out of it. Nothing is weakened by keeping
                  it pressable: `submit()` refuses while `canSubmit` is false,
                  and the `inFlight` ref refuses what a re-render could not
                  catch in time. */}
              <Button
                ref={primaryRef}
                type="submit"
                form={ids.form}
                disabled={!canSubmit && !busy}
                aria-disabled={busy || undefined}
                className="flex-1 aria-disabled:opacity-50 sm:flex-none"
              >
                {busy && <span aria-hidden>◉</span>}
                {state.kind === "signing"
                  ? "Signing…"
                  : state.kind === "submitting"
                    ? "Submitting…"
                    : state.kind === "error"
                      ? "Sign and submit again"
                      : "Sign and submit"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog
      open={shown}
      onClose={requestClose}
      // Nothing dismisses the dialog mid-sequence: closing it would not stop
      // the wallet prompt or the request, only hide their outcome.
      dismissible={!busy}
      returnFocusRef={returnFocusRef}
      eyebrow="dispute"
      title={step ? `Dispute step ${stepNumber(step)}` : "Dispute a step"}
      // The title stays put so the dialog's name never changes under a
      // screen reader; the line beneath it says where things stand.
      description={
        state.kind === "done"
          ? "Your dispute is on record. The platform reviews it next."
          : "Ask the platform to credit part of what this step cost."
      }
      footer={footer}
    >
      {step &&
        settlement &&
        (state.kind === "done" ? (
          <DisputeRaised dispute={state.dispute} step={step} />
        ) : (
          <form
            id={ids.form}
            onSubmit={handleSubmit}
            noValidate
            className="space-y-6"
          >
            <section aria-labelledby={ids.step} className="space-y-2">
              <SectionLabel id={ids.step}>The step</SectionLabel>
              <p className="text-sm">
                <span className="font-mono text-muted">
                  Step {stepNumber(step)}
                </span>
                {/* The dot is for the eye; a screen reader gets a pause. */}
                <span aria-hidden className="text-muted">
                  {" · "}
                </span>
                <span className="sr-only">, </span>
                <span className="break-all font-semibold text-text">
                  {agentLabel(step)}
                </span>
              </p>
              {step.output_summary ? (
                <blockquote className="break-words border-l-2 border-violet/60 bg-bg/40 px-3 py-2 text-sm text-text">
                  {step.output_summary}
                </blockquote>
              ) : (
                <p className="text-sm text-muted">
                  No summary of what this step produced was recorded for this
                  run.
                </p>
              )}
            </section>

            <section aria-labelledby={ids.amounts} className="space-y-2">
              <SectionLabel id={ids.amounts}>What is at stake</SectionLabel>
              <dl className="space-y-2 font-mono text-sm">
                <KVRow
                  k="Charged for this step"
                  value={formatUsdc(step.price_usdc)}
                />
                <KVRow
                  k="Credited if upheld"
                  value={upTo(step.creditable_usdc)}
                  valueClassName="text-cyan"
                />
              </dl>
            </section>

            <section aria-labelledby={ids.terms} className="space-y-2">
              <SectionLabel id={ids.terms}>The terms</SectionLabel>
              <ul className="space-y-1.5 text-sm text-text">
                {creditTerms(settlement.policy).map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[0.45rem] h-1 w-1 shrink-0 bg-violet"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby={ids.reasonHeading} className="space-y-2">
              <SectionLabel id={ids.reasonHeading} htmlFor={ids.reason}>
                Your reason
              </SectionLabel>
              <p id={ids.reasonHint} className="text-xs text-muted">
                Required. Say what went wrong with this step — the platform
                reads this when it decides.
              </p>
              {/* Capped here, not trimmed later: the backend cuts a longer
                  reason silently, and a buyer must never be judged on words
                  they did not see go missing. */}
              <textarea
                ref={reasonRef}
                id={ids.reason}
                value={reason}
                onChange={(e) => editReason(e.target.value)}
                onKeyDown={handleReasonKeyDown}
                // Read-only rather than disabled while signing, so focus and
                // the text stay put and the words remain selectable.
                readOnly={busy || finished}
                aria-invalid={reasonRefused}
                maxLength={MAX_DISPUTE_REASON_CHARS}
                required
                rows={4}
                // A refused reason is described by the refusal, so the words
                // that must change are read with why.
                aria-describedby={
                  reasonRefused
                    ? `${ids.reasonHint} ${ids.error} ${ids.reasonCount}`
                    : `${ids.reasonHint} ${ids.reasonCount}`
                }
                placeholder="e.g. the calculator it built does not compute anything"
                // Full muted, not muted/70: at 70% the placeholder measured
                // 4.33:1 on the field, under the 4.5:1 that WCAG 1.4.3 asks
                // of it. Typed text is `text`, so the two still differ.
                className={cn(
                  inputCls,
                  "min-h-[6.5rem] resize-y font-sans leading-relaxed placeholder:text-muted read-only:opacity-70",
                )}
              />
              <p
                id={ids.reasonCount}
                className={cn(
                  "text-right font-mono text-[10px] uppercase tracking-widest",
                  remaining === 0
                    ? "text-magenta"
                    : remaining <= COUNTER_WARN_AT
                      ? "text-violet-readable"
                      : "text-muted",
                )}
              >
                {reason.length} / {MAX_DISPUTE_REASON_CHARS} characters
                {remaining === 0 && " · limit reached"}
              </p>
              {/* Silent until the cap is close, and then only at the
                  landmarks: a count read out on every keystroke would drown
                  the buyer's own typing. */}
              <p className="sr-only" aria-live="polite">
                {countdownNotice}
              </p>
            </section>

            <div className="space-y-2 border border-cyan/30 bg-cyan/5 px-3 py-2.5 text-xs leading-relaxed text-text">
              <p>
                Submitting asks the wallet that paid,{" "}
                <span className="font-mono text-cyan" title={settlement.payer}>
                  {shortAddress(settlement.payer)}
                </span>
                , to sign a message. Signing costs nothing, and no transaction
                is sent.
              </p>
              {!wallet.address && (
                <p className="text-magenta">
                  No wallet is connected. Close this, connect that wallet, then
                  raise the dispute.
                </p>
              )}
            </div>
          </form>
        ))}
    </Dialog>
  );
}
