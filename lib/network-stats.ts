/**
 * The network's figures — how many agents are registered, how many are run by
 * outside operators, what has settled, how trusted the rated agents are — as
 * the console and the home page state them.
 *
 * Two sources, one rule. A backend that serves the measured overview
 * (`OverviewV2`) is read as sent. Against an older backend the legacy
 * overview is IGNORED — its agent count carries a hard-coded 2481, its rate,
 * series and skill mix are constants — and every figure is derived from reads
 * that are measured: the registry (`GET /api/agents`), the adoption read
 * (`GET /api/ecosystem/adoption`) and the reputation batch
 * (`GET /api/stellar/reputation`).
 *
 * Whatever cannot be measured is a `Gap` with a reason, which the surfaces
 * print as "—" beside that reason. Never a placeholder number: a figure on
 * this page is a claim to whoever reads it.
 *
 * Pure: no fetching here. lib/use-network-stats.ts does the reads.
 */

import type { EcosystemAdoption } from "./ecosystem";
import { droppedCount } from "./guards";
import type {
  Agent,
  OverviewV2,
  ReputationBatch,
  SettledDay,
  SkillShare,
} from "./types";

/** A figure that was measured, or the reason it could not be. */
export type Measured<T> =
  | { ok: true; value: T }
  /** `pending`: the read is still in flight, not failed — the surface says
   * so, and asks again shortly. */
  | { ok: false; reason: string; pending?: boolean };

/** The outcome of one read, as the derivation receives it. */
export type Read<T> =
  { ok: true; value: T } | { ok: false; error: string; pending?: boolean };

export type Trust = { avg: number; ratedAgents: number };

export type NetworkStats = {
  /** Which path produced the figures: the measured overview, or the
   * registry-and-adoption derivation used against an older backend. */
  source: "overview" | "derived";
  registered: Measured<number>;
  onchain: Measured<number>;
  seeded: Measured<number>;
  online: Measured<number>;
  bound: Measured<number>;
  external: Measured<number>;
  operatorWallets: Measured<number>;
  settled: Measured<number>;
  /** Settled workflows per day. An empty list is a measured "none". */
  series: Measured<SettledDay[]>;
  trust: Measured<Trust>;
  /** Share of registered agents per skill. Empty when nobody is registered. */
  skills: Measured<SkillShare[]>;
  /** Sentences naming gaps in a read that otherwise succeeded. */
  notes: string[];
  /** True while the backend's registry is not known to be complete
   * (lib/registry-sync.ts). The registry's figures are then either the last
   * complete ones this session read, or gaps — never the partial count. */
  syncing: boolean;
  /**
   * When the figures were read from the network (epoch ms): the measured
   * overview's own `generated_at`, or the registry read on the derived path.
   * The console's cache can hand back a copy minutes old through an outage
   * — as a 200, so nothing has failed — and this is how a surface says so.
   * Absent when unknown.
   */
  asOf?: number | null;
};

const measured = <T>(value: T): Measured<T> => ({ ok: true, value });
const gap = <T>(reason: string): Measured<T> => ({ ok: false, reason });

/** The gap a failed read leaves: still in flight, or failed for `reason`. */
const gapFor = <T>(read: Read<unknown>, reason: string): Measured<T> =>
  !read.ok && read.pending
    ? { ok: false, reason: REASONS.pending, pending: true }
    : gap(reason);

/** How many top skills the derived mix names before folding into "other". */
export const SKILL_MIX_TOP = 5;
/** The label the folded remainder carries. */
export const OTHER_SKILLS = "other";
/** The trust scale every surface prints: smoothed bps / 2000, as the
 * backend's own overview computes it. */
export const TRUST_SCALE_MAX = 5;

export const REASONS = {
  registry: "Couldn't read the agent registry",
  adoption: "Couldn't read the adoption figures",
  reputation: "Couldn't read on-chain reputation right now",
  noRatings: "No on-chain ratings yet",
  trustScale: "Trust was reported on a scale this console doesn't know",
  settledUnreported: "This backend doesn't report settled workflows yet",
  settledUnreadable: "Couldn't read settlements right now",
  owners: "Couldn't verify agent owners right now",
  bindings: "The binding set hasn't loaded yet",
  pending: "Still reading — the backend may be waking up",
  syncing: "syncing registry…",
} as const;

