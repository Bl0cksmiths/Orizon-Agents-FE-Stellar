"use client";
import { m } from "framer-motion";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const stages = [
  {
    v: "MVP",
    status: "now" as const,
    title: "Prove it works",
    bullets: [
      "Agent registry",
      "Simple chaining",
      "x402 payments",
      "Basic trace",
    ],
  },
  {
    v: "V1",
    status: "next" as const,
    title: "Reputation & cost",
    bullets: ["ERC-8004 scoring", "Cost estimation", "Workflow templates"],
  },
  {
    v: "V2",
    status: "later" as const,
    title: "Dynamic routing",
    bullets: [
      "Best-agent selection",
      "Parallel execution",
      "Cost↔perf optimizer",
    ],
  },
  {
    v: "V3",
    status: "vision" as const,
    title: "Digital labor market",
    bullets: [
      "Self-improving networks",
      "Agent specialization",
      "Autonomous economics",
    ],
  },
];

const toneByStatus: Record<
  (typeof stages)[number]["status"],
  "cyan" | "violet" | "magenta" | "muted"
> = {
  now: "cyan",
  next: "violet",
  later: "magenta",
  vision: "muted",
};

export function Roadmap() {
  return (
    <section id="roadmap" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="TRAJECTORY"
          title="From MVP to a digital labor market."
          subtitle="At V3, you didn't build a product. You built an economy."
        />

        <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-cyan via-violet to-magenta lg:block" />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {stages.map((s, i) => (
              <m.div
                key={s.v}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative flex flex-col"
              >
                <div
                  className={cn(
                    "relative mx-auto mb-6 hidden h-5 w-5 rounded-full lg:block",
                    s.status === "now" && "bg-cyan shadow-[0_0_16px_#00FFD1]",
                    s.status === "next" &&
                      "bg-violet shadow-[0_0_16px_#B026FF]",
                    s.status === "later" &&
                      "bg-magenta shadow-[0_0_16px_#FF2E9A]",
                    s.status === "vision" && "bg-muted/50 ring-2 ring-border",
                  )}
                />
                <div className="clip-cyber flex-1 border border-border bg-surface/60 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-xl font-semibold">
                      {s.v}
                    </span>
                    <Badge tone={toneByStatus[s.status]} dot>
                      {s.status}
                    </Badge>
                  </div>
                  <div className="mb-3 text-lg font-medium">{s.title}</div>
                  <ul className="space-y-1.5 text-sm text-muted">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="text-cyan">›</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
