/**
 * The network figures: read as sent from the measured overview, derived from
 * the registry, the adoption read and the reputation batch against an older
 * backend — and a gap with a reason, never a number, whenever a read fails.
 */

import { describe, expect, it } from "vitest";

import type { EcosystemAdoption } from "./ecosystem";
import { screenAgentList } from "./guards";
import {
  OTHER_SKILLS,
  REASONS,
  deriveNetworkStats,
  deriveSkillMix,
  hasPendingReads,
  onchainTrust,
  provenanceCaption,
  sourceBreakdown,
  sidebarLine,
  statsFromOverview,
  walletsCaption,
  type NetworkStats,
  type Read,
} from "./network-stats";
import type {
  Agent,
  OverviewV2,
  ReputationBatch,
  ReputationInfo,
} from "./types";

const overviewV2: OverviewV2 = {
  generated_at: 1_790_900_000,
  agents: {
    registered: 25,
    onchain: 13,
    seeded: 12,
    external: 11,
    bound: 6,
    online: 22,
  },
  operators: { external_wallets: 7 },
  workflows: {
    settled: 3,
    series: [
      { date: "2026-10-01", settled: 1 },
      { date: "2026-10-02", settled: 2 },
    ],
  },
  tasks: { recent: 4, complete: 3, failed: 1, completion_rate: 0.75 },
  trust: { avg: 3.49, rated_agents: 12 },
  skills: [
    { name: "research", agents: 4, pct: 16 },
    { name: "code", agents: 3, pct: 12 },
  ],
  degraded: false,
};

const agent = (over: Partial<Agent> & { id: string }): Agent => ({
  name: over.id,
  skills: [],
  price: 0.01,
  rep: 4.9,
  status: "online",
  runs: 18_420,
  ...over,
});

const agents: Agent[] = [
  agent({ id: "a", source: "seeded", bound: null, skills: ["code", "seo"] }),
  agent({ id: "b", source: "seeded", bound: null, skills: ["Code"] }),
  agent({ id: "c", source: "onchain", bound: true, skills: ["research"] }),
  agent({
    id: "d",
    source: "onchain",
    bound: false,
    status: "offline",
    skills: ["research", "code"],
  }),
  agent({ id: "e", source: "onchain", bound: true, status: "idle" }),
];

const adoption = (
  over: Partial<EcosystemAdoption> = {},
): EcosystemAdoption => ({
  network: "testnet",
  generated_at: 1_790_875_612,
  targets: {
    external_agents: 2,
    unique_operator_wallets: 2,
    settled_external_workflows: 3,
  },
  totals: {
    external_agents: 11,
    unique_operator_wallets: 7,
    settled_external_workflows: 0,
  },
  met: {
    external_agents: true,
    unique_operator_wallets: true,
    settled_external_workflows: false,
  },
  operators: [],
  excluded: [],
  degraded: false,
  unreadable_agents: [],
  window_days: 7,
  ...over,
});

const rep = (
  agent_id: string,
  smoothed_bps: number,
  over: Partial<ReputationInfo> = {},
): ReputationInfo => ({
  agent_id,
  smoothed_bps,
  lower_bound_bps: smoothed_bps - 500,
  avg_bps: smoothed_bps,
  count: 3,
  weight: 1,
  disputed: 0,
  dispute_rate_bps: 0,
  source: "onchain",
  ...over,
});

const batch = (...entries: ReputationInfo[]): ReputationBatch => ({
  reputations: Object.fromEntries(entries.map((r) => [r.agent_id, r])),
  floor_bps: 5500,
  prior_bps: 7000,
});

const ok = <T>(value: T): Read<T> => ({ ok: true, value });
const failed = <T>(error = "GET → 503"): Read<T> => ({ ok: false, error });

/** Every number a NetworkStats states, so a test can assert none was
 * invented. */
function statedNumbers(s: NetworkStats): number[] {
  const out: number[] = [];
  for (const v of Object.values(s)) {
    if (v && typeof v === "object" && "ok" in v && v.ok) {
      if (typeof v.value === "number") out.push(v.value);
    }
  }
  return out;
}

