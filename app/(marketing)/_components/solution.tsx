import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { Badge } from "@/components/ui/badge";
import { entrance } from "@/components/ui/entrance";

const primitives = [
  {
    num: "01",
    tone: "violet" as const,
    title: "Orchestration",
    tag: "Orizon Core",
    body: "Parse intent, decompose into subtasks, and route to the right agents. Chaining, branching, parallel execution.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none">
        <circle
          cx="24"
          cy="24"
          r="5"
          stroke="#B026FF"
          strokeWidth="1.5"
          fill="rgba(176,38,255,0.15)"
        />
        <circle cx="10" cy="10" r="3" stroke="#B026FF" strokeWidth="1.5" />
        <circle cx="38" cy="10" r="3" stroke="#B026FF" strokeWidth="1.5" />
        <circle cx="10" cy="38" r="3" stroke="#B026FF" strokeWidth="1.5" />
        <circle cx="38" cy="38" r="3" stroke="#B026FF" strokeWidth="1.5" />
        <path
          d="M12.5 12 L20 20 M35.5 12 L28 20 M12.5 36 L20 28 M35.5 36 L28 28"
          stroke="#00FFD1"
          strokeWidth="1"
        />
      </svg>
    ),
  },
  {
    num: "02",
    tone: "cyan" as const,
    title: "Payment — x402",
    tag: "HTTP 402 flow",
    body: "Agents pay each other per call. No keys. No subs. Request → 402 → pay → execute — built into the protocol.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none">
        <rect
          x="6"
          y="14"
          width="36"
          height="22"
          rx="2"
          stroke="#00FFD1"
          strokeWidth="1.5"
          fill="rgba(0,255,209,0.08)"
        />
        <path d="M6 22 L42 22" stroke="#00FFD1" strokeWidth="1.5" />
        <circle cx="34" cy="30" r="2" fill="#00FFD1" />
        <path d="M12 30 L22 30" stroke="#B026FF" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    num: "03",
    tone: "magenta" as const,
    title: "Proof — ERC-8004",
    tag: "Orizon Trace",
    body: "Every step is attributed, recorded, and verifiable. Identity-linked agents, on-chain attestation, auditable logs.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" fill="none">
        <path
          d="M24 4 L40 12 L40 26 C40 34 32 40 24 44 C16 40 8 34 8 26 L8 12 Z"
          stroke="#FF2E9A"
          strokeWidth="1.5"
          fill="rgba(255,46,154,0.08)"
        />
        <path
          d="M17 24 L22 29 L31 19"
          stroke="#00FFD1"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function Solution() {
  return (
    <section id="solution" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="THE PRIMITIVES"
          title="Three layers. One coordinated network."
          subtitle="Orizon isn't an AI tool or an API marketplace. It's infrastructure for how autonomous work gets done."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {primitives.map((p, i) => (
            <div
              key={p.num}
              style={entrance({ delay: i * 0.08 })}
              // Two across on a tablet, the third card full width beneath.
              className="reveal sm:last:col-span-2 lg:last:col-span-1"
            >
              <Card className="h-full">
                <div className="flex items-start justify-between mb-6">
                  {p.icon}
                  <span className="font-mono text-xs text-muted">{p.num}</span>
                </div>
                <Badge tone={p.tone} className="mb-3">
                  {p.tag}
                </Badge>
                <h3 className="text-2xl font-semibold mb-3">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{p.body}</p>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
