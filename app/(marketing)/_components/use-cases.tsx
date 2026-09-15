"use client";
import { m } from "framer-motion";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const cases = [
  {
    id: "startup",
    title: "Startup Builder",
    input: "Build a landing page",
    chain: [
      "seo.brief",
      "copywrite.v3",
      "design.figma",
      "code.next",
      "deploy.v0",
    ],
    output: "Live URL + analytics",
  },
  {
    id: "marketing",
    title: "Autonomous Marketing",
    input: "Grow my product",
    chain: [
      "research.pro",
      "seo.brief",
      "copywrite.v3",
      "ads.meta",
      "analytics.v2",
    ],
    output: "Full funnel live",
  },
  {
    id: "research",
    title: "Research Automation",
    input: "Analyze AI phishing in PH",
    chain: ["crawl.v2", "dedupe", "synth.gpt", "citations", "report.md"],
    output: "Sourced brief (PDF)",
  },
  {
    id: "contract",
    title: "Smart Contract Analysis",
    input: "Audit vault.sol",
    chain: ["parse.evm", "sol-audit", "opcode.vm", "writer.sec"],
    output: "Audit report + CVSS",
  },
];

export function UseCases() {
  const [active, setActive] = useState(cases[0].id);
  const current = cases.find((c) => c.id === active) ?? cases[0];

  return (
    <section id="use-cases" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="IN MOTION"
          title="Real intents. Real agent chains. Real outcomes."
          subtitle="Every workflow is composed on the fly. No hand-wired pipelines."
        />

        <div className="mt-12 flex flex-wrap gap-2">
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={cn(
                "clip-cyber-sm border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition",
                active === c.id
                  ? "bg-violet/20 border-violet text-text shadow-neon-violet"
                  : "border-border text-muted hover:text-text hover:border-violet/60",
              )}
            >
              {c.title}
            </button>
          ))}
        </div>

        <m.div
          key={current.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-8"
        >
          <Card>
            <div className="grid gap-6 md:grid-cols-[1fr_2fr_1fr] items-center">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan mb-2">
                  ▸ Intent
                </div>
                <div className="text-lg font-medium">"{current.input}"</div>
              </div>

              <div className="relative">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted mb-3 text-center">
                  agent chain
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {current.chain.map((agent, i) => (
                    <m.div
                      key={agent}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.08 }}
                      className="flex items-center gap-2"
                    >
                      <Badge tone="violet">{agent}</Badge>
                      {i < current.chain.length - 1 && (
                        <span className="text-cyan text-xs">→</span>
                      )}
                    </m.div>
                  ))}
                </div>
              </div>

              <div className="text-right md:text-right">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-magenta mb-2">
                  Outcome ▸
                </div>
                <div className="text-lg font-medium">{current.output}</div>
              </div>
            </div>
          </Card>
        </m.div>
      </div>
    </section>
  );
}
