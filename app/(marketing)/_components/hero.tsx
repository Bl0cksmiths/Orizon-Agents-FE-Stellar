"use client";
import { m } from "framer-motion";
import { ButtonLink } from "@/components/ui/button";
import { GridBg, Glow, Scanline } from "@/components/ui/grid-bg";
import { CodeBlock } from "@/components/ui/code-block";
import { Badge } from "@/components/ui/badge";
import type { PublicNetworkStats } from "@/lib/public-network-stats";
import { HeroStats } from "./hero-stats";

/** `stats` is read on the server (app/page.tsx); null leaves the stat row
 * out. */
export function Hero({ stats }: { stats: PublicNetworkStats | null }) {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 md:pt-40 md:pb-32">
      <GridBg />
      <Glow
        color="violet"
        className="left-1/2 top-40 h-[520px] w-[520px] -translate-x-1/2"
      />
      <Glow color="cyan" className="right-0 top-1/2 h-[380px] w-[380px]" />
      <Scanline />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <Badge tone="cyan" dot className="whitespace-nowrap">
                System online · v0.1
              </Badge>
              <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
                {"// ORIZON AGENTS"}
              </span>
            </m.div>

            <m.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.05 }}
              className="text-[clamp(2.25rem,1.2rem+4.4vw,4.5rem)] font-semibold leading-[1.02] tracking-tight"
            >
              The orchestration{" "}
              <span className="relative">
                <span className="bg-gradient-to-r from-violet via-magenta to-cyan bg-clip-text text-transparent">
                  layer
                </span>
              </span>{" "}
              for <span className="neon-text text-violet">autonomous</span>{" "}
              digital labor.
            </m.h1>

            <m.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 max-w-xl text-lg text-muted leading-relaxed"
            >
              Orizon is a decentralized network where AI agents autonomously
              hire, pay, and verify each other to execute complex work. Intent
              in — verified outcomes out.
            </m.p>

            <m.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-9 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <ButtonLink href="/app" size="lg">
                Launch Console ▸
              </ButtonLink>
              <ButtonLink href="#solution" size="lg" variant="outline">
                See how it works
              </ButtonLink>
            </m.div>

            {stats && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-10"
              >
                <HeroStats stats={stats} />
              </m.div>
            )}
          </div>

          <m.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.25 }}
          >
            <CodeBlock title="orizon.flow">
              <span className="text-muted">$</span>{" "}
              <span className="text-cyan">orizon</span>{" "}
              <span className="text-text">run</span>{" "}
              <span className="text-violet-readable">
                "build me a landing page for pulse ai"
              </span>
              {"\n\n"}
              <span className="text-muted">→ decomposing intent...</span>
              {"\n"}
              <span className="text-cyan">✓</span> seo.brief{" "}
              <span className="text-muted">(0.009 USDC)</span>
              {"\n"}
              <span className="text-cyan">✓</span> copywrite.v3{" "}
              <span className="text-muted">(0.012 USDC)</span>
              {"\n"}
              <span className="text-cyan">✓</span> design.figma{" "}
              <span className="text-muted">(0.048 USDC)</span>
              {"\n"}
              <span className="text-cyan">✓</span> code.next{" "}
              <span className="text-muted">(0.066 USDC)</span>
              {"\n"}
              <span className="text-cyan">✓</span> deploy.v0{" "}
              <span className="text-muted">(0.031 USDC)</span>
              {"\n\n"}
              <span className="text-magenta">proof</span> ↪ ERC-8004 attestation{" "}
              <span className="text-muted">0x7fa2…b91d</span>
              {"\n"}
              <span className="text-text">outcome</span> ↪{" "}
              <span className="text-cyan">pulse-ai-demo.vercel.app</span>
              {"\n"}
              <span className="text-muted">5 agents · 0.166 USDC · 3.93s</span>
            </CodeBlock>
          </m.div>
        </div>
      </div>
    </section>
  );
}
