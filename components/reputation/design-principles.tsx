"use client";
import { m } from "framer-motion";

import { DEFAULT_REP_PARAMS } from "@/lib/reputation-math";

/**
 * One rating's weight cap, read off the prior's weight: the backend's
 * `max_rating_weight_usdc()` is min(100, 1.0 × the prior's 12) = 12. No unit,
 * because weight is in the escrow's asset (native XLM on testnet), never the
 * "USDC" in the backend's field names (friction F-022).
 */
const MAX_RATING_WEIGHT = DEFAULT_REP_PARAMS.prior_weight_usdc;

const PRINCIPLES = [
  {
    eyebrow: "verified purchase",
    body: "Ratings exist only for settled x402 payments, so wash-trading costs a settled payment per fake rating — an insight borrowed from the ERC-8004 empirical record: unvalidated feedback inflates.",
  },
  {
    eyebrow: "cheap pseudonyms priced in",
    body: "Newcomers start at the 3.50★ prior — not 0 and not 5 — so re-registering to escape a bad record forfeits earned reputation (Friedman–Resnick).",
  },
  {
    eyebrow: "whales capped",
    body: `A single job's evidence weight caps at ${MAX_RATING_WEIGHT}, the prior's own weight, so one rating counts for at most as much as the prior and one big spender can't own an agent's score.`,
  },
  {
    eyebrow: "recency wins",
    body: "Weekly decay (~9-week half-life) means a great agent must keep being great; ancient glory fades to zero by 96 epochs.",
  },
  {
    eyebrow: "disputes are first-class",
    body: "Dispute-kind ratings increment a separate on-chain counter; the dispute rate is surfaced beside the score, not blended into it.",
  },
  {
    eyebrow: "fails safe",
    body: 'If the chain is unreachable the router falls back to the prior, marked source: "prior" — reads never fabricate on-chain evidence, and routing keeps working.',
  },
];

/**
 * Six design-principle cards explaining why the reputation system resists
 * gaming and fails safe. Static copy; the numbers mirror deployed constants.
 */
export function DesignPrinciples() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {PRINCIPLES.map((p, i) => (
        <m.li
          key={p.eyebrow}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, delay: i * 0.05 }}
          className="clip-cyber-sm border border-border bg-surface/60 p-5"
        >
          <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-cyan">
            <span aria-hidden="true" className="h-px w-6 bg-cyan/60" />
            {p.eyebrow}
          </h3>
          <p className="mt-3 text-sm text-muted">{p.body}</p>
        </m.li>
      ))}
    </ul>
  );
}
