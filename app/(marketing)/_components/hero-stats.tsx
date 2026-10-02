import { NETWORK_LABEL } from "@/components/ui/stellar-link";
import { formatCount } from "@/lib/network-stats";
import type { PublicNetworkStats } from "@/lib/public-network-stats";

/** A figure fit to print: a whole, non-negative count. */
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * The hero's figures, as the server read them (lib/public-network-stats.ts):
 * all three together, or no row at all. Never a subset — a hero that states
 * the registered count beside no external figure invites reading the gap as
 * zero — and never a placeholder number.
 */
export function HeroStats({ stats }: { stats: PublicNetworkStats | null }) {
  if (!stats) return null;
  const items = [
    { k: "Registered agents", v: stats.registered },
    { k: "External agents", v: stats.external },
    { k: "Operator wallets", v: stats.operatorWallets },
  ];
  if (!items.every((s) => isCount(s.v))) return null;
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