/** "2,481" — every count on every surface, in one locale. */
export const formatCount = (n: number): string => n.toLocaleString("en-US");

/** A count the measured overview may send as null, as a gap for `reason`. */
const orGap = (n: number | null, reason: string): Measured<number> =>
  n === null ? gap(reason) : measured(n);

/** The measured overview, as sent. Its nulls are gaps with a reason — never
 * a zero. */
export function statsFromOverview(o: OverviewV2): NetworkStats {
  const settled =
    o.workflows.settled === null
      ? gap<number>(REASONS.settledUnreadable)
      : measured(o.workflows.settled);
  return {
    source: "overview",
    registered: measured(o.agents.registered),
    onchain: measured(o.agents.onchain),
    seeded: measured(o.agents.seeded),
    online: measured(o.agents.online),
    bound: orGap(o.agents.bound, REASONS.bindings),
    external: orGap(o.agents.external, REASONS.owners),
    operatorWallets: orGap(o.operators.external_wallets, REASONS.owners),
    settled,
    // A series beside an unreadable total would chart days that are missing
    // settlements as days without any.
    series: settled.ok
      ? measured(o.workflows.series)
      : gap(REASONS.settledUnreadable),
    trust: trustFromOverview(o.trust),
    skills: measured(o.skills),
    notes: o.degraded
      ? [
          "The backend couldn't read part of the network just now — some figures may be low until it can.",
        ]
      : [],
    syncing: false,
    asOf: o.generated_at * 1_000,
  };
}

function trustFromOverview(t: OverviewV2["trust"]): Measured<Trust> {
  // A null count means the reputation read itself failed; only a measured
  // zero is "nobody rated yet".
  if (t.rated_agents === null) return gap(REASONS.reputation);
  if (t.avg === null) {
    return gap(t.rated_agents === 0 ? REASONS.noRatings : REASONS.reputation);
  }
  if (t.avg < 0 || t.avg > TRUST_SCALE_MAX) return gap(REASONS.trustScale);
  return measured({ avg: t.avg, ratedAgents: t.rated_agents });
}

/**
 * Average trust over the agents with on-chain rating evidence, on the 0–5
 * scale — the backend overview's own definition (`_trust` in
 * app/routers/metrics.py), seeded agents included when rated. An agent whose
 * score is the flat prior is left out: the prior is an assumption, not a
 * rating. With none rated the average is a gap — "no ratings yet" when that
 * is the measured state, unreadable when a read degraded to the prior.
 */
export function onchainTrust(batch: ReputationBatch): Measured<Trust> {
  const entries = Object.values(batch.reputations);
  const rated = entries.filter((r) => r.source === "onchain");
  if (rated.length === 0) {
    return gap(
      entries.some((r) => r.degraded) ? REASONS.reputation : REASONS.noRatings,
    );
  }
  const meanBps =
    rated.reduce((sum, r) => sum + r.smoothed_bps, 0) / rated.length;
  return measured({ avg: meanBps / 2000, ratedAgents: rated.length });
}

const skillKey = (s: string) => s.trim().toLowerCase();

/** Whole percentages of `weights` that sum to exactly 100: each share
 * floored, the points left over to the largest remainders (ties to the
 * earlier entry) — the backend's `_largest_remainder`. */
