"use client";
import { m } from "framer-motion";
import type { EscrowGeneration } from "@/lib/escrow-generation";
import { DEFAULT_REP_PARAMS } from "@/lib/reputation-math";

/**
 * One rating's weight cap, read off the prior's weight: the backend's
 * `max_rating_weight_usdc()` is min(100, 1.0 × the prior's 12) = 12. No unit,
 * because weight is in the escrow's asset (native XLM on testnet), never the
 * "USDC" in the backend's field names (friction F-022).
 */
const MAX_RATING_WEIGHT = DEFAULT_REP_PARAMS.prior_weight_usdc;

/** The prior's weight, in the escrow's asset for the same reason. */
const PRIOR_WEIGHT = DEFAULT_REP_PARAMS.prior_weight_usdc;

type Stage = {
  title: string;
  body: string;
  call?: string;
  note?: string;
};

/**
 * The first stage, by the escrow the deployment settles through: v2 pays the
 * operator from the buyer's custody at `settle`; v1 charges against an
 * allowance and cannot yet complete that charge (D-039); unknown names
 * neither contract call.
 */
const SETTLE: Record<EscrowGeneration, Stage> = {
  v2: {
    title: "Settle",
    body: "A workflow step completes and its operator is paid from the buyer's escrowed funds when the run settles; only settled work may rate.",
    call: "PaymentEscrow.settle",
    note: "verified-purchase provenance — no payment, no opinion.",
  },
  v1: {
    title: "Settle",
    body: "A workflow step completes and is charged against the buyer's spending allowance on the escrow; only settled work may rate. On this deployment the escrow cannot yet complete that charge (a known defect; the fix is deployed separately).",
    call: "PaymentEscrow.charge",
    note: "verified-purchase provenance — no payment, no opinion.",
  },
  unknown: {
    title: "Settle",
    body: "A workflow step completes and its payment settles through the escrow; only settled work may rate.",
    note: "verified-purchase provenance — no payment, no opinion.",
  },
};

/** Every stage after Settle, the same whichever escrow is live. */
const LATER_STAGES: Stage[] = [
  {
    title: "Rate",
    body: "The settler derives a synthetic 0–100 rating from verifiable workflow signals — artifact shipped? critic violations? — and submits it on-chain, replay-guarded per (agent, job).",
    call: "ReputationLedger.submit",
  },
  {
    title: "Weigh",
    body: `The rating's evidence weight is the step's settled value, capped at ${MAX_RATING_WEIGHT}, the prior's own weight, so a single rating counts for at most as much as the prior — reputation is settled economic history, not a count of clicks.`,
  },
  {
    title: "Decay",
    body: "On-chain, evidence fades by 7.5% per weekly epoch (~9-week half-life); after 96 epochs stale evidence is fully forgotten. Recent work matters most.",
  },
  {
    title: "Smooth",
    body: `The backend blends evidence with a Bayesian prior of 3.50★ (7000 bps) carrying ${PRIOR_WEIGHT} of weight in the escrow's asset — newcomers start at the prior, not zero.`,
  },
  {
    title: "Gate",
    body: "A Wilson lower bound (z = 1.0) turns the mean into a conservative score; routing applies a floor of 2.75★ (5500 bps) on that bound at decompose time.",
  },
];

/**
 * "How a score is born" — six numbered stage cards walking the reputation
 * pipeline from x402 settlement to the routing gate. Static explainer; the
 * numbers mirror the deployed backend + contract constants.
 */
export function PipelineDiagram({
  generation,
}: {
  /** The escrow the deployment settles through (`escrowGeneration`). */
  generation: EscrowGeneration;
}) {
  const stages = [SETTLE[generation], ...LATER_STAGES];
  return (
    <section className="space-y-4" aria-labelledby="rep-pipeline-heading">
      <div>
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan">
          <span aria-hidden="true" className="h-px w-8 bg-cyan/60" />
          reputation pipeline
        </p>
        <h2
          id="rep-pipeline-heading"
          className="text-lg font-semibold tracking-tight"
        >
          How a score is born
        </h2>
        <p className="mt-1 text-sm text-muted">
          Every rating starts as settled USDC and ends as a conservative routing
          score.
        </p>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {stages.map((s, i) => (
          <m.li
            key={s.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="clip-cyber-sm border border-border bg-surface/60 p-5"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="font-mono text-xl font-semibold text-violet"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-text">
                {s.title}
              </h3>
            </div>
            <p className="mt-3 text-sm text-muted">{s.body}</p>
            {s.call && (
              <p className="mt-3 font-mono text-[11px] text-cyan">{s.call}</p>
            )}
            {s.note && (
              <p className="mt-3 border-t border-border/40 pt-3 font-mono text-[11px] text-violet">
                {s.note}
              </p>
            )}
          </m.li>
        ))}
      </ol>
    </section>
  );
}
