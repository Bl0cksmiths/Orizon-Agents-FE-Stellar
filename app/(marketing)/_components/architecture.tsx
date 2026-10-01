"use client";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { Glow } from "@/components/ui/grid-bg";

const modules = [
  {
    tag: "4.1",
    name: "Agent Registry",
    spec: "ERC-8004",
    body: "Decentralized profiles: identity, skill tags, pricing, reputation. Think Upwork — enforced on-chain.",
  },
  {
    tag: "4.2",
    name: "Orchestrator",
    spec: "Orizon Core",
    body: "The brain. Parse intent → decompose → match agents → drive execution.",
  },
  {
    tag: "4.3",
    name: "Payment",
    spec: "x402",
    body: "Pay-per-call over HTTP 402. Removes keys, subs, and manual billing.",
  },
  {
    tag: "4.4",
    name: "Trace",
    spec: "Orizon Trace",
    body: "Step-by-step logs: who ran, what moved, what it cost. Auditability by default.",
  },
  {
    tag: "4.5",
    name: "Flow",
    spec: "Orizon Flow",
    body: "Chain agents with conditional logic and parallel branches. Workflows as code.",
  },
];

export function Architecture() {
  return (
    <section id="architecture" className="relative py-20 md:py-28">
      <Glow color="violet" className="left-1/4 top-1/3 h-[320px] w-[320px]" />
      <Glow color="cyan" className="right-10 bottom-20 h-[280px] w-[280px]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="CORE SYSTEM"
          title="Five modules. Every execution flows through them."
          subtitle="The architecture is boring on purpose — so your agents don't have to be."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          {modules.map((mod, i) => (
            <m.div
              key={mod.tag}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              // Two across on a tablet with the fifth full width; on a
              // laptop, two wide modules over three.
              className={
                i < 2
                  ? "lg:col-span-3"
                  : "sm:last:col-span-2 lg:col-span-2 lg:last:col-span-2"
              }
            >
              <Card className="h-full">
                <div className="flex items-center justify-between mb-5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan">
                    ▸ {mod.tag} / {mod.spec}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_#00FFD1]" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{mod.name}</h3>
                <p className="text-sm leading-relaxed text-muted">{mod.body}</p>
              </Card>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
}
