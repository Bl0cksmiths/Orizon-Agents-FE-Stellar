import {
  OTHER_SKILLS,
  formatCount,
  sourceBreakdown,
  type NetworkStats,
  type SourceSlice,
} from "@/lib/network-stats";

/** One colour per source, fixed by the source — never by rank — so a slice
 * keeps its colour when another one appears or drops out. */
const TONE: Record<SourceSlice["key"], string> = {
  seeded: "bg-violet",
  external: "bg-cyan",
  "onchain-other": "bg-magenta",
  onchain: "bg-magenta",
  unknown: "bg-muted/50",
};

const agents = (n: number) => `${formatCount(n)} agent${n === 1 ? "" : "s"}`;

/** "6 of 37 on-chain agents have a bound endpoint", or the reason that
 * figure is missing. */
export function boundLine(s: NetworkStats): string | null {
  if (!s.onchain.ok) return null;
  if (!s.bound.ok) return `Bound endpoints: — ${s.bound.reason}.`;
  const n = s.onchain.value;
  return `${formatCount(s.bound.value)} of ${formatCount(n)} on-chain ${n === 1 ? "agent has" : "agents have"} a bound endpoint`;
}

/** "46 of 49 listed online", or null when either count is unknown. */
export function onlineLine(s: NetworkStats): string | null {
  if (!s.online.ok || !s.registered.ok) return null;
  return `${formatCount(s.online.value)} of ${formatCount(s.registered.value)} listed online`;
}

/**
 * The network composition card: the registry by source as one stacked bar
 * with a legend of counts, how much of the on-chain registry is reachable,
 * and the most-listed skills as tags with their agent counts.
 *
 * Not a skill-share chart: skills are free-form tags that nearly every agent
 * holds alone, so their shares are one "other" row at ~94% beside five rows
 * of 1–2% (see `sourceBreakdown`). The tags still say what the registry
 * offers; the folded "other" row is left out of them because it is not a
 * skill.
 */
export function Composition({ stats }: { stats: NetworkStats }) {
  const slices = sourceBreakdown(stats);
  const bound = boundLine(stats);
  const online = onlineLine(stats);
  const skills = stats.skills.ok
    ? stats.skills.value.filter((r) => r.name !== OTHER_SKILLS)
    : [];

  return (
    <div className="space-y-5">
      {!slices.ok ? (
        <p className="font-mono text-[11px] text-muted">
          Composition unavailable — {slices.reason}.
        </p>
      ) : slices.value.length === 0 ? (
        <p className="font-mono text-[11px] text-muted">
          No agents registered yet.
        </p>
      ) : (
        <div>
          {/* The bar is decoration; the legend below carries every figure
              as text, so it is hidden from assistive tech. A 2px surface
              gap separates the segments. */}
          <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden">
            {slices.value.map((x) => (
              <div
                key={x.key}
                className={TONE[x.key]}
                style={{ flexGrow: x.agents, flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {slices.value.map((x) => (
              <li
                key={x.key}
                data-slice={x.key}
                className="flex items-center justify-between gap-3 font-mono text-[11px] text-muted"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 ${TONE[x.key]}`}
                  />
                  <span className="min-w-0">{x.label}</span>
                </span>
                <span className="shrink-0 text-text">
                  {formatCount(x.agents)}
                  <span className="text-muted"> · {x.pct}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(bound || online) && (
        <div className="space-y-1 font-mono text-[11px] text-muted">
          {bound && <p>{bound}</p>}
          {online && <p>{online}</p>}
        </div>
      )}

      {skills.length > 0 && (
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
            Most-listed skills
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {skills.map((r) => (
              <li
                key={r.name}
                data-skill={r.name}
                className="max-w-full truncate border border-border px-2 py-0.5 font-mono text-[11px] text-muted"
              >
                {r.name} · {agents(r.agents)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {slices.ok && !stats.skills.ok && (
        <p className="font-mono text-[11px] text-muted">
          Skills unavailable — {stats.skills.reason}.
        </p>
      )}
    </div>
  );
}
