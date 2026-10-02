/**
 * The home page's figures, read on the server: all three complete, or none.
 * A registry count is accepted only on the backend's sync signal (the
 * overview flag or the agents header) or, with neither, on two agreeing
 * reads; a mid-refill count is never a result. A regeneration that cannot
 * read complete figures throws so Next keeps the last page; a build retries
 * with backoff and then renders without the row.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { INTERIM_READ_GAP_MS } from "./registry-sync";
import {
  BUILD_RETRY_BUDGET_MS,
  IncompleteStatsError,
  getHeroStats,
  readCompleteStats,
  readWithRetry,
  renderPhase,
  type StatsDeps,
} from "./public-network-stats";

const BASE = "https://be.example.com";
const ENV = { NEXT_PUBLIC_API_BASE: `${BASE}/api/` };

const TEAM = "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV";
const SIGNER = "GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP";
const DISPATCH = "GDISPATCHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OUT_1 = "GOUTSIDE1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OUT_2 = "GOUTSIDE2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const overview = (
  registered: number,
  extra: Record<string, unknown> = {},
  owners: { external: number | null; wallets: number | null } = {
    external: 253,
    wallets: 248,
  },
) => ({
  generated_at: 1_790_949_712,
  agents: {
    registered,
    onchain: Math.max(0, registered - 12),
    seeded: Math.min(12, registered),
    external: owners.external,
    bound: 8,
    online: registered,
  },
  operators: { external_wallets: owners.wallets },
  workflows: { settled: 5, series: [] },
  tasks: { recent: 0, complete: 0, failed: 0, completion_rate: null },
  trust: { avg: 3.49, rated_agents: 12 },
  skills: [],
  degraded: false,
  ...extra,
});

const LEGACY = {
  agents_online: 2527,
  tasks_per_sec: 1.284,
  avg_completion: 0,
  avg_trust: 3.49,
  throughput: [22, 18],
  skills: [{ name: "content", pct: 38, tone: "violet" }],
};

const agent = (id: string, owner: string | null, source = "onchain") => ({
  id,
  name: id,
  skills: [],
  price: 0.01,
  rep: 4,
  status: "online",
  runs: 0,
  owner,
  source,
  bound: null,
});

/** A registry of `n` agents: two seeded, then on-chain agents whose owners
 * cycle by index — i % 4: 0 TEAM, 1 DISPATCH, 2 OUT_1, 3 OUT_2. */
function registry(n: number) {
  const owners = [TEAM, DISPATCH, OUT_1, OUT_2];
  return Array.from({ length: n }, (_, i) =>
    i < 2
      ? agent(`agt_${i}`, null, "seeded")
      : agent(`a${i}`, owners[i % owners.length]),
  );
}

