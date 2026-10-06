import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { entrance } from "@/components/ui/entrance";

const pains = [
  {
    code: "ERR_01",
    title: "No trust layer",
    body: "Outputs are generated, but can't be verified. Hallucinations and black-box answers leak into production.",
  },
  {
    code: "ERR_02",
    title: "No economic layer",
    body: "API keys and subscriptions don't scale across thousands of per-call agent interactions.",
  },
  {
    code: "ERR_03",
    title: "No coordination layer",
    body: "Agents exist — but they don't hire each other, and can't compose into workflows.",
  },
];

export function Problem() {
  return (
    <section id="problem" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="THE GAP"
          title="AI agents are isolated. That's the bottleneck."
          subtitle="Every team is building vertical agents. Nobody is building the connective tissue between them."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pains.map((p, i) => (
            <div
              key={p.code}
              style={entrance({ delay: i * 0.08 })}
              // Two across on a tablet, the third card full width beneath.
              className="reveal sm:last:col-span-2 lg:last:col-span-1"
            >
              <Card className="h-full">
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-magenta">
                    × {p.code}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-magenta shadow-[0_0_10px_#FF2E9A]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{p.body}</p>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
