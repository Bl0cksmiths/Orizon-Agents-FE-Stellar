import {
  OTHER_SKILLS,
  formatCount,
  type NetworkStats,
} from "@/lib/network-stats";

/** Bar colours in a fixed order, by row. The folded "other" row is neutral
 * so it never reads as one more skill. */
const TONES = [
  "bg-violet shadow-[0_0_10px_#B026FF]",
  "bg-cyan shadow-[0_0_10px_#00FFD1]",
  "bg-magenta shadow-[0_0_10px_#FF2E9A]",
  "bg-violet/60",
  "bg-cyan/60",
];
const OTHER_TONE = "bg-muted/50";

const agentsLabel = (n: number) =>
  `${formatCount(n)} agent${n === 1 ? "" : "s"}`;

/** "22 listed online · 6 with a bound endpoint", or null when unknown. */
export function presenceLine(s: NetworkStats): string | null {
  if (!s.online.ok || !s.bound.ok) return null;
  return `${formatCount(s.online.value)} listed online · ${formatCount(s.bound.value)} with a bound endpoint`;
}

/**
 * The registry's skill mix: each row is the share of registered agents that
 * list the skill, so the rows do not add up to 100 — an agent may list
 * several. A mix that could not be read gives its reason.
 */
export function SkillMix({ stats }: { stats: NetworkStats }) {
  const { skills } = stats;
  const presence = presenceLine(stats);
  return (
    <>
      <div className="space-y-3">
        {!skills.ok ? (
          <p className="font-mono text-[11px] text-muted">
            Skill mix unavailable — {skills.reason}.
          </p>
        ) : skills.value.length === 0 ? (
          <p className="font-mono text-[11px] text-muted">
            No agents registered yet.
          </p>
        ) : (
          skills.value.map((r, i) => (
            <div key={r.name} data-skill={r.name}>
              <div className="mb-1 flex items-center justify-between gap-3 font-mono text-[11px] text-muted">
                <span className="min-w-0 truncate uppercase tracking-widest">
                  {r.name}
                </span>
                <span className="shrink-0">
                  {agentsLabel(r.agents)} · {r.pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden bg-white/5" aria-hidden>
                <div
                  className={`h-full ${r.name === OTHER_SKILLS ? OTHER_TONE : TONES[i % TONES.length]}`}
                  style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
      {skills.ok && skills.value.length > 0 && (
        <p className="mt-4 text-[11px] leading-4 text-muted">
          Share of registered agents listing each skill — an agent can list
          several.
        </p>
      )}
      {presence && (
        <p className="mt-2 font-mono text-[11px] text-muted">{presence}</p>
      )}
    </>
  );
}
