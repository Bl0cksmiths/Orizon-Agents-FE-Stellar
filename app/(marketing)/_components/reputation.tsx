"use client";
import { m } from "framer-motion";
import { fallbackReputationLedgerId } from "@/lib/contract-addresses";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  defaultExplorerNetwork,
  stellarExpertUrl,
} from "@/components/ui/stellar-link";

// Link follows the build's passphrase env. The marketing page has no
// /reputation/params read to defer to, so this id is ALWAYS the build-time
// one — which is why it pulls from the shared address book instead of keeping
// a second copy of the same two constants next to the console's copy. Two
// hand-maintained copies of one address is the same drift this story is about,
// just inside a single repo.
const LEDGER_CONTRACT_URL = stellarExpertUrl(
  "contract",
  fallbackReputationLedgerId(defaultExplorerNetwork),
  defaultExplorerNetwork,
);

const stats = [
  {
    value: "★ 3.50",
    label: "newcomer prior",
    note: "cheap pseudonyms priced in",
  },
  { value: "~9 wk", label: "evidence half-life", note: "recency wins" },
  {
    value: "100 USDC",
    label: "whale cap per rating",
    note: "one voice, bounded",
  },
  { value: "★ 2.75", label: "routing floor", note: "wilson lower bound" },
];

const mockRows = [
  {
    name: "code.gen",
    chip: "★ 4.61",
    tone: "cyan" as const,
    fill: "bg-cyan",
    width: "92%",
    flagged: false,
  },
  {
    name: "research.pro",
    chip: "≈★ 3.50",
    tone: "violet" as const,
    fill: "bg-violet/50",
    width: "70%",
    flagged: false,
  },
  {
    name: "spam.bot",
    chip: "⚑ ★ 1.90",
    tone: "magenta" as const,
    fill: "bg-magenta",
    width: "38%",
    flagged: true,
  },
];

/**
 * Marketing section for the on-chain reputation system: economics stat tiles
 * on the left, a static decorative echo of the console leaderboard on the
 * right, and CTAs into /app/reputation and the ReputationLedger contract.
 */
export function Reputation() {
  return (
    <section id="reputation" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="THE TRUST LAYER"
          title="Reputation is settled history, not stars."
          subtitle="Every rating is backed by settled USDC on the ReputationLedger — decayed over time, weighted by value, smoothed with a Bayesian prior, and enforced as a routing floor each time the orchestrator hires."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <m.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="grid grid-cols-2 gap-4">
              {stats.map((s) => (
                <Card key={s.label} className="p-5">
                  <div className="font-mono text-2xl md:text-3xl text-text">
                    {s.value}
                  </div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                    {s.label}
                  </div>
                  <div className="mt-1 text-xs text-muted">{s.note}</div>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted">
              Wash-trading costs real USDC per fake rating. And when the chain
              is unreachable, scores fall back to the prior — never fabricated.
            </p>
          </m.div>

          <m.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <Card aria-hidden="true" className="h-full">
              <div className="mb-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                <span>{"// reputation ledger — routing view"}</span>
                <span>floor ★ 2.75</span>
              </div>
              <div>
                {mockRows.map((r) => (
                  <div
                    key={r.name}
                    className={cn(
                      "flex items-center gap-4 border-b border-border/50 border-l-2 border-l-transparent py-4 pl-3 last:border-b-0",
                      r.flagged && "border-l-magenta/60",
                    )}
                  >
                    <span className="w-24 sm:w-28 truncate font-mono text-xs text-text">
                      {r.name}
                    </span>
                    <Badge tone={r.tone}>{r.chip}</Badge>
                    <div className="relative h-1.5 flex-1 rounded-full bg-border/20">
                      <div
                        className={cn("h-full rounded-full", r.fill)}
                        style={{ width: r.width }}
                      />
                      <span
                        className="absolute top-0 h-full w-px bg-text/40"
                        style={{ left: "55%" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                │ = routing floor — below it, agents never get hired
              </p>
            </Card>
          </m.div>
        </div>

        <m.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="mt-10 flex flex-wrap gap-4"
        >
          <ButtonLink href="/app/reputation" size="lg">
            Explore the Reputation System ▸
          </ButtonLink>
          <a
            href={LEDGER_CONTRACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.18em] transition-all duration-200 select-none clip-cyber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg bg-transparent text-text border border-violet/60 hover:border-violet hover:bg-violet/10 hover:shadow-neon-violet h-12 px-7 text-sm"
          >
            View the ledger contract
          </a>
        </m.div>
      </div>
    </section>
  );
}
