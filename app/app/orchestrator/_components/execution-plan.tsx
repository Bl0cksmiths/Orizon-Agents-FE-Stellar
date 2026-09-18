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
import { NETWORK_LABEL } from "@/components/ui/stellar-link";
import {
  buildAuthorize,
  execute,
  getStellarNetwork,
  submitSigned,
} from "@/lib/api";
import { assetLabel } from "@/lib/money";
import { useFetch } from "@/lib/use-fetch";
import {
  DegradedBanner,
  hasUnverifiedReputation,
  UNVERIFIED_BANNER_ID,
} from "./degraded-banner";
import { ExclusionsPanel } from "./exclusions-panel";
import { FloorSummary } from "./floor-summary";
import { PlannerFallbackNotice } from "./planner-fallback-notice";
import { useAsyncAction } from "@/lib/use-async-action";
import { useWallet } from "@/lib/wallet";
import { classifyError, type FriendlyError } from "@/lib/wallet-errors";
import type { DecomposeResponse } from "@/lib/types";
import { FiatFund } from "./fiat-fund";

// Display label for the configured network — "mainnet" | "testnet".

/** Which stage of the on-chain authorize flow is running (for button copy). */
type ExecStep = "" | "sign" | "broadcast" | "execute";

const STEP_LABEL: Record<Exclude<ExecStep, "">, string> = {
  sign: "◉ Freighter…",
  broadcast: "◉ Broadcasting…",
  execute: "◉ Launching…",
};

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
 */
export function ExecutionPlan({ plan }: { plan: DecomposeResponse }) {
  const router = useRouter();
  const wallet = useWallet();
  const [showFiat, setShowFiat] = useState(false);
  const [step, setStep] = useState<ExecStep>("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [friendlyError, setFriendlyError] = useState<FriendlyError | null>(
    null,
  );
  const [authorizeHash, setAuthorizeHash] = useState<string | null>(null);

  // What every amount on this card is actually denominated in. `total_usdc`
  // is a legacy field name, not a currency: the cap the buyer signs is that
  // figure in stroops of whatever the escrow's SAC wraps, and on testnet that
  // is native XLM. Until the network read lands — or if it fails — `unit` is
  // empty and amounts print bare, because a guessed "USDC" is the false claim
  // this replaces.
  const { data: network } = useFetch(getStellarNetwork, [], {
    revalidateOnFocus: true,
  });
  const unit = assetLabel(network?.asset);
  /** An amount with its real unit, or bare while the unit is unknown. */
  const priced = (value: number) =>
    unit ? `${value.toFixed(3)} ${unit}` : value.toFixed(3);

  /** Simulated path — no wallet required. */
  const simulate = useAsyncAction(async () => {
    const { task_id } = await execute(plan.plan_id);
    router.push(`/app/trace?task=${task_id}`);
  });

  /** Real on-chain path: wallet signs authorize, backend charges + seals. */
  const authorize = useAsyncAction(async (payer: string) => {
    setFriendlyError(null);
    setAuthorizeHash(null);
    try {
      setStep("sign");
      setTxState("building");
      const { xdr } = await buildAuthorize({
        payer,
        agent_id: "orizon_batch",
        max_amount_usdc: plan.total_usdc || 0.001,
        ttl_seconds: 600,
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

      setStep("execute");
      const { task_id } = await execute(plan.plan_id, {
        auth_id_hex: authHex,
        payer,
      });
      router.push(`/app/trace?task=${task_id}`);
    } catch (e) {
      const friendly = classifyError(e);
      setFriendlyError(friendly);
      setTxState("failed");
      setStep("");
      // Swallowed, not re-thrown: the failure renders once, in the TxStatus
      // FailedCard below — re-throwing would surface the same detail a
      // second time via useAsyncAction's captured error.
    }
  });

  const executing = simulate.pending || authorize.pending;
  // Authorize failures render in the TxStatus FailedCard (via friendlyError);
  // only the simulate path reports through the alert below.
  const error = simulate.error;

  const onSimulate = () => {
    authorize.reset();
    void simulate.run();
  };

  const onAuthorize = () => {
    if (!wallet.connected || !wallet.address) return;
    simulate.reset();
    void authorize.run(wallet.address);
  };

  const fiatToggle = (
    <Button
      variant="primary"
      onClick={() => setShowFiat((v) => !v)}
      disabled={executing}
      size="md"
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
                <Badge tone="violet">{s.agent_name ?? s.agent_id}</Badge>
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
                    title={`Routed in place of ${s.substituted_for}, which scored below the routing floor.`}
                  >
                    <Badge tone="cyan">⇄ for {s.substituted_for}</Badge>
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
        <PlannerFallbackNotice plan={plan} busy={executing} />

        {/* Immediately above the Authorize panel, and that position is the
            requirement rather than a layout preference. The banner says the
            floor could not check anyone against on-chain evidence for this
            plan — a buyer who meets that after committing funds has been told
            nothing useful. */}
        <DegradedBanner plan={plan} />

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
                <div className="text-sm">
                  Freighter will prompt for{" "}
                  <b className="text-text">one signature</b> authorizing up to{" "}
                  <b className="text-text">{priced(plan.total_usdc)}</b>.
                </div>
              </div>
              {/* flex-wrap: three buttons are wider than a 390px card, and the
                  card's clip-path cuts off whatever overflows it — at phone
                  width that was the Authorize button itself. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={onSimulate}
                  disabled={executing}
                  size="md"
                >
                  simulate
                </Button>
                {fiatToggle}
                <Button
                  variant="cyan"
                  onClick={onAuthorize}
                  disabled={executing}
                  size="md"
                  // Tab goes from the exclusions panel straight here, past the
                  // polite banner above, so the button carries the warning as
                  // its description — and only while the banner exists.
                  aria-describedby={
                    hasUnverifiedReputation(plan)
                      ? UNVERIFIED_BANNER_ID
                      : undefined
                  }
                >
                  {executing
                    ? step
                      ? STEP_LABEL[step]
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
                  Connect Freighter ({NETWORK_LABEL}) to pay with x402 on-chain,
                  or run a simulated pass.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <ConnectWallet size="md" />
                {fiatToggle}
                <Button
                  variant="outline"
                  onClick={onSimulate}
                  disabled={executing}
                  size="md"
                >
                  simulate ▸
                </Button>
              </div>
            </div>
          )}
        </m.div>

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
              usdcAmount={plan.total_usdc}
              stellarAddress={wallet.address ?? undefined}
              asset={network?.asset}
            />
          </div>
        )}

        <TxStatus
          state={txState}
          hash={authorizeHash ?? undefined}
          error={friendlyError}
        />
      </Card>
    </m.div>
  );
}