const ADOPTION = {
  network: "testnet",
  generated_at: 1_790_875_612,
  targets: {
    external_agents: 2,
    unique_operator_wallets: 2,
    settled_external_workflows: 3,
  },
  totals: {
    external_agents: 7,
    unique_operator_wallets: 3,
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
};

const NETWORK = { admin: TEAM, dispatch_signer: DISPATCH };

/** One answer: a body (200), a status, an Error to throw, or a body with
 * response headers. */
type Answer = unknown;
type Routes = Record<string, Answer>;

// An agent list is itself an array, so a list of answers is marked.
const SEQ = Symbol("seq");
const seq = (...answers: Answer[]) => Object.assign(answers, { [SEQ]: true });
const isSeq = (v: unknown): v is Answer[] =>
  Array.isArray(v) && SEQ in (v as object);
const withHeaders = (
  v: unknown,
): v is { body: unknown; headers: Record<string, string> } =>
  typeof v === "object" && v !== null && "headers" in v && "body" in v;

/** The agents read as the sync-signal backend sends it (BE #113): the body
 * unchanged, `X-Registry-Count` the length of this list. */
const synced = (body: unknown[], value = "true") => ({
  body,
  headers: {
    "X-Registry-Synced": value,
    "X-Registry-Count": String(body.length),
  },
});

/** A fake backend. A `seq` answers in turn, its last answer repeating. */
function backend(routes: Routes) {
  const seen: Record<string, number> = {};
  return vi.fn(async (url: string, _init: RequestInit) => {
    const path = new URL(url).pathname;
    const route = routes[path];
    const list = isSeq(route) ? route : [route];
    const i = seen[path] ?? 0;
    seen[path] = i + 1;
    const r = list[Math.min(i, list.length - 1)];
    if (r instanceof Error) throw r;
    if (r === undefined || typeof r === "number") {
      return new Response("{}", { status: typeof r === "number" ? r : 404 });
    }
    if (withHeaders(r)) {
      return new Response(JSON.stringify(r.body), {
        status: 200,
        headers: r.headers,
      });
    }
    return new Response(JSON.stringify(r), { status: 200 });
  });
}

/** A fake clock: `sleep` advances it at once and records the pause. */
function clock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

function deps(
  f: ReturnType<typeof backend>,
  env: Record<string, string | undefined> = ENV,
) {
  const c = clock();
  const d: StatsDeps = { env, fetch: f, now: c.now, sleep: c.sleep };
  return { d, sleeps: c.sleeps };
}

const paths = (f: ReturnType<typeof backend>) =>
  f.mock.calls.map((c) => new URL(c[0]).pathname);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readCompleteStats — the overview's sync flag", () => {
  it("takes the overview as sent when it says the registry is synced", async () => {
    const f = backend({
      "/api/metrics/overview": overview(278, { registry_synced: true }),
    });
    const { d, sleeps } = deps(f);
    await expect(readCompleteStats(d)).resolves.toEqual({
      ok: true,
      stats: { registered: 278, external: 253, operatorWallets: 248 },
      via: "overview flag",
    });
    expect(paths(f)).toEqual(["/api/metrics/overview"]);
    expect(f.mock.calls[0][0]).toBe(`${BASE}/api/metrics/overview`);
    expect(sleeps).toEqual([]);
  });

  it("rejects a mid-refill overview, and reads nothing more", async () => {
    const f = backend({
      "/api/metrics/overview": overview(31, {
        registry_synced: false,
        degraded: true,
      }),
      "/api/agents": registry(31),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "the backend reports its registry still syncing (31 so far)",
    });
    expect(paths(f)).toEqual(["/api/metrics/overview"]);
  });

  it("takes a synced overview even when it is degraded for another part", async () => {
    // `degraded` also covers the trust read missing its deadline at this
    // registry size: not a partial count. Only `registry_synced` decides.
    const f = backend({
      "/api/metrics/overview": overview(278, {
        registry_synced: true,
        degraded: true,
        trust: { avg: null, rated_agents: null },
      }),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: true,
      stats: { registered: 278, external: 253, operatorWallets: 248 },
      via: "overview flag",
    });
  });

  it("is not a result when a synced overview could not read owners", async () => {
    const f = backend({
      "/api/metrics/overview": overview(
        278,
        { registry_synced: true },
        { external: null, wallets: null },
      ),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "the overview could not read agent owners",
    });
  });
});

describe("readCompleteStats — the agents header", () => {
  it("accepts a registry the header says is synced, in one read", async () => {
    const f = backend({
      "/api/metrics/overview": overview(278),
      "/api/agents": synced(registry(278)),
    });
    const { d, sleeps } = deps(f);
    await expect(readCompleteStats(d)).resolves.toEqual({
      ok: true,
      stats: { registered: 278, external: 253, operatorWallets: 248 },
      via: "overview, header",
    });
    expect(paths(f)).toEqual(["/api/metrics/overview", "/api/agents"]);
    expect(sleeps).toEqual([]);
  });

  it("rejects a registry the header says is still syncing", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": synced(registry(226), "false"),
    });
    const { d, sleeps } = deps(f);
    await expect(readCompleteStats(d)).resolves.toEqual({
      ok: false,
      reason: "the backend reports its registry still syncing (226 so far)",
    });
    // No second read: the header already answered.
    expect(paths(f).filter((p) => p === "/api/agents")).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("rejects a second read that says syncing, even at the same count", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": seq(registry(226), synced(registry(226), "false")),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "the backend reports its registry still syncing (226 so far)",
    });
  });
});

describe("readCompleteStats — the interim rule, with no signal at all", () => {
  it("accepts two agreeing reads the gap apart (today's live backend)", async () => {
    const f = backend({
      "/api/metrics/overview": overview(278),
      "/api/agents": registry(278),
    });
    const { d, sleeps } = deps(f);
    await expect(readCompleteStats(d)).resolves.toEqual({
      ok: true,
      stats: { registered: 278, external: 253, operatorWallets: 248 },
      via: "overview, two agreeing reads",
    });
    expect(sleeps).toEqual([INTERIM_READ_GAP_MS]);
    // The overview had the owner figures: the costly adoption read is never
    // asked for.
    expect(paths(f)).toEqual([
      "/api/metrics/overview",
      "/api/agents",
      "/api/agents",
    ]);
  });

  it("rejects a mid-refill count: the second read grew", async () => {
    const f = backend({
      "/api/metrics/overview": overview(31),
      "/api/agents": seq(registry(31), registry(226)),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "the registry count moved from 31 to 226 between reads",
    });
  });

  it("rejects a count that shrank: the backend restarted", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": seq(registry(278), registry(12)),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "the registry count moved from 278 to 12 between reads",
    });
  });

  it("does not take an overview snapshot of a different registry", async () => {
    // The overview is cached on the backend; this one predates the refill.
    const f = backend({
      "/api/metrics/overview": overview(226),
      "/api/agents": registry(10),
      "/api/stellar/network": NETWORK,
      "/readiness": {},
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: true,
      stats: { registered: 10, external: 4, operatorWallets: 2 },
      via: "registry owners, two agreeing reads",
    });
    expect(paths(f)).not.toContain("/api/ecosystem/adoption");
  });
});