describe("statsFromOverview (the measured shape)", () => {
  it("states every figure as the backend sent it", () => {
    const s = statsFromOverview(overviewV2);
    expect(s.source).toBe("overview");
    expect(s.registered).toEqual({ ok: true, value: 25 });
    expect(s.onchain).toEqual({ ok: true, value: 13 });
    expect(s.seeded).toEqual({ ok: true, value: 12 });
    expect(s.external).toEqual({ ok: true, value: 11 });
    expect(s.operatorWallets).toEqual({ ok: true, value: 7 });
    expect(s.bound).toEqual({ ok: true, value: 6 });
    expect(s.online).toEqual({ ok: true, value: 22 });
    expect(s.settled).toEqual({ ok: true, value: 3 });
    expect(s.series).toEqual({ ok: true, value: overviewV2.workflows.series });
    expect(s.trust).toEqual({
      ok: true,
      value: { avg: 3.49, ratedAgents: 12 },
    });
    expect(s.skills).toEqual({ ok: true, value: overviewV2.skills });
    expect(s.notes).toEqual([]);
  });

  it("reads an unreadable settled count as a gap, series included", () => {
    const s = statsFromOverview({
      ...overviewV2,
      workflows: {
        settled: null,
        series: [{ date: "2026-10-02", settled: 0 }],
      },
    });
    expect(s.settled).toEqual({ ok: false, reason: REASONS.settledUnreadable });
    expect(s.series).toEqual({ ok: false, reason: REASONS.settledUnreadable });
  });

  it("keeps an empty series as a measured none, not a gap", () => {
    const s = statsFromOverview({
      ...overviewV2,
      workflows: { settled: 0, series: [] },
    });
    expect(s.settled).toEqual({ ok: true, value: 0 });
    expect(s.series).toEqual({ ok: true, value: [] });
  });

  it("reads each part the backend could not read as a gap, never a zero", () => {
    const s = statsFromOverview({
      ...overviewV2,
      agents: { ...overviewV2.agents, external: null, bound: null },
      operators: { external_wallets: null },
      trust: { avg: null, rated_agents: null },
      degraded: true,
    });
    expect(s.external).toEqual({ ok: false, reason: REASONS.owners });
    expect(s.operatorWallets).toEqual({ ok: false, reason: REASONS.owners });
    expect(s.bound).toEqual({ ok: false, reason: REASONS.bindings });
    expect(s.trust).toEqual({ ok: false, reason: REASONS.reputation });
    expect(s.registered).toEqual({ ok: true, value: 25 });
    expect(statedNumbers(s)).not.toContain(0);
  });

  it("says no ratings yet when nobody is rated, and unreadable otherwise", () => {
    expect(
      statsFromOverview({
        ...overviewV2,
        trust: { avg: null, rated_agents: 0 },
      }).trust,
    ).toEqual({ ok: false, reason: REASONS.noRatings });
    expect(
      statsFromOverview({
        ...overviewV2,
        trust: { avg: null, rated_agents: 4 },
      }).trust,
    ).toEqual({ ok: false, reason: REASONS.reputation });
  });

  it("does not state an average whose rated-agent count is unknown", () => {
    expect(
      statsFromOverview({
        ...overviewV2,
        trust: { avg: 3.2, rated_agents: null },
      }).trust,
    ).toEqual({ ok: false, reason: REASONS.reputation });
  });

  it("refuses a trust average off the 0–5 scale rather than printing it", () => {
    expect(
      statsFromOverview({
        ...overviewV2,
        trust: { avg: 6977, rated_agents: 12 },
      }).trust,
    ).toEqual({ ok: false, reason: REASONS.trustScale });
  });

  it("notes a degraded read", () => {
    expect(statsFromOverview({ ...overviewV2, degraded: true }).notes).toEqual([
      expect.stringMatching(/couldn't read part of the network/),
    ]);
  });
});

describe("deriveNetworkStats (an older backend)", () => {
  const all = {
    agents: ok(agents),
    adoption: ok(adoption()),
    reputation: ok(batch(rep("c", 7000), rep("d", 6000))),
  };

  it("counts the registry by provenance, status and binding", () => {
    const s = deriveNetworkStats(all);
    expect(s.source).toBe("derived");
    expect(s.registered).toEqual({ ok: true, value: 5 });
    expect(s.onchain).toEqual({ ok: true, value: 3 });
    expect(s.seeded).toEqual({ ok: true, value: 2 });
    expect(s.online).toEqual({ ok: true, value: 3 });
    expect(s.bound).toEqual({ ok: true, value: 2 });
  });

  it("takes external agents and operator wallets from the adoption totals", () => {
    const s = deriveNetworkStats(all);
    expect(s.external).toEqual({ ok: true, value: 11 });
    expect(s.operatorWallets).toEqual({ ok: true, value: 7 });
  });

  it("averages on-chain trust on the 0–5 scale", () => {
    expect(deriveNetworkStats(all).trust).toEqual({
      ok: true,
      value: { avg: 3.25, ratedAgents: 2 },
    });
  });

  it("never passes the adoption window's external settlements off as the total", () => {
    const s = deriveNetworkStats({
      ...all,
      adoption: ok(
        adoption({
          totals: {
            external_agents: 11,
            unique_operator_wallets: 7,
            settled_external_workflows: 4,
          },
        }),
      ),
    });
    expect(s.settled).toEqual({ ok: false, reason: REASONS.settledUnreported });
    expect(s.series).toEqual({ ok: false, reason: REASONS.settledUnreported });
  });

  it("ignores nothing it was given and invents nothing it was not", () => {
    // Every number stated is one the reads above contain.
    expect(statedNumbers(deriveNetworkStats(all)).sort()).toEqual(
      [5, 3, 2, 3, 2, 11, 7].sort(),
    );
  });

  describe("partial failures", () => {
    it("a dead registry leaves the adoption figures standing", () => {
      const s = deriveNetworkStats({ ...all, agents: failed() });
      for (const k of [
        "registered",
        "onchain",
        "seeded",
        "online",
        "bound",
        "skills",
      ] as const) {
        expect(s[k]).toEqual({ ok: false, reason: REASONS.registry });
      }
      expect(s.external).toEqual({ ok: true, value: 11 });
    });

    it("a dead adoption read leaves the registry counts standing", () => {
      const s = deriveNetworkStats({ ...all, adoption: failed() });
      expect(s.external).toEqual({ ok: false, reason: REASONS.adoption });
      expect(s.operatorWallets).toEqual({
        ok: false,
        reason: REASONS.adoption,
      });
      expect(s.registered).toEqual({ ok: true, value: 5 });
    });

    it("a dead reputation read is a gap, not 'no ratings'", () => {
      expect(
        deriveNetworkStats({ ...all, reputation: failed() }).trust,
      ).toEqual({ ok: false, reason: REASONS.reputation });
    });

    it("states no number at all when every read failed", () => {
      const s = deriveNetworkStats({
        agents: failed(),
        adoption: failed(),
        reputation: failed(),
      });
      expect(statedNumbers(s)).toEqual([]);
    });

    it("says a read still in flight is pending, not failed", () => {
      const s = deriveNetworkStats({
        ...all,
        adoption: { ok: false, error: "still reading", pending: true },
      });
      expect(s.external).toEqual({
        ok: false,
        reason: REASONS.pending,
        pending: true,
      });
      expect(hasPendingReads(s)).toBe(true);
      expect(hasPendingReads(deriveNetworkStats(all))).toBe(false);
      expect(
        hasPendingReads(deriveNetworkStats({ ...all, adoption: failed() })),
      ).toBe(false);
    });

    it("notes registry entries the guard dropped", () => {
      const screened = screenAgentList([...agents, { id: "broken" }]);
      expect(screened).not.toBeNull();
      const s = deriveNetworkStats({ ...all, agents: ok(screened!) });
      expect(s.registered).toEqual({ ok: true, value: 5 });
      expect(s.notes).toEqual([
        "1 registry entry couldn't be read and isn't counted.",
      ]);
    });

    it("notes an adoption read that could not verify every owner", () => {
      expect(
        deriveNetworkStats({
          ...all,
          adoption: ok(adoption({ unreadable_agents: ["x", "y"] })),
        }).notes,
      ).toEqual([
        "Couldn't verify the owner of 2 agents right now — the external count may be low.",
      ]);
      expect(
        deriveNetworkStats({
          ...all,
          adoption: ok(adoption({ degraded: true, unreadable_agents: null })),
        }).notes,
      ).toEqual([
        "Couldn't verify every agent's owner right now — the external count may be low.",
      ]);
    });
  });
});

describe("onchainTrust", () => {
  it("averages every agent with on-chain evidence, a last-known read included, and leaves the prior out", () => {
    expect(
      onchainTrust(
        batch(
          rep("rated", 8000),
          rep("prior", 7000, { source: "prior" }),
          rep("last-known", 6000, { degraded: true }),
        ),
      ),
    ).toEqual({ ok: true, value: { avg: 3.5, ratedAgents: 2 } });
  });

  it("is 'no ratings yet' when nothing is rated and nothing failed", () => {
    expect(onchainTrust(batch(rep("p", 7000, { source: "prior" })))).toEqual({
      ok: false,
      reason: REASONS.noRatings,
    });
    expect(onchainTrust(batch())).toEqual({
      ok: false,
      reason: REASONS.noRatings,
    });
  });

  it("is unreadable when the only reason nothing is rated is a failed read", () => {
    expect(
      onchainTrust(batch(rep("p", 7000, { source: "prior", degraded: true }))),
    ).toEqual({ ok: false, reason: REASONS.reputation });
  });
});

/**
 * The expected rows below were worked by hand from the backend's `_skills`
 * and `_largest_remainder` (app/routers/metrics.py, BE PR #103), so the two
 * paths state the same mix for the same registry.
 */
describe("deriveSkillMix", () => {
  it("counts each agent once per skill, case-folded, with tag shares summing to 100", () => {
    const mix = deriveSkillMix([
      agent({ id: "1", skills: ["Code", "code", " code "] }),
      agent({ id: "2", skills: ["code"] }),
      agent({ id: "3", skills: ["research"] }),
      agent({ id: "4", skills: [] }),
    ]);
    // Tags: code 2, research 1 → 66.7 / 33.3 → 67 / 33.
    expect(mix).toEqual([
      { name: "code", agents: 2, pct: 67 },
      { name: "research", agents: 1, pct: 33 },
    ]);
  });

  it("keeps the top five and folds every other skill into one row", () => {
    const list = [
      ...["a", "b", "c", "d", "e"].flatMap((s, i) =>
        Array.from({ length: 6 - i }, (_, j) =>
          agent({ id: `${s}${j}`, skills: [s] }),
        ),
      ),
      agent({ id: "f0", skills: ["f"] }),
      agent({ id: "g0", skills: ["g", "a"] }),
      agent({ id: "none", skills: [] }),
    ];
    // Holders a7 b5 c4 d3 e2, rest {f, g} held by f0 and g0. Tags total 23:
    // floors 30 21 17 13 8 8 (97), the three spare points to the largest
    // remainders — b (17), e (16) and other (16).
    expect(deriveSkillMix(list)).toEqual([
      { name: "a", agents: 7, pct: 30 },
      { name: "b", agents: 5, pct: 22 },
      { name: "c", agents: 4, pct: 17 },
      { name: "d", agents: 3, pct: 13 },
      { name: "e", agents: 2, pct: 9 },
      { name: OTHER_SKILLS, agents: 2, pct: 9 },
    ]);
  });

  it("folds a skill literally named other into the other row", () => {
    expect(
      deriveSkillMix([
        agent({ id: "x", skills: ["other"] }),
        agent({ id: "y", skills: ["code"] }),
      ]),
    ).toEqual([
      { name: "code", agents: 1, pct: 50 },
      { name: OTHER_SKILLS, agents: 1, pct: 50 },
    ]);
  });

  it("breaks ties by name so the order is stable between polls", () => {
    const mix = deriveSkillMix([
      agent({ id: "1", skills: ["zeta"] }),
      agent({ id: "2", skills: ["alpha"] }),
    ]);
    expect(mix.map((r) => r.name)).toEqual(["alpha", "zeta"]);
  });

  it("is empty when no agent lists a skill", () => {
    expect(deriveSkillMix([])).toEqual([]);
    expect(deriveSkillMix([agent({ id: "1", skills: [" "] })])).toEqual([]);
  });
});

describe("sourceBreakdown", () => {
  it("splits the registry into seeded, external and the rest of on-chain, summing to 100", () => {
    // Live testnet, 2026-10-02: 49 registered, 12 seeded, 37 on-chain, 24
    // external.
    const s = statsFromOverview({
      ...overviewV2,
      agents: {
        ...overviewV2.agents,
        registered: 49,
        seeded: 12,
        onchain: 37,
        external: 24,
      },
    });
    expect(sourceBreakdown(s)).toEqual({
      ok: true,
      value: [
        { key: "seeded", label: "Seeded catalog", agents: 12, pct: 24 },
        {
          key: "external",
          label: "On-chain · external operators",
          agents: 24,
          pct: 49,
        },
        {
          key: "onchain-other",
          label: "On-chain · team or unverified owner",
          agents: 13,
          pct: 27,
        },
      ],
    });
  });

  it("keeps on-chain whole when the external count is not known", () => {
    const s = statsFromOverview({
      ...overviewV2,
      agents: { ...overviewV2.agents, external: null },
    });
    const slices = sourceBreakdown(s);
    expect(slices.ok && slices.value.map((x) => [x.key, x.agents])).toEqual([
      ["seeded", 12],
      ["onchain", 13],
    ]);
  });

  it("refuses an external count larger than the on-chain registry", () => {
    const s = statsFromOverview({
      ...overviewV2,
      agents: { ...overviewV2.agents, external: 99 },
    });
    const slices = sourceBreakdown(s);
    expect(slices.ok && slices.value.map((x) => x.key)).toEqual([
      "seeded",
      "onchain",
    ]);
  });

  it("names agents of an unknown source rather than dropping them", () => {
    const s = statsFromOverview({
      ...overviewV2,
      agents: { ...overviewV2.agents, registered: 27 },
    });
    const slices = sourceBreakdown(s);
    expect(slices.ok && slices.value.at(-1)).toMatchObject({
      key: "unknown",
      agents: 2,
    });
  });

  it("is empty for an empty registry and a gap for an unreadable one", () => {
    const empty = deriveNetworkStats({
      agents: ok([]),
      adoption: failed(),
      reputation: failed(),
    });
    expect(sourceBreakdown(empty)).toEqual({ ok: true, value: [] });
    const dead = deriveNetworkStats({
      agents: failed(),
      adoption: failed(),
      reputation: failed(),
    });
    expect(sourceBreakdown(dead)).toEqual({
      ok: false,
      reason: REASONS.registry,
    });
  });
});

describe("captions", () => {
  const s = statsFromOverview(overviewV2);
  const blank = deriveNetworkStats({
    agents: failed(),
    adoption: failed(),
    reputation: failed(),
  });

  it("states the provenance split and the wallet count", () => {
    expect(provenanceCaption(s)).toBe("13 on-chain · 12 seeded");
    expect(walletsCaption(s)).toBe("from 7 operator wallets");
    expect(
      walletsCaption({ ...s, operatorWallets: { ok: true, value: 1 } }),
    ).toBe("from 1 operator wallet");
    expect(provenanceCaption(blank)).toBeNull();
    expect(walletsCaption(blank)).toBeNull();
  });

  it("writes the sidebar line, dashing what could not be read", () => {
    expect(sidebarLine(s)).toBe("25 agents registered · 11 external");
    expect(
      sidebarLine({
        ...s,
        registered: { ok: true, value: 2481 },
        external: { ok: true, value: 1 },
      }),
    ).toBe("2,481 agents registered · 1 external");
    expect(sidebarLine({ ...s, registered: { ok: true, value: 1 } })).toBe(
      "1 agent registered · 11 external",
    );
    expect(sidebarLine(blank)).toBe("— agents registered · — external");
  });
});
