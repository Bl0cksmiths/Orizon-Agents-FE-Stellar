import { NETWORK_LABEL } from "@/components/ui/stellar-link";
import { formatCount } from "@/lib/network-stats";
import type { PublicNetworkStats } from "@/lib/public-network-stats";

/**
 * The hero's figures, as the server read them (lib/public-network-stats.ts).
 * A figure that could not be read is left out, and with none the row is not
 * rendered at all: an empty hero is honest, a placeholder number is not.
 */
export function HeroStats({ stats }: { stats: PublicNetworkStats | null }) {
  const items = stats
    ? [
        { k: "Registered agents", v: stats.registered },
        { k: "External agents", v: stats.external },
        { k: "Operator wallets", v: stats.operatorWallets },
      ].filter((s): s is { k: string; v: number } => s.v !== null)
    : [];
  if (items.length === 0) return null;
  return (
    <div data-hero-stats>
      <dl className="grid max-w-md grid-cols-3 gap-4 sm:gap-6">
        {items.map((s) => (
          // dt after dd in the DOM order is not allowed, so the label leads
          // and flex-col-reverse puts the figure on top.
          <div key={s.k} className="flex min-w-0 flex-col-reverse">
            <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              {s.k}
            </dt>
            <dd className="font-mono text-2xl text-text neon-text-cyan">
              {formatCount(s.v)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-mono text-[10px] text-muted">
        Read from the Stellar {NETWORK_LABEL} registry · refreshed every 5
        minutes
      </p>
    </div>
  );
}
