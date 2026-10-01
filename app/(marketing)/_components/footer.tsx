import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { NETWORK_LABEL } from "@/components/ui/stellar-link";
import { DEMO_PATH } from "@/lib/demo/display";
import { EVIDENCE_PATH } from "@/lib/evidence/display";
import { LIST_YOUR_AGENT_PATH } from "@/lib/guide/display";
import { LITEPAPER_PATH } from "@/lib/litepaper/display";

// Display label for the configured network — "mainnet" | "testnet".

const cols = [
  {
    h: "Product",
    l: [
      ["Console", "/app"],
      ["Agents", "/app/agents"],
      ["Reputation", "/app/reputation"],
      ["Orchestrator", "/app/orchestrator"],
      ["Trace", "/app/trace"],
      ["Flow", "/app/flow"],
    ],
  },
  {
    h: "Protocol",
    l: [
      ["ERC-8004", "https://eips.ethereum.org/EIPS/eip-8004"],
      ["x402", "https://www.x402.org"],
      ["Registry", "/app/agents"],
      [
        "Contracts",
        "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar#readme",
      ],
    ],
  },
  {
    h: "Resources",
    l: [
      ["List your agent", LIST_YOUR_AGENT_PATH],
      ["Demo", DEMO_PATH],
      ["Evidence", EVIDENCE_PATH],
      ["Litepaper", LITEPAPER_PATH],
      [
        "Docs",
        "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar#readme",
      ],
      ["API", "https://orizon-agents-be-stellar.onrender.com/docs"],
      ["Status", "https://orizon-agents-be-stellar.onrender.com/health"],
      [
        "Changelog",
        "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/commits",
      ],
    ],
  },
  {
    h: "Team",
    l: [
      ["GitHub", "https://github.com/Bl0cksmiths"],
      ["LinkedIn", "https://www.linkedin.com/in/algorexph/"],
      [
        "Frontend repo",
        "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar",
      ],
      [
        "Backend repo",
        "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar",
      ],
      [
        "Contracts repo",
        "https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar",
      ],
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-surface/40">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
          <div>
            <Logo />
            <p className="mt-5 max-w-xs text-sm text-muted leading-relaxed">
              The orchestration layer for autonomous digital labor.
            </p>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
              build 0.1.0-alpha · all systems nominal
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.h}>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan mb-5">
                {c.h}
              </div>
              <ul className="space-y-3">
                {c.l.map(([label, href]) => {
                  const external = href.startsWith("http");
                  return (
                    <li key={label}>
                      <Link
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noreferrer" : undefined}
                        className="text-sm text-muted hover:text-text transition-colors"
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-muted md:flex-row md:items-center md:justify-between">
          <span>
            © {new Date().getFullYear()} Orizon Agents — all rights reserved
          </span>
          <span>built on stellar {NETWORK_LABEL} · mit licensed</span>
        </div>
      </div>
    </footer>
  );
}