describe("readCompleteStats — external figures without the overview", () => {
  it("takes the adoption read when it answers clean", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": registry(10),
      "/api/ecosystem/adoption": ADOPTION,
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: true,
      stats: { registered: 10, external: 7, operatorWallets: 3 },
      via: "adoption read, two agreeing reads",
    });
  });

  it("derives from owners when the adoption read is degraded", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": registry(10),
      "/api/ecosystem/adoption": { ...ADOPTION, degraded: true },
      "/api/stellar/network": NETWORK,
      "/readiness": {},
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: true,
      stats: { registered: 10, external: 4, operatorWallets: 2 },
      via: "registry owners, two agreeing reads",
    });
  });

  it("derives from owners when the adoption read left agents unread", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": registry(10),
      "/api/ecosystem/adoption": { ...ADOPTION, unreadable_agents: ["a9"] },
      "/api/stellar/network": NETWORK,
      "/readiness": {},
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toMatchObject({
      via: "registry owners, two agreeing reads",
    });
  });

  it("derives from owners when the adoption read fails or times out", async () => {
    const f = backend({
      "/api/metrics/overview": new Error("ECONNREFUSED"),
      "/api/agents": registry(10),
      "/api/ecosystem/adoption": new DOMException("timed out", "TimeoutError"),
      "/api/stellar/network": NETWORK,
      "/readiness": 503,
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: true,
      stats: { registered: 10, external: 4, operatorWallets: 2 },
      via: "registry owners, two agreeing reads",
    });
  });

  it("excludes the register's team wallets and the published keys", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": [
        agent("t1", TEAM),
        agent("t2", SIGNER),
        agent("d1", DISPATCH),
        agent("o1", OUT_1),
        agent("o2", OUT_2),
      ],
      "/api/ecosystem/adoption": 503,
      // The admin here is not in the register; the network read names it.
      "/api/stellar/network": { admin: OUT_2, dispatch_signer: DISPATCH },
      "/readiness": {},
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toMatchObject({
      ok: true,
      stats: { registered: 5, external: 1, operatorWallets: 1 },
    });
  });

  it("is not a result when the platform's keys cannot be read", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": registry(10),
      "/api/ecosystem/adoption": 503,
      "/api/stellar/network": 503,
      "/readiness": {},
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "couldn't read the platform's own keys",
    });
  });

  it("is not a result when an on-chain agent has no known owner", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": [agent("o1", OUT_1), agent("o2", null)],
      "/api/ecosystem/adoption": 503,
      "/api/stellar/network": NETWORK,
      "/readiness": {},
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "1 on-chain agents have no known owner",
    });
  });
});

