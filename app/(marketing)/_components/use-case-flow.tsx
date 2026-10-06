import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { entrance } from "@/components/ui/entrance";
import { SectionHeading } from "@/components/ui/section-heading";

/** One intent, the chain of agents composed for it, and what it produced. */
export type UseCase = {
  id: string;
  title: string;
  input: string;
  chain: readonly string[];
  output: string;
};

export const USE_CASES: readonly UseCase[] = [
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

/** The section's heading, shared by the tabbed section and its fallback. */
export function UseCasesHeading() {
  return (
    <SectionHeading
      eyebrow="IN MOTION"
      title="Real intents. Real agent chains. Real outcomes."
      subtitle="Every workflow is composed on the fly. No hand-wired pipelines."
    />
  );
}

/** One use case's intent, agent chain and outcome. */
export function UseCaseFlow({ useCase }: { useCase: UseCase }) {
  return (
    <Card>
      <div className="grid gap-6 md:grid-cols-[1fr_2fr_1fr] items-center">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan mb-2">
            ▸ Intent
          </div>
          <div className="text-lg font-medium">"{useCase.input}"</div>
        </div>

        <div className="relative">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted mb-3 text-center">
            agent chain
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {useCase.chain.map((agent, i) => (
              <div
                key={agent}
                style={entrance({
                  delay: i * 0.08,
                  duration: 0.35,
                  from: "translateX(-12px)",
                })}
                className="enter flex items-center gap-2"
              >
                <Badge tone="violet">{agent}</Badge>
                {i < useCase.chain.length - 1 && (
                  <span className="text-cyan text-xs">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="md:text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-magenta mb-2">
            Outcome ▸
          </div>
          <div className="text-lg font-medium">{useCase.output}</div>
        </div>
      </div>
    </Card>
  );
}
