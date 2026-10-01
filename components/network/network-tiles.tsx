import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NETWORK_LABEL } from "@/components/ui/stellar-link";
import {
  formatCount,
  provenanceCaption,
  walletsCaption,
  type Measured,
  type NetworkStats,
} from "@/lib/network-stats";
import { focusRing } from "@/lib/ui";

/** The tile labels, in order. Static, so they render while the figures load
 * and stay put when the read fails — only the value slot changes. */
export const TILE_LABELS = [
  "Registered agents",
  "External agents",
  "Settled workflows",
  "Avg trust (on-chain)",
] as const;

type Tile = {
  label: (typeof TILE_LABELS)[number];
  value: Measured<string>;
  unit?: string;
  /** Shown under a measured value. A gap shows its reason here instead. */
  caption?: ReactNode;
};

const fmt = (m: Measured<number>): Measured<string> =>
  m.ok ? { ok: true, value: formatCount(m.value) } : m;

function tiles(s: NetworkStats): Tile[] {
  const wallets = walletsCaption(s);
  return [
    {
      label: "Registered agents",
      value: fmt(s.registered),
      caption: provenanceCaption(s),
    },
    {
      label: "External agents",
      value: fmt(s.external),
      caption: wallets && (
        <Link
          href="/app/ecosystem"
          className={`text-cyan underline underline-offset-2 ${focusRing}`}
        >
          {wallets}
        </Link>
      ),
    },
    {
      label: "Settled workflows",
      value: fmt(s.settled),
      // Distinct settled jobs from the settlement store, every payer counted:
      // the team's own disclosed runs are in this figure, so it must never
      // read as outside demand.
      caption: `all time, all payers (team runs included) · ${NETWORK_LABEL}`,
    },
    {
      label: "Avg trust (on-chain)",
      // The 0–5 scale; the suffix is the unit, not a trend.
      value: s.trust.ok
        ? { ok: true, value: s.trust.value.avg.toFixed(2) }
        : s.trust,
      unit: s.trust.ok ? "/ 5" : undefined,
      caption: s.trust.ok
        ? `across ${formatCount(s.trust.value.ratedAgents)} rated agent${s.trust.value.ratedAgents === 1 ? "" : "s"}`
        : undefined,
    },
  ];
}

const LABEL =
  "mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted";
const VALUE = "font-mono text-2xl neon-text sm:text-3xl";
const CAPTION = "mt-2 text-[11px] leading-4 text-muted";

/**
 * The Overview's four figures. `stats` null means nothing has landed yet:
 * skeletons while loading, "unavailable" once the read has failed. A figure
 * that could not be measured is a dash with the reason under it — the dash
 * is hidden from screen readers, which hear "not available" instead.
 */
export function NetworkTiles({
  stats,
  failed,
}: {
  stats: NetworkStats | null;
  failed: boolean;
}) {
  if (!stats) {
    return (
      <>
        {TILE_LABELS.map((label) => (
          <Card key={label} className="min-w-0 p-4 sm:p-6">
            <div className={LABEL}>{label}</div>
            {failed ? (
              <div className="font-mono text-sm text-magenta">unavailable</div>
            ) : (
              <Skeleton className="h-8 w-16" />
            )}
          </Card>
        ))}
      </>
    );
  }
  return (
    <>
      {tiles(stats).map((t) => (
        // data-stat-tile: e2e/responsive-console.spec.ts finds every figure
        // tile by it and checks none is clipped or pushed off screen.
        <Card
          key={t.label}
          className="h-full min-w-0 p-4 sm:p-6"
          data-stat-tile
        >
          <div className={LABEL}>{t.label}</div>
          {t.value.ok ? (
            <>
              <div className={VALUE}>
                {t.value.value}
                {t.unit && (
                  <span className="ml-1.5 text-base text-muted">{t.unit}</span>
                )}
              </div>
              {t.caption && <div className={CAPTION}>{t.caption}</div>}
            </>
          ) : (
            <>
              <div className={VALUE}>
                <span aria-hidden>—</span>
                <span className="sr-only">not available</span>
              </div>
              <p className={CAPTION}>{t.value.reason}</p>
            </>
          )}
        </Card>
      ))}
    </>
  );
}