describe("readCompleteStats — reads", () => {
  it("bypasses Next's data cache on every read", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": registry(10),
      "/api/ecosystem/adoption": 503,
      "/api/stellar/network": NETWORK,
      "/readiness": {},
    });
    await readCompleteStats(deps(f).d);
    expect(f.mock.calls.length).toBe(6);
    for (const [, init] of f.mock.calls) {
      expect(init.cache).toBe("no-store");
      expect((init as { next?: unknown }).next).toBeUndefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("is not a result, and reads nothing, on an unusable backend origin", async () => {
    const f = backend({});
    const out = await readCompleteStats(
      deps(f, { NEXT_PUBLIC_API_BASE: "not a url" }).d,
    );
    expect(out.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("is not a result when the backend is down", async () => {
    const f = backend({
      "/api/metrics/overview": new Error("ECONNREFUSED"),
      "/api/agents": new Error("ECONNREFUSED"),
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "ECONNREFUSED",
    });
  });

  it("is not a result on a malformed registry", async () => {
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": { error: "envelope" },
    });
    await expect(readCompleteStats(deps(f).d)).resolves.toEqual({
      ok: false,
      reason: "/agents: malformed",
    });
  });

  it("reads nothing past its deadline", async () => {
    const f = backend({ "/api/metrics/overview": LEGACY });
    const { d } = deps(f);
    const out = await readCompleteStats({ ...d, deadline: d.now() });
    expect(out).toEqual({ ok: false, reason: "/agents: out of time" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("renderPhase", () => {
  it("tells a build, a regeneration and development apart", () => {
    expect(
      renderPhase({
        NEXT_PHASE: "phase-production-build",
        NODE_ENV: "production",
      }),
    ).toBe("build");
    expect(renderPhase({ NODE_ENV: "production" })).toBe("regenerate");
    expect(renderPhase({ NODE_ENV: "development" })).toBe("dev");
  });
});

describe("getHeroStats", () => {
  const PROD = { ...ENV, NODE_ENV: "production" };
  const BUILD = { ...PROD, NEXT_PHASE: "phase-production-build" };
  const DEV = { ...ENV, NODE_ENV: "development" };
  const MID_REFILL = {
    "/api/metrics/overview": overview(31, { registry_synced: false }),
  };
  const COMPLETE = {
    "/api/metrics/overview": overview(278, { registry_synced: true }),
  };

  it("returns all three figures when they are complete", async () => {
    await expect(
      getHeroStats(deps(backend(COMPLETE), PROD).d),
    ).resolves.toEqual({
      registered: 278,
      external: 253,
      operatorWallets: 248,
    });
  });

  it("throws on partial figures during a regeneration, so Next keeps the last page", async () => {
    const out = getHeroStats(deps(backend(MID_REFILL), PROD).d);
    await expect(out).rejects.toBeInstanceOf(IncompleteStatsError);
    await expect(
      getHeroStats(deps(backend(MID_REFILL), PROD).d),
    ).rejects.toThrow(/registry still syncing \(31 so far\)/);
  });

  it("throws on missing figures during a regeneration", async () => {
    const f = backend({
      "/api/metrics/overview": new Error("ECONNREFUSED"),
      "/api/agents": new Error("ECONNREFUSED"),
    });
    await expect(getHeroStats(deps(f, PROD).d)).rejects.toBeInstanceOf(
      IncompleteStatsError,
    );
  });

  it("renders no figures in development rather than a partial one", async () => {
    await expect(
      getHeroStats(deps(backend(MID_REFILL), DEV).d),
    ).resolves.toBeNull();
  });

  it("retries a build with backoff until the registry has synced", async () => {
    const f = backend({
      "/api/metrics/overview": seq(
        new Error("ECONNREFUSED"),
        overview(31, { registry_synced: false }),
        overview(226, { registry_synced: false }),
        overview(278, { registry_synced: true }),
      ),
      "/api/agents": new Error("ECONNREFUSED"),
    });
    const { d, sleeps } = deps(f, BUILD);
    await expect(getHeroStats(d)).resolves.toEqual({
      registered: 278,
      external: 253,
      operatorWallets: 248,
    });
    expect(sleeps).toEqual([2_000, 4_000, 8_000]);
  });

  it("gives a cold build about 120s, then renders without the row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { d, sleeps } = deps(backend(MID_REFILL), BUILD);
    await expect(getHeroStats(d)).resolves.toBeNull();
    // Doubling from 2s, capped at 20s, the last pause cut to the budget.
    expect(sleeps).toEqual([
      2_000, 4_000, 8_000, 16_000, 20_000, 20_000, 20_000, 20_000, 10_000,
    ]);
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(BUILD_RETRY_BUDGET_MS);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/no complete network figures after 120s/),
    );
  });

  it("never lets a build's attempts run past the budget", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = backend({
      "/api/metrics/overview": LEGACY,
      "/api/agents": seq(registry(31), registry(226)),
    });
    const c = clock();
    const out = await readWithRetry(
      { env: BUILD, fetch: f, now: c.now, sleep: c.sleep },
      15_000,
    );
    expect(out).toBeNull();
    // Attempt 1: overview, agents, the 10s wait, agents (31 → 226); a 2s
    // pause; attempt 2 at 12s reads the overview and the agents and has no
    // time left for the wait; the last pause runs out the budget, and the
    // attempt after it is refused every read.
    expect(c.sleeps).toEqual([INTERIM_READ_GAP_MS, 2_000, 3_000]);
    expect(paths(f).filter((p) => p !== "/api/ecosystem/adoption")).toEqual([
      "/api/metrics/overview",
      "/api/agents",
      "/api/agents",
      "/api/metrics/overview",
      "/api/agents",
    ]);
  });
});