function largestRemainder(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const pcts = weights.map((w) => Math.floor((w * 100) / total));
  const order = weights
    .map((w, i) => ({ i, r: (w * 100) % total }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order.slice(0, 100 - pcts.reduce((a, b) => a + b, 0))) {
    pcts[i] += 1;
  }
  return pcts;
}

/**
 * The registry's skill mix, by the backend overview's own definition
 * (`_skills` in app/routers/metrics.py), so the two paths cannot disagree:
 * the `top` skills held by the most agents, then one "other" row for every
 * remaining skill (a skill literally named "other" included). `agents` is how
 * many agents hold the skill — for "other", how many hold any of the rest —
 * and `pct` is the row's share of every skill TAG in the registry, summing
 * to 100. Ties break by name so the order cannot shuffle between polls.
 */
export function deriveSkillMix(
  agents: readonly Agent[],
  top = SKILL_MIX_TOP,
): SkillShare[] {
  const holders = new Map<string, Set<string>>();
  for (const a of agents) {
    for (const skill of new Set(a.skills.map(skillKey).filter(Boolean))) {
      const set = holders.get(skill) ?? new Set<string>();
      set.add(a.id);
      holders.set(skill, set);
    }
  }
  const size = (s: string) => holders.get(s)?.size ?? 0;
  const ranked = Array.from(holders.keys())
    .filter((s) => s !== OTHER_SKILLS)
    .sort((a, b) => size(b) - size(a) || (a < b ? -1 : a > b ? 1 : 0));
  const named = ranked.slice(0, top);
  const rest = ranked.slice(top);
  if (holders.has(OTHER_SKILLS)) rest.push(OTHER_SKILLS);

  const rows = named.map((name) => ({
    name,
    agents: size(name),
    tags: size(name),
  }));
  if (rest.length > 0) {
    const anyOfRest = new Set(
      rest.flatMap((s) => Array.from(holders.get(s) ?? [])),
    );
    rows.push({
      name: OTHER_SKILLS,
      agents: anyOfRest.size,
      tags: rest.reduce((sum, s) => sum + size(s), 0),
    });
  }
  if (rows.length === 0) return [];
  const pcts = largestRemainder(rows.map((r) => r.tags));
  return rows.map((r, i) => ({ name: r.name, agents: r.agents, pct: pcts[i] }));
}

/**
 * The figures an older backend's own reads support. Each read fails alone:
 * a dead adoption read leaves the registry counts standing, and the reverse.
 * Settled workflows are a gap on this path — the adoption read counts only
 * external settlements over a short ledger window, which is not the
 * network's total and must not be passed off as one.
 */
export function deriveNetworkStats(reads: {
  agents: Read<Agent[]>;
  adoption: Read<EcosystemAdoption>;
  reputation: Read<ReputationBatch>;
}): NetworkStats {
  const notes: string[] = [];
  const { agents, adoption, reputation } = reads;

  const fromRegistry = <T>(pick: (list: Agent[]) => T): Measured<T> =>
    agents.ok ? measured(pick(agents.value)) : gapFor(agents, REASONS.registry);
  const count = (keep: (a: Agent) => boolean) =>
    fromRegistry((list) => list.filter(keep).length);

  if (agents.ok) {
    const dropped = droppedCount(agents.value);
    if (dropped > 0) {
      notes.push(
        `${formatCount(dropped)} registry ${dropped === 1 ? "entry" : "entries"} couldn't be read and ${dropped === 1 ? "isn't" : "aren't"} counted.`,
      );
    }
  }
  if (adoption.ok) {
    const unread = adoption.value.unreadable_agents?.length ?? 0;
    if (unread > 0 || adoption.value.degraded === true) {
      notes.push(
        unread > 0
          ? `Couldn't verify the owner of ${formatCount(unread)} agent${unread === 1 ? "" : "s"} right now — the external count may be low.`
          : "Couldn't verify every agent's owner right now — the external count may be low.",
      );
    }
  }

  return {
    source: "derived",
    registered: fromRegistry((list) => list.length),
    onchain: count((a) => a.source === "onchain"),
    seeded: count((a) => a.source === "seeded"),
    online: count((a) => a.status === "online"),
    bound: count((a) => a.bound === true),
    external: adoption.ok
      ? measured(adoption.value.totals.external_agents)
      : gapFor(adoption, REASONS.adoption),
    operatorWallets: adoption.ok
      ? measured(adoption.value.totals.unique_operator_wallets)
      : gapFor(adoption, REASONS.adoption),
    settled: gap(REASONS.settledUnreported),
    series: gap(REASONS.settledUnreported),
    trust: reputation.ok
      ? onchainTrust(reputation.value)
      : gapFor(reputation, REASONS.reputation),
    skills: fromRegistry((list) => deriveSkillMix(list)),
    notes,
    syncing: false,
  };
}

/** Every figure counted over the registry, so partial while it refills.
 * Settled workflows come from the settlement store and are not among them. */
export const REGISTRY_FIGURES = [
  "registered",
  "onchain",
  "seeded",
  "online",
  "bound",
  "external",
  "operatorWallets",
  "trust",
  "skills",
] as const satisfies readonly (keyof NetworkStats)[];

/**
 * The figures to show for a read whose registry may be partial. A complete
 * read stands as it is. Otherwise every registry figure is the last complete
 * one this session read, or, with none, a pending gap saying the registry is
 * syncing — never the mid-refill count. Settled workflows are kept: they do
 * not come from the registry.
 */
export function withRegistrySync(
  stats: NetworkStats,
  complete: boolean,
  lastComplete: NetworkStats | null,
): NetworkStats {
  if (complete) return { ...stats, syncing: false };
  const out: NetworkStats = { ...stats, syncing: true };
  const held: Measured<unknown> = {
    ok: false,
    reason: REASONS.syncing,
    pending: true,
  };
  for (const key of REGISTRY_FIGURES) {
    Object.assign(out, { [key]: lastComplete ? lastComplete[key] : held });
  }
  out.notes = lastComplete ? lastComplete.notes : [];
  // The registry figures shown are the held ones: date them so.
  if (lastComplete?.asOf != null && stats.asOf != null) {
    out.asOf = Math.min(lastComplete.asOf, stats.asOf);
  }
  return out;
}

/** Whether any figure is waiting on a read still in flight, or on the
 * registry to finish syncing. */
export function hasPendingReads(s: NetworkStats): boolean {
  if (s.syncing) return true;
  return Object.values(s).some(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      "pending" in v &&
      v.pending === true,
  );
}

/** One slice of the registry by where its agents came from. */
export type SourceSlice = {
  key: "seeded" | "external" | "onchain-other" | "onchain" | "unknown";
  label: string;
  agents: number;
  /** Share of every registered agent; the slices sum to 100. */
  pct: number;
};

/**
 * The registry split by source: the seeded first-party catalog, on-chain
 * agents run by outside operators, and the rest of the on-chain registry —
 * team wallets, plus any agent whose owner could not be verified, which the
 * adoption rule does not count as external. When the external count is not
 * known the on-chain slice stays whole rather than being split on a guess.
 *
 * Chosen over the skill mix for the composition card: skills are free-form
 * tags that nearly every agent holds alone, so the mix is one "other" row at
 * ~94% beside five rows of 1–2% — a flat chart that says nothing. Every agent
 * has exactly one source, so this split sums to the registry and reads at a
 * glance.
 */
export function sourceBreakdown(s: NetworkStats): Measured<SourceSlice[]> {
  if (!s.registered.ok) return s.registered;
  if (!s.seeded.ok) return s.seeded;
  if (!s.onchain.ok) return s.onchain;
  const registered = s.registered.value;
  if (registered === 0) return measured([]);
  const seeded = s.seeded.value;
  const onchain = s.onchain.value;
  const external =
    s.external.ok && s.external.value <= onchain ? s.external.value : null;
  const slices: Omit<SourceSlice, "pct">[] = [
    { key: "seeded", label: "Seeded catalog", agents: seeded },
    ...(external === null
      ? [{ key: "onchain" as const, label: "On-chain", agents: onchain }]
      : [
          {
            key: "external" as const,
            label: "On-chain · external operators",
            agents: external,
          },
          {
            key: "onchain-other" as const,
            label: "On-chain · team or unverified owner",
            agents: onchain - external,
          },
        ]),
    {
      key: "unknown",
      label: "Other source",
      agents: Math.max(0, registered - seeded - onchain),
    },
  ];
  const kept = slices.filter((x) => x.agents > 0);
  const pcts = largestRemainder(kept.map((x) => x.agents));
  return measured(kept.map((x, i) => ({ ...x, pct: pcts[i] })));
}

/** "13 on-chain · 12 seeded", or null when the split is not known. */
export function provenanceCaption(s: NetworkStats): string | null {
  if (!s.onchain.ok || !s.seeded.ok) return null;
  return `${formatCount(s.onchain.value)} on-chain · ${formatCount(s.seeded.value)} seeded`;
}

/** "from 7 operator wallets", or null when the wallet count is not known. */
export function walletsCaption(s: NetworkStats): string | null {
  if (!s.operatorWallets.ok) return null;
  const n = s.operatorWallets.value;
  return `from ${formatCount(n)} operator wallet${n === 1 ? "" : "s"}`;
}

/** The sidebar's one line: "25 agents registered · 11 external". A figure
 * that could not be read is a dash, never a number. */
export function sidebarLine(s: NetworkStats): string {
  const reg = s.registered.ok
    ? `${formatCount(s.registered.value)} agent${s.registered.value === 1 ? "" : "s"} registered`
    : "— agents registered";
  const ext = s.external.ok
    ? `${formatCount(s.external.value)} external`
    : "— external";
  return `${reg} · ${ext}`;
}
