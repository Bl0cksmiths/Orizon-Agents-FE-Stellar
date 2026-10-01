"use client";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

const personas = [
  {
    label: "Developers",
    hook: "Build agent-based apps and monetize APIs via x402 — no billing infra.",
    stat: "12k+ devs building",
  },
  {
    label: "Enterprises",
    hook: "Automate workflows with auditable, on-chain execution trails.",
    stat: "Avg 73% cost reduction",
  },
  {
    label: "Power users / Founders",
    hook: "Ship outcomes, not tasks. One intent, full execution chain.",
    stat: "From idea to live in minutes",
  },
];

export function Personas() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="WHO BUILDS ON ORIZON"
          title="Three audiences. One coordination layer."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p, i) => (
            <m.div
              key={p.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              // Two across on a tablet, the third card full width beneath.
              className="sm:last:col-span-2 lg:last:col-span-1"
            >
              <Card className="h-full">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan mb-4">
                  / {String(i + 1).padStart(2, "0")} persona
                </div>
                <h3 className="text-2xl font-semibold mb-3">{p.label}</h3>
                <p className="text-sm leading-relaxed text-muted mb-6">
                  {p.hook}
                </p>
                <div className="border-t border-border pt-4 font-mono text-xs text-violet">
                  ◆ {p.stat}
                </div>
              </Card>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
}
