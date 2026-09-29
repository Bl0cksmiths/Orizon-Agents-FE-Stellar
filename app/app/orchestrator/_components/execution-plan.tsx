"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { ReputationBadge } from "@/components/ui/reputation-badge";
import { TxStatus, type TxState } from "@/components/ui/tx-status";
import {
  NETWORK_LABEL,
  defaultExplorerNetwork,
} from "@/components/ui/stellar-link";
import {
  buildAuthorize,
  execute,
  getStellarNetwork,
  submitSigned,
} from "@/lib/api";
import {
  AUTHORIZE_TTL_SECONDS,
  checkEscrowFunds,
  classifyAuthorizeError,
  insufficientEscrowFunds,
} from "@/lib/escrow";
import { STROOPS_PER_UNIT, formatSettled } from "@/lib/money";
import { useFetch } from "@/lib/use-fetch";
import {
  DegradedBanner,
  hasUnverifiedReputation,
  UNVERIFIED_SUMMARY_ID,
} from "./degraded-banner";
import { ExclusionsPanel } from "./exclusions-panel";
import { isAwaitingFreshRead } from "./floor-notices";
import { FloorSummary } from "./floor-summary";
import {
  isPlannerFallback,
  PLANNER_FALLBACK_NOTICE_ID,
  PlannerFallbackNotice,
} from "./planner-fallback-notice";
import {
  executeRefusal,
  refusalSentence,
  type EscrowRelease,
} from "@/lib/execute-refusal";
import { escrowAgreement, pinnedEscrowId } from "@/lib/escrow-address";
import {
  V1_CANNOT_SETTLE,
  generationOf,
  type EscrowGeneration,
} from "@/lib/escrow-generation";
import { rememberHeldAuthorization } from "@/lib/held-authorizations";
import { useAsyncAction } from "@/lib/use-async-action";
import { useWallet } from "@/lib/wallet";
import { classifyError, type FriendlyError } from "@/lib/wallet-errors";
import type { DecomposeResponse } from "@/lib/types";
import { FiatFund } from "./fiat-fund";
import { isPlanExpired } from "./plan-errors";
import { PlanExpiredNotice, type ExpiredRun } from "./plan-expired-notice";
import {
  EscrowHeldNotice,
  FundsReturnedNotice,
  type HeldAuthorization,
} from "./escrow-held-notice";

// Display label for the configured network — "mainnet" | "testnet".

/** Which stage of the on-chain authorize flow is running (for button copy). */
type ExecStep = "" | "sign" | "broadcast" | "execute";

const STEP_LABEL: Record<Exclude<ExecStep, "">, string> = {
  sign: "◉ Freighter…",
  broadcast: "◉ Broadcasting…",
  execute: "◉ Launching…",
};

/** The button's label for a stage. Under escrow v2 the broadcast is the
 *  moment the cap leaves the wallet for the escrow, and it says so; under
 *  any other escrow nothing moves then, and it says only what happens. */
function stepLabel(
  step: Exclude<ExecStep, "">,
  generation: EscrowGeneration,
): string {
  return step === "broadcast" && generation === "v2"
    ? "◉ Moving funds to escrow…"
    : STEP_LABEL[step];
}

/** The smallest cap an authorization is signed for. A plan priced at zero
 *  still needs a positive cap to authorize against. */
const MIN_CAP = 0.001;

/** The notice shown when the backend's escrow is not the one this build
 *  pins; Authorize is described by it while it shows. */
const ESCROW_MISMATCH_ID = "escrow-mismatch-notice";

/** What paying on-chain does, told to a buyer before they connect. */
function connectSentence(generation: EscrowGeneration): string {
  const connect = `Connect Freighter (${NETWORK_LABEL}) to pay on-chain`;
  const simulate = "Or run a simulated pass, which moves no funds.";
  switch (generation) {
    case "v2":
      return `${connect}: authorizing moves the plan's maximum into escrow, delivered steps are paid from it, and the rest comes back when the run settles. ${simulate}`;
    case "v1":
      return `${connect}: authorizing records a spending allowance on the escrow contract, and no funds move when you sign. ${V1_CANNOT_SETTLE} ${simulate}`;
    case "unknown":
      return `${connect}. ${simulate}`;
  }
}

