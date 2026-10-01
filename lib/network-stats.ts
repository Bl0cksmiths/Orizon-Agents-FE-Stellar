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
  pending: "Still reading — the backend may be waking up",
} as const;

/** "2,481" — every count on every surface, in one locale. */
export const formatCount = (n: number): string => n.toLocaleString("en-US");

/** The measured overview, as sent. Its nulls are gaps with a reason. */
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
    bound: measured(o.agents.bound),
    external: measured(o.agents.external),
    operatorWallets: measured(o.operators.external_wallets),
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
  };
}

function trustFromOverview(t: OverviewV2["trust"]): Measured<Trust> {
  if (t.avg === null) {
    return gap(t.rated_agents === 0 ? REASONS.noRatings : REASONS.reputation);
  }
  if (t.avg < 0 || t.avg > TRUST_SCALE_MAX) return gap(REASONS.trustScale);
  return measured({ avg: t.avg, ratedAgents: t.rated_agents });
}

/**
 * Average trust over the agents rated on-chain, on the 0–5 scale. Agents
 * whose score is the prior are left out — the prior is an assumption, not a
 * rating — and so are entries the batch marks degraded, whose `source` cannot
 * be trusted to mean what it says.
 */
export function onchainTrust(batch: ReputationBatch): Measured<Trust> {
  const entries = Object.values(batch.reputations);
  const rated = entries.filter((r) => r.source === "onchain" && !r.degraded);
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

/**
 * The registry's skill mix: the `top` skills listed by the most agents, then
 * one "other" row for the agents that list none of them. `pct` is a share of
 * every registered agent, so the rows do not sum to 100 — an agent can list
 * several skills. Ties break by name so the order cannot shuffle between
 * polls.
 */
export function deriveSkillMix(
  agents: readonly Agent[],
  top = SKILL_MIX_TOP,
): SkillShare[] {
  const total = agents.length;
  if (total === 0) return [];
  const perAgent = agents.map(
    (a) => new Set(a.skills.map(skillKey).filter(Boolean)),
  );
  const counts = new Map<string, number>();
  for (const skills of perAgent) {
    for (const s of skills) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const ranked = Array.from(counts, ([name, n]) => ({ name, agents: n }))
    .sort((a, b) => b.agents - a.agents || a.name.localeCompare(b.name))
    .slice(0, top);
  const named = new Set(ranked.map((r) => r.name));
  const rest = perAgent.filter(
    (skills) => !Array.from(skills).some((s) => named.has(s)),
  ).length;
  const rows =
    rest > 0 ? [...ranked, { name: OTHER_SKILLS, agents: rest }] : ranked;
  return rows.map((r) => ({
    ...r,
    pct: Math.round((r.agents / total) * 100),
  }));
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
  };
}

/** Whether any figure is waiting on a read still in flight. */
export function hasPendingReads(s: NetworkStats): boolean {
  return Object.values(s).some(
    (v) =>
      typeof v === "object" &&
      v !== null &&
      "pending" in v &&
      v.pending === true,
  );
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
