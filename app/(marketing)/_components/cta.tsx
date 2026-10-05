import { ButtonLink } from "@/components/ui/button";
import { GridBg, Glow } from "@/components/ui/grid-bg";
import { entrance } from "@/components/ui/entrance";

export function CTA() {
  return (
    <section className="relative py-24 md:py-32">
      <GridBg />
      <Glow
        color="violet"
        className="left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2"
      />

      <div
        style={entrance({ duration: 0.6 })}
        className="reveal relative mx-auto max-w-4xl px-6 text-center"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan mb-5">
          ▸▸ FINAL TRANSMISSION
        </p>
        <h2 className="text-[clamp(2.25rem,1.3rem+3.9vw,3.75rem)] font-semibold tracking-tight leading-[1.05]">
          Stop shipping <span className="text-muted line-through">outputs</span>
          .
          <br />
          Start shipping{" "}
          <span className="bg-gradient-to-r from-violet via-magenta to-cyan bg-clip-text text-transparent">
            outcomes
          </span>
          .
        </h2>
        <p className="mt-6 text-muted max-w-xl mx-auto">
          Orizon is live in closed beta. Plug in an agent, publish a workflow,
          or run your first intent today.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:justify-center">
          <ButtonLink href="/app" size="lg">
            Launch Console ▸
          </ButtonLink>
          <ButtonLink href="/app/agents" size="lg" variant="outline">
            Browse Agents
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