/** What the pay panel says in place of a cap when there is nothing to pay. */
const EMPTY_PLAN =
  "This plan has no steps, so there is nothing to authorize or run.";

/** Normalize the 16-byte auth_id a tx returns (hex, base64, or byte list). */
function bytesToHex(v: unknown): string | null {
  if (typeof v === "string") {
    if (/^[0-9a-f]{32}$/i.test(v)) return v.toLowerCase();
    try {
      const hex = Array.from(atob(v), (c) =>
        c.charCodeAt(0).toString(16).padStart(2, "0"),
      ).join("");
      if (hex.length === 32) return hex;
    } catch {
      /* not base64 — fall through */
    }
  }
  if (Array.isArray(v) && v.length === 16) {
    return (v as number[]).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return null;
}

/**
 * The decomposed-plan card: step list, totals, and the execute flows
 * (simulate / fiat funding / on-chain authorize). Mirrors the FiatFund
 * pattern — self-contained state and actions, fed by the plan and by its own
 * network read, which names the asset its amounts are denominated in.
 * The task read token from execute responses is stored by lib/api.ts.
 *
 * `onReplan` is the one flow the card does not own: asking for a new plan is
 * the page's decompose, so the page hands it down for the planner-fallback
 * notice rather than the card calling the API itself.
 */
export function ExecutionPlan({
  plan,
  onReplan,
}: {
  plan: DecomposeResponse;
  /** Decomposes this plan's intent again — offered on a fallback plan. */
  onReplan?: () => void;
}) {
  const router = useRouter();
  const wallet = useWallet();
  const [showFiat, setShowFiat] = useState(false);
  const [step, setStep] = useState<ExecStep>("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [friendlyError, setFriendlyError] = useState<FriendlyError | null>(
    null,
  );
  const [authorizeHash, setAuthorizeHash] = useState<string | null>(null);
  // Set when the backend refused to run this plan because it had expired.
  // The plan cannot run again, so the controls that run it stay disabled and
  // the notice offers a fresh plan instead.
  const [expired, setExpired] = useState<ExpiredRun | null>(null);
  // An authorization that CONFIRMED, kept for as long as no run has been
  // seen to take it over. Under escrow v2 its cap is already in escrow, so
  // if the run is refused or cannot be started the buyer has to be told the
  // funds are held and how to reclaim them — and must not be offered a
  // second signature that would lock up a second cap beside the first.
  const [held, setHeld] = useState<HeldAuthorization | null>(null);
  // Why the run could not be started after the authorization confirmed.
  const [runError, setRunError] = useState<string | null>(null);
  // What the backend said became of that authorization's custody when it
  // refused the run — returned, tried and failed, or never tried — or null
  // when there was no answer at all (a run may then have started).
  const [release, setRelease] = useState<EscrowRelease | null>(null);

  // What every amount on this card is actually denominated in. `total_usdc`
  // is a legacy field name, not a currency: the cap the buyer signs is that
  // figure in stroops of whatever the escrow's SAC wraps, and on testnet that
  // is native XLM. Until the network read lands — or if it fails — the unit
  // is unknown and amounts print bare, because a guessed "USDC" is the false
  // claim this replaces.
  const { data: network } = useFetch(getStellarNetwork, [], {
    revalidateOnFocus: true,
  });
  // Which escrow a signature here goes to, and so what it does: v2 takes the
  // cap into custody at signing, v1 only records an allowance and cannot
  // complete a payment (D-039). Every custody sentence and control on this
  // card reads this one decision; `unknown` claims neither story.
  //
  // When this build pins the v2 escrow and the backend reports a different
  // one, a signature would go to a contract the copy does not describe — so
  // the card will not ask for one. Simulate and fiat do not sign against it.
  const escrow = escrowAgreement(
    network,
    pinnedEscrowId(defaultExplorerNetwork),
  );
  const escrowMismatch = escrow.kind === "mismatch";
  const generation = generationOf(escrow);
  /**
   * An amount exactly as it is signed, with its real unit — or bare while the
   * unit is unknown. Rounded to the stroop, as the backend converts it
   * (`usdc_to_i128` rounds to 7 decimals), never to a display precision:
   * `toFixed(3)` printed 0.1234 as "0.123", a cap on the page smaller than
   * the one that leaves the wallet (finding S6).
   */
  const priced = (value: number) =>
    formatSettled(Math.round(value * STROOPS_PER_UNIT), network?.asset);

  // The cap the buyer signs, computed ONCE and used for both the sentence
  // they read and the authorization they sign. They used to be computed
  // apart, so a zero-priced plan read "authorizing up to 0.000" while 0.001
  // was signed — a cap on the page that was not the cap in the wallet.
  const cap = plan.total_usdc > 0 ? plan.total_usdc : MIN_CAP;
  // A plan with no steps has nothing to pay for. The guard accepts one, so
  // the card has to refuse to take money for it.
  const empty = plan.steps.length === 0;

  // Agents the floor held off only until a fresh reputation read answers.
  const heldForFreshRead = new Set(
    (plan.notices ?? []).filter(isAwaitingFreshRead).map((n) => n.agent_id),
  );

  /** Simulated path — no wallet required. */
  const simulate = useAsyncAction(async () => {
    try {
      const { task_id } = await execute(plan.plan_id);
      router.push(`/app/trace?task=${task_id}`);
    } catch (e) {
      // Not an error to print: the notice below says it in plain words.
      if (isPlanExpired(e)) setExpired("simulate");
      else throw e;
    }
  });

  /** Real on-chain path: the wallet signs authorize — under escrow v2 that
   *  moves the cap into escrow, under v1 it only records an allowance — and
   *  the backend then settles (v2 pays delivered steps and returns the rest)
   *  and seals. */
  const authorize = useAsyncAction(async (payer: string) => {
    setFriendlyError(null);
    setAuthorizeHash(null);
    setRunError(null);
    setRelease(null);
    let confirmed: HeldAuthorization | null = null;
    // Checked before anything is built or signed. Escrow v2 moves the whole
    // cap out of the wallet at signing, so a wallet that cannot cover it plus
    // the fee and reserve would only be refused by the chain after the buyer
    // had been asked to sign. An unread balance is not a refusal: the chain's
    // own answer is mapped below. Any other escrow moves nothing at signing,
    // so a wallet short of the cap is no reason to refuse it.
    const funds =
      generation === "v2"
        ? checkEscrowFunds({
            balance: wallet.xlmBalance,
            cap,
            asset: network?.asset,
          })
        : null;
    if (funds?.kind === "short") {
      setFriendlyError(insufficientEscrowFunds(funds));
      setTxState("failed");
      return;
    }
    try {
      setStep("sign");
      setTxState("building");
      const { xdr, expires_at } = await buildAuthorize({
        payer,
        // The authorization's LABEL, which is the plan being paid for
        // (`pln_` + 8 hex, a valid Symbol). Escrow v2 names the agent on each
        // payout at settle, so this decides nobody's pay — v1 paid its owner,
        // which is why the old `orizon_batch` could never pay an operator.
        // The backend refuses to execute a plan against an authorization
        // whose label, payer, cap or state does not match (finding S2).
        agent_id: plan.plan_id,
        max_amount_usdc: cap,
        ttl_seconds: AUTHORIZE_TTL_SECONDS,
      });

      setTxState("signing");
      const signedXdr = await wallet.signXdr(xdr);

      setStep("broadcast");
      setTxState("broadcasting");
      const broadcast = await submitSigned(signedXdr);
      if (broadcast.status !== "SUCCESS") {
        throw new Error(
          [
            `authorize tx ${broadcast.status}`,
            broadcast.diagnostic,
            broadcast.explorer,
          ]
            .filter(Boolean)
            .join(" · "),
        );
      }
      const authHex = bytesToHex(broadcast.return_value);
      if (!authHex) throw new Error("failed to read auth_id from tx result");

      setAuthorizeHash(broadcast.hash);
      setTxState("success");
      confirmed = {
        authIdHex: authHex,
        payer,
        expiresAt: expires_at ?? null,
      };
      setHeld(confirmed);

      setStep("execute");
      const { task_id } = await execute(plan.plan_id, {
        auth_id_hex: authHex,
        payer,
      });
      // The trace's receipt needs the authorization to offer a reclaim if
      // the run's settlement fails, and the backend keeps its id off the
      // receipt: this session is the one place that holds it.
      rememberHeldAuthorization(task_id, confirmed);
      router.push(`/app/trace?task=${task_id}`);
    } catch (e) {
      // Refused at `execute`, AFTER the authorization was confirmed on-chain.
      // Not a payment failure, and the failure card would say it was one: the
      // confirmed transaction stays shown as confirmed, the notice says the
      // plan was too old to run, and the held-funds notice says where the
      // cap is and how to reclaim it.
      // The backend's refusal, narrowed: why, and — when it tried to hand
      // the custody back — whether that confirmed.
      const refusal = confirmed !== null ? executeRefusal(e) : null;
      if (isPlanExpired(e)) {
        setExpired("authorize");
        setRelease(refusal?.release ?? { kind: "not_attempted" });
        setStep("");
        return;
      }
      // Any other failure after the authorization confirmed is a failure to
      // START the run, not a failed payment: the confirmed transaction stays
      // confirmed rather than turning into a failure card, and the reason is
      // stated beside what became of the funds.
      if (confirmed !== null) {
        setRunError(
          refusal !== null
            ? refusalSentence(refusal)
            : `The request to start it failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        setRelease(refusal?.release ?? null);
        setStep("");
        return;
      }
      // The custody reading of a refusal ("could not move the maximum into
      // escrow") is v2's; anything else gets the shared wallet wording.
      const friendly =
        generation === "v2" ? classifyAuthorizeError(e) : classifyError(e);
      setFriendlyError(friendly);
      setTxState("failed");
      setStep("");
      // Swallowed, not re-thrown: the failure renders once, in the TxStatus
      // FailedCard below — re-throwing would surface the same detail a
      // second time via useAsyncAction's captured error.
    }
  });

  // Every notice above the Authorize panel that is on the page, in reading
  // order. Composed, never chosen between: a fallback plan built during a
  // failed reputation read owes the buyer both facts at the button. None at
  // all is no attribute rather than an empty one, and an id is only named
  // while its notice renders — a reference to an absent id describes nothing
  // and is flagged by accessibility audits.
  const authorizeDescribedBy =
    [
      isPlannerFallback(plan) && PLANNER_FALLBACK_NOTICE_ID,
      // The banner's one-sentence summary, not the banner: four paragraphs
      // read out as a button's description bury the decision under them.
      hasUnverifiedReputation(plan) && UNVERIFIED_SUMMARY_ID,
      escrowMismatch && ESCROW_MISMATCH_ID,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const executing = simulate.pending || authorize.pending;
  // The controls that run the plan. An expired plan cannot run again, and a
  // second signature against it would only draw the same refusal.
  const cannotRun = executing || expired !== null || held !== null || empty;
  // Authorize failures render in the TxStatus FailedCard (via friendlyError);
  // only the simulate path reports through the alert below.
  const error = simulate.error;

  const onSimulate = () => {
    if (cannotRun) return;
    authorize.reset();
    void simulate.run();
  };

  const onAuthorize = () => {
    if (cannotRun || escrowMismatch || !wallet.connected || !wallet.address)
      return;
    simulate.reset();
    void authorize.run(wallet.address);
  };

  // Every control on the pay panel starts a payment, or a run of the plan,
  // so each one carries the notices as its description — not only Authorize.
  // A buyer with no wallet connected used to reach Connect Wallet, Pay with
  // Fiat and simulate with none of them describing anything.
  const fiatToggle = (
    <Button
      variant="primary"
      onClick={() => setShowFiat((v) => !v)}
      disabled={executing || empty}
      size="md"
      aria-describedby={authorizeDescribedBy}
    >
      {showFiat ? "▾ Hide Fiat" : "Pay with Fiat ▸"}
    </Button>
  );

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Execution plan</h2>
              <Badge tone="violet" dot>
                PHP accepted
              </Badge>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              plan {plan.plan_id} · {plan.steps.length} step
              {plan.steps.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-6 font-mono text-xs">
            <div>
              <div className="text-muted uppercase tracking-widest text-[10px]">
                total est.
              </div>
              <div className="text-cyan text-lg">{priced(plan.total_usdc)}</div>
            </div>
            <div>
              <div className="text-muted uppercase tracking-widest text-[10px]">
                eta
              </div>
              <div className="text-violet text-lg">
                {plan.total_eta.toFixed(1)}s
              </div>
            </div>
          </div>
        </div>

        {/* Above the steps, not below them. The floor is the frame the plan
            was built in, and a buyer who reads the steps first has already
            formed a view of the plan by the time they meet the threshold that
            shaped it. */}
        <FloorSummary plan={plan} />

        <ol className="space-y-3">
          {plan.steps.map((s, i) => (
            <m.li
              key={`${s.agent_id}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="clip-cyber-sm border border-border bg-bg/60 p-4 flex flex-wrap items-center gap-4"
            >
              <div className="font-mono text-xs text-muted w-8">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* max-w-full + break-all, as the exclusions panel's names:
                    an agent name may be one unbroken token of up to 100
                    characters, and at 360px it was clipped silently by the
                    card rather than wrapped. */}
                <Badge tone="violet" className="max-w-full break-all">
                  {s.agent_name ?? s.agent_id}
                </Badge>
                {/* The floor goes in ONLY beside the step's own lower bound.

                    ReputationBadge decides below-floor with
                    `(lowerBoundBps ?? bps) < floorBps`, and the backend gates
                    on the lower bound, never on `rep_bps` — the smoothed
                    headline score. The two disagree exactly where it matters,
                    for an agent with a healthy average and too few ratings to
                    back it, so a floor handed over without the bound would
                    judge the wrong number and clear an agent the planner
                    refused. A backend predating `rep_lower_bound_bps` gets no
                    floor verdict on the chip at all; a step the starvation
                    backstop re-admitted still carries its own `▾ below floor`
                    badge below either way.

                    `rep_degraded` is this step's own failed read, and it is
                    what stops a prior served in place of an unreachable
                    history from being worded "no on-chain ratings yet". The
                    plan-wide `reputation_degraded` stands in only when a
                    backend predating the step field omits it. That flag says
                    some read failed, not which, so in such a plan a genuine
                    cold start may be worded as a failed read — the smaller
                    error of the two, since the other misstates a real
                    agent's record. */}
                {s.rep_bps != null && (
                  <ReputationBadge
                    bps={s.rep_bps}
                    lowerBoundBps={s.rep_lower_bound_bps ?? undefined}
                    source={s.rep_source ?? "prior"}
                    degraded={s.rep_degraded ?? plan.reputation_degraded}
                    count={s.rep_count ?? undefined}
                    disputeRateBps={s.rep_dispute_rate_bps ?? undefined}
                    floorBps={
                      s.rep_lower_bound_bps != null ? plan.floor_bps : undefined
                    }
                  />
                )}
                {s.substituted_for && (
                  <span
                    className="max-w-full"
                    // Not "scored below the floor" when the replaced agent
                    // was only held off for a fresh reputation read: its
                    // last bound may clear the floor (finding S8).
                    title={
                      heldForFreshRead.has(s.substituted_for)
                        ? `Routed in place of ${s.substituted_for}, which was rated since its last reputation read and is held off until a fresh read answers.`
                        : `Routed in place of ${s.substituted_for}, which scored below the routing floor.`
                    }
                  >
                    {/* The replaced agent's name is as long as any other. */}
                    <Badge tone="cyan" className="max-w-full break-all">
                      ⇄ for {s.substituted_for}
                    </Badge>
                  </span>
                )}
                {s.degraded && (
                  <span title="Kept by the starvation backstop despite scoring below the routing floor.">
                    <Badge tone="magenta">▾ below floor</Badge>
                  </span>
                )}
              </div>
              <span className="text-sm text-muted">→</span>
              <div className="flex-1 text-sm">{s.rationale}</div>
              <div className="font-mono text-xs text-cyan">
                {s.est_price_usdc.toFixed(3)} · {s.est_eta_seconds.toFixed(1)}s
              </div>
            </m.li>
          ))}
        </ol>

        {/* Replaces an always-expanded list. It was the right information in
            the wrong shape: a plan with four floor actions pushed the steps
            and the Authorize control down the card, so the protection read as
            an obstacle. Collapsed, with the count on the summary, it informs
            without dominating — and it is a product rule of the story that it
            is never hidden outright. */}
        <div className="mt-4">
          <ExclusionsPanel plan={plan} />
        </div>

        {/* Above the Authorize panel, because it changes what the buyer is
            about to pay for — and above the reputation banner rather than
            below it, which keeps that banner immediately over the button as
            its own comment requires. This one is about how the plan was made;
            that one is about the evidence the buyer pays against. */}
        <PlannerFallbackNotice
          plan={plan}
          onReplan={onReplan}
          busy={executing}
        />

        {/* Immediately above the Authorize panel, and that position is the
            requirement rather than a layout preference. The banner says the
            floor could not check anyone against on-chain evidence for this
            plan — a buyer who meets that after committing funds has been told
            nothing useful. */}
        <DegradedBanner plan={plan} />

        {escrow.kind === "mismatch" && (
          <p
            id={ESCROW_MISMATCH_ID}
            className="mt-6 clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3 text-sm leading-relaxed text-magenta"
          >
            On-chain payment is paused: the platform is settling through escrow{" "}
            <span className="break-all font-mono text-xs">
              {escrow.live ?? "(none reported)"}
            </span>
            , but this console is written for escrow{" "}
            <span className="break-all font-mono text-xs">{escrow.pinned}</span>
            . Nothing is asked of your wallet until they agree. A simulated pass
            is unaffected.
          </p>
        )}

        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 clip-cyber-sm border border-cyan/40 bg-cyan/5 p-4"
        >
          {wallet.connected ? (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-1">
                  ▸ ready to authorize on-chain
                </div>
                {empty ? (
                  <div className="text-sm">{EMPTY_PLAN}</div>
                ) : generation === "v2" ? (
                  // Escrow v2 takes custody at authorize: this signature moves
                  // the money now, not at settlement. A buyer who reads "up
                  // to" as a cap on a later charge has been told v1's story.
                  <div className="max-w-xl text-sm leading-relaxed">
                    Freighter will prompt for{" "}
                    <b className="text-text">one signature</b> that moves up to{" "}
                    <b className="text-text">{priced(cap)}</b> from your wallet
                    into escrow now. Delivered steps are paid from it, and the
                    rest comes back to you when the run settles.
                  </div>
                ) : (
                  // v1 moves nothing at signing, and says so; until the
                  // escrow is known, the sentence claims neither.
                  <div className="max-w-xl text-sm leading-relaxed">
                    Freighter will prompt for{" "}
                    <b className="text-text">one signature</b> authorizing up to{" "}
                    <b className="text-text">{priced(cap)}</b>.
                    {generation === "v1" &&
                      ` It records a spending allowance on the escrow contract; no funds move when you sign. ${V1_CANNOT_SETTLE}`}
                  </div>
                )}
              </div>
              {/* flex-wrap: three buttons are wider than a 390px card, and the
                  card's clip-path cuts off whatever overflows it — at phone
                  width that was the Authorize button itself. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={onSimulate}
                  disabled={cannotRun}
                  size="md"
                  aria-describedby={authorizeDescribedBy}
                >
                  simulate
                </Button>
                {fiatToggle}
                <Button
                  variant="cyan"
                  onClick={onAuthorize}
                  disabled={cannotRun || escrowMismatch}
                  size="md"
                  // Tab goes from the exclusions panel straight here, past the
                  // polite notices above, so the button carries them as its
                  // description — each one only while it exists.
                  aria-describedby={authorizeDescribedBy}
                >
                  {executing
                    ? step
                      ? stepLabel(step, generation)
                      : "◉ Launching…"
                    : "Authorize & Execute ▸"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-1">
                  ▸ wallet required
                </div>
                <div className="text-sm">
                  {empty ? EMPTY_PLAN : connectSentence(generation)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <ConnectWallet size="md" describedBy={authorizeDescribedBy} />
                {fiatToggle}
                <Button
                  variant="outline"
                  onClick={onSimulate}
                  disabled={cannotRun}
                  size="md"
                  aria-describedby={authorizeDescribedBy}
                >
                  simulate ▸
                </Button>
              </div>
            </div>
          )}
        </m.div>

        {expired && (
          <PlanExpiredNotice
            run={expired}
            onReplan={onReplan}
            busy={executing}
            generation={generation}
            fundsReturned={release?.kind === "returned"}
          />
        )}

        {runError && (
          <div
            role="alert"
            className="mt-4 clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3 text-sm leading-relaxed text-magenta"
          >
            <p>The authorization confirmed, but the run was not started.</p>
            <p className="mt-1 text-text/90">{runError}</p>
            {generation === "v1" && (
              <p className="mt-1 text-text/90">
                The authorization only recorded a spending allowance, so no
                funds moved.
              </p>
            )}
            {onReplan && (
              <Button
                type="button"
                variant="cyan"
                size="sm"
                className="mt-3"
                onClick={onReplan}
                disabled={executing}
              >
                Build a fresh plan ▸
              </Button>
            )}
          </div>
        )}

        {/* Only escrow v2 holds anything to hand back or reclaim. A v1
            authorization moved nothing, and while the escrow is unknown the
            card claims neither. */}
        {held &&
          generation === "v2" &&
          (expired === "authorize" || runError) &&
          (release?.kind === "returned" ? (
            <FundsReturnedNotice amount={priced(cap)} txHash={release.txHash} />
          ) : (
            <EscrowHeldNotice
              held={held}
              amount={priced(cap)}
              escrowId={network?.contracts.payment_escrow || null}
              // The backend answered: no task was minted. Without an answer
              // a run may have started and will settle as usual.
              runRefused={release !== null}
              releaseFailed={release?.kind === "not_returned"}
            />
          ))}

        {error && (
          <div
            role="alert"
            className="mt-4 clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3 font-mono text-xs text-magenta"
          >
            {error}
          </div>
        )}

        {showFiat && (
          <div className="mt-4">
            <FiatFund
              usdcAmount={cap}
              stellarAddress={wallet.address ?? undefined}
              asset={network?.asset}
            />
          </div>
        )}

        {/* A confirmed authorize under escrow v2 is a transfer: the cap left
            the wallet for the escrow contract. The card says so with the
            figure signed and the contract it went to — only once both are
            known, since a guessed destination would be a false receipt. Under
            any other escrow nothing was sent, so no "sent" row is drawn. */}
        <TxStatus
          state={txState}
          hash={authorizeHash ?? undefined}
          amount={
            authorizeHash && generation === "v2" ? priced(cap) : undefined
          }
          destination={
            generation === "v2"
              ? network?.contracts.payment_escrow || undefined
              : undefined
          }
          error={friendlyError}
        />
      </Card>
    </m.div>
  );
}
