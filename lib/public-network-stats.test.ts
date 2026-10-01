/**
 * The home page's figures, read on the server: the measured overview when
 * the backend serves it, otherwise the registry and the adoption read; a
 * figure that cannot be read is null, and nothing read at all is null.
 */
import { describe, expect, it, vi } from "vitest";

import {
  PUBLIC_STATS_REVALIDATE_S,
  getPublicNetworkStats,
} from "./public-network-stats";

const ENV = { NEXT_PUBLIC_API_BASE: "https://be.example.com/api/" };

const measured = {
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

const legacy = {
  agents_online: 2527,
  tasks_per_sec: 1.284,
  avg_completion: 0,
  avg_trust: 3.49,
  throughput: [22, 18],
  skills: [{ name: "content", pct: 38, tone: "violet" }],
};

const agent = (id: string, source: string) => ({
  id,
  name: id,
  skills: [],
  price: 0.01,
  rep: 4,
  status: "online",
  runs: 0,
  source,
  bound: null,
});

const adoption = {
  network: "testnet",
  generated_at: 1_790_875_612,
  targets: {
    external_agents: 2,
    unique_operator_wallets: 2,
    settled_external_workflows: 3,
  },
  totals: {
    external_agents: 1,
    unique_operator_wallets: 1,
    settled_external_workflows: 0,
  },
  met: {
    external_agents: false,
    unique_operator_wallets: false,
    settled_external_workflows: false,
  },
  operators: [],
  excluded: [],
};

type Routes = Record<string, unknown | Error | number>;

/** A fake backend: a body per path, an Error to throw, or a status. */
function backend(routes: Routes) {
  return vi.fn(async (url: string, _init: RequestInit) => {
    const path = new URL(url).pathname;
    const r = routes[path];
    if (r instanceof Error) throw r;
    if (r === undefined || typeof r === "number") {
      return new Response("{}", { status: typeof r === "number" ? r : 404 });
    }
    return new Response(JSON.stringify(r), { status: 200 });
  });
}

describe("getPublicNetworkStats", () => {
  it("reads the measured overview alone, at the normalized backend origin", async () => {
    const f = backend({ "/api/metrics/overview": measured });
    await expect(getPublicNetworkStats(ENV, f)).resolves.toEqual({
      registered: 25,
      external: 11,
      operatorWallets: 7,
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe(
      "https://be.example.com/api/metrics/overview",
    );
  });

  it("leaves out the overview's unreadable owner counts rather than printing 0", async () => {
    const f = backend({
      "/api/metrics/overview": {
        ...measured,
        agents: { ...measured.agents, external: null, bound: null },
        operators: { external_wallets: null },
        degraded: true,
      },
    });
    await expect(getPublicNetworkStats(ENV, f)).resolves.toEqual({
      registered: 25,
      external: null,
      operatorWallets: null,
    });
  });

  it("caches each read for the ISR window", async () => {
    const f = backend({ "/api/metrics/overview": measured });
    await getPublicNetworkStats(ENV, f);
    const init = f.mock.calls[0][1] as RequestInit & {
      next?: { revalidate?: number };
    };
    expect(init.next?.revalidate).toBe(PUBLIC_STATS_REVALIDATE_S);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("derives from the registry and adoption read against the legacy overview", async () => {
    const f = backend({
      "/api/metrics/overview": legacy,
      "/api/agents": [
        agent("a", "seeded"),
        agent("b", "onchain"),
        agent("c", "onchain"),
      ],
      "/api/ecosystem/adoption": adoption,
    });
    const stats = await getPublicNetworkStats(ENV, f);
    expect(stats).toEqual({ registered: 3, external: 1, operatorWallets: 1 });
    expect(JSON.stringify(stats)).not.toContain("2527");
  });

  it("derives when the overview read fails outright", async () => {
    const f = backend({
      "/api/metrics/overview": new Error("ECONNREFUSED"),
      "/api/agents": [agent("a", "seeded")],
      "/api/ecosystem/adoption": adoption,
    });
    await expect(getPublicNetworkStats(ENV, f)).resolves.toEqual({
      registered: 1,
      external: 1,
      operatorWallets: 1,
    });
  });

  it("leaves out only the figures it could not read", async () => {
    const f = backend({
      "/api/metrics/overview": legacy,
      "/api/agents": [agent("a", "seeded")],
      "/api/ecosystem/adoption": 503,
    });
    await expect(getPublicNetworkStats(ENV, f)).resolves.toEqual({
      registered: 1,
      external: null,
      operatorWallets: null,
    });

    const malformed = backend({
      "/api/metrics/overview": legacy,
      "/api/agents": { error: "envelope" },
      "/api/ecosystem/adoption": adoption,
    });
    await expect(getPublicNetworkStats(ENV, malformed)).resolves.toEqual({
      registered: null,
      external: 1,
      operatorWallets: 1,
    });
  });

  it("is null when nothing could be read", async () => {
    const f = backend({
      "/api/metrics/overview": new Error("ECONNREFUSED"),
      "/api/agents": new Error("ECONNREFUSED"),
      "/api/ecosystem/adoption": new Error("ECONNREFUSED"),
    });
    await expect(getPublicNetworkStats(ENV, f)).resolves.toBeNull();
  });

  it("is null rather than throwing on an unusable backend origin", async () => {
    const f = backend({});
    await expect(
      getPublicNetworkStats({ NEXT_PUBLIC_API_BASE: "not a url" }, f),
    ).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
