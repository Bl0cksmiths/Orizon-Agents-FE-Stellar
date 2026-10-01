// @vitest-environment jsdom
/**
 * The reads behind the network figures: the measured overview alone when the
 * backend serves it; otherwise the registry, adoption and reputation reads —
 * shared between callers, never awaited past a short wait, and never
 * allowed to turn the legacy overview's invented figures into a display.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EcosystemAdoption } from "./ecosystem";
import { REASONS } from "./network-stats";
import type {
  Agent,
  LegacyOverview,
  OverviewV2,
  ReputationBatch,
} from "./types";
import {
  PENDING_RECHECK_MS,
  clearNetworkStatsCache,
  loadNetworkStats,
  useNetworkStats,
  type NetworkStatsReaders,
} from "./use-network-stats";

const legacy: LegacyOverview = {
  agents_online: 2514,
  tasks_per_sec: 1.284,
  avg_completion: 0.942,
  avg_trust: 4.86,
  throughput: [22, 18, 24],
  skills: [{ name: "content", pct: 38, tone: "violet" }],
};

const measured: OverviewV2 = {
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
  workflows: { settled: 0, series: [] },
  tasks: { recent: 0, complete: 0, failed: 0, completion_rate: null },
  trust: { avg: null, rated_agents: 0 },
  skills: [],
  degraded: false,
};

const agents: Agent[] = [
  {
    id: "seo.brief",
    name: "seo.brief",
    skills: ["seo"],
    price: 0.009,
    rep: 4.9,
    status: "online",
    runs: 18_420,
    source: "seeded",
    bound: null,
  },
  {
    id: "weather_bot",
    name: "Weather Bot",
    skills: ["weather"],
    price: 0.02,
    rep: 3.5,
    status: "online",
    runs: 4,
    source: "onchain",
    bound: true,
  },
];

const adoption = {
  totals: {
    external_agents: 1,
    unique_operator_wallets: 1,
    settled_external_workflows: 0,
  },
  degraded: false,
  unreadable_agents: [],
} as unknown as EcosystemAdoption;

const reputation: ReputationBatch = {
  reputations: {},
  floor_bps: 5500,
  prior_bps: 7000,
};

function readers(over: Partial<NetworkStatsReaders> = {}) {
  return {
    overview: vi.fn(async () => legacy as LegacyOverview | OverviewV2),
    agents: vi.fn(async () => agents),
    adoption: vi.fn(async () => adoption),
    reputation: vi.fn(async () => reputation),
    ...over,
  };
}

beforeEach(() => clearNetworkStatsCache());
afterEach(() => vi.useRealTimers());

describe("loadNetworkStats", () => {
  it("reads the measured overview alone", async () => {
    const r = readers({ overview: vi.fn(async () => measured) });
    const s = await loadNetworkStats(r);
    expect(s.source).toBe("overview");
    expect(s.registered).toEqual({ ok: true, value: 25 });
    expect(r.agents).not.toHaveBeenCalled();
    expect(r.adoption).not.toHaveBeenCalled();
  });

  it("derives from measured reads against the legacy overview, ignoring its figures", async () => {
    const r = readers();
    const s = await loadNetworkStats(r);
    expect(s.source).toBe("derived");
    expect(s.registered).toEqual({ ok: true, value: 2 });
    expect(s.external).toEqual({ ok: true, value: 1 });
    expect(s.trust).toEqual({ ok: false, reason: REASONS.noRatings });
    expect(s.settled.ok).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/2514|2481|1\.284|4\.86|0\.942/);
  });

  it("still derives when the overview itself failed", async () => {
    const s = await loadNetworkStats(
      readers({ overview: vi.fn(() => Promise.reject(new Error("→ 503"))) }),
    );
    expect(s.registered).toEqual({ ok: true, value: 2 });
  });

  it("rejects with the overview's own error when nothing headline was read", async () => {
    const outage = Object.assign(new Error("GET /metrics/overview → 404"), {
      status: 404,
    });
    await expect(
      loadNetworkStats(
        readers({
          overview: vi.fn(() => Promise.reject(outage)),
          agents: vi.fn(() => Promise.reject(new Error("GET /agents → 404"))),
          adoption: vi.fn(() => Promise.reject(new Error("→ 404"))),
        }),
      ),
    ).rejects.toBe(outage);
  });

  it("rejects with the registry's error when the overview was only legacy", async () => {
    const dead = new Error("GET /agents → 503");
    await expect(
      loadNetworkStats(
        readers({
          agents: vi.fn(() => Promise.reject(dead)),
          adoption: vi.fn(() => Promise.reject(new Error("→ 503"))),
        }),
      ),
    ).rejects.toBe(dead);
  });

  it("does not reject while a headline read is only slow", async () => {
    const s = await loadNetworkStats(
      readers({
        agents: vi.fn(() => Promise.reject(new Error("→ 503"))),
        adoption: vi.fn(() => new Promise<EcosystemAdoption>(() => {})),
      }),
      5,
    );
    expect(s.registered).toEqual({ ok: false, reason: REASONS.registry });
    expect(s.external).toMatchObject({ ok: false, pending: true });
  });

  it("reports a slow read as pending, then picks up its answer without asking again", async () => {
    let answer!: (a: EcosystemAdoption) => void;
    const slow = vi.fn(
      () => new Promise<EcosystemAdoption>((resolve) => (answer = resolve)),
    );
    const r = readers({ adoption: slow });

    const first = await loadNetworkStats(r, 5);
    expect(first.external).toEqual({
      ok: false,
      reason: REASONS.pending,
      pending: true,
    });
    expect(first.registered).toEqual({ ok: true, value: 2 });

    answer(adoption);
    const second = await loadNetworkStats(r, 5);
    expect(second.external).toEqual({ ok: true, value: 1 });
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("shares a derived read between callers, but never a failure", async () => {
    const flaky = vi
      .fn<() => Promise<Agent[]>>()
      .mockRejectedValueOnce(new Error("→ 503"))
      .mockResolvedValue(agents);
    const r = readers({ agents: flaky });

    const failedOnce = await loadNetworkStats(r);
    expect(failedOnce.registered.ok).toBe(false);
    await Promise.all([loadNetworkStats(r), loadNetworkStats(r)]);
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(r.adoption).toHaveBeenCalledTimes(1);
  });
});

describe("useNetworkStats", () => {
  it("asks again shortly while a figure is pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer!: (a: EcosystemAdoption) => void;
    const r = readers({
      adoption: vi.fn(
        () => new Promise<EcosystemAdoption>((resolve) => (answer = resolve)),
      ),
    });
    const { result } = renderHook(() => useNetworkStats(r));

    // The first read waits DERIVED_READ_WAIT_MS on the adoption answer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() =>
      expect(result.current.data?.external).toMatchObject({ pending: true }),
    );

    answer(adoption);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_RECHECK_MS);
    });
    await waitFor(() =>
      expect(result.current.data?.external).toEqual({ ok: true, value: 1 }),
    );
  });
});
