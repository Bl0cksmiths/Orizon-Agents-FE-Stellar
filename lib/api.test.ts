/**
 * Unit tests for the fetch plumbing in lib/api.ts.
 *
 * `get` and `post` are module-private, so they are exercised through the
 * thinnest exported wrappers: `listAgents` (get) and `decompose` (post).
 * `globalThis.fetch` is stubbed — no network, no DOM. `openTraceStream` is
 * covered too: EventSource is stubbed with a class the tests drive through
 * the whole connection lifecycle, so the reconnect budget, the connect
 * deadline, the history handoff and the polling fallback are all exercised
 * without a browser. (lib/trace-stream.test.ts covers the onReset contract
 * from a consumer's point of view.)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  GET_DEDUPE_MS,
  GET_TIMEOUT_MS,
  STREAM_CONNECT_TIMEOUT_MS,
  TRACE_POLL_MS,
  agentIdAvailable,
  bindAgent,
  buildAuthorize,
  buildRegisterAgent,
  clearGetCache,
  createBindChallenge,
  decompose,
  execute,
  getArtifact,
  getFlow,
  getOverview,
  getReputation,
  getReputationParams,
  getTrace,
  listAgents,
  listReputation,
  openTraceStream,
  submitSigned,
  syncAgents,
} from "./api";
import { rememberTaskToken } from "./task-tokens";
import type { TraceLine } from "./types";

type FetchMockResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const fetchMock =
  vi.fn<(input: string, init?: RequestInit) => Promise<FetchMockResponse>>();
vi.stubGlobal("fetch", fetchMock);

// This suite runs in node (no DOM): give lib/task-tokens a window with a
// Map-backed sessionStorage so token wiring is testable, and stub a minimal
// EventSource so openTraceStream's URL construction is observable.
const sessionStore = new Map<string, string>();
vi.stubGlobal("window", {
  sessionStorage: {
    getItem: (k: string) => sessionStore.get(k) ?? null,
    setItem: (k: string, v: string) => void sessionStore.set(k, v),
    removeItem: (k: string) => void sessionStore.delete(k),
    clear: () => sessionStore.clear(),
  },
});

class FakeEventSource {
  static urls: string[] = [];
  constructor(url: string) {
    FakeEventSource.urls.push(url);
  }
  addEventListener(): void {}
  close(): void {}
}
vi.stubGlobal("EventSource", FakeEventSource);

function jsonResponse(status: number, body: unknown): FetchMockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

afterEach(() => {
  fetchMock.mockReset();
  // GETs dedupe per path for ~1s — flush so each test controls its fetches.
  clearGetCache();
  sessionStore.clear();
  FakeEventSource.urls = [];
  vi.restoreAllMocks();
});

// Guarded by isAgentList, so the fixture carries every field the agents
// table computes with (price/rep/runs/skills/status).
const agentFixture = {
  id: "agt_01",
  name: "copywrite.v3",
  skills: ["content"],
  price: 0.012,
  rep: 4.6,
  status: "online",
  runs: 1284,
};

describe("get (via listAgents)", () => {
  it("hits the /api prefix with no-store and resolves parsed JSON", async () => {
    const agents = [agentFixture];
    fetchMock.mockResolvedValueOnce(jsonResponse(200, agents));

    await expect(listAgents()).resolves.toEqual(agents);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects on a non-OK response with method, path and status in the message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: "boom" }));

    await expect(listAgents()).rejects.toThrow("GET /agents → 500");
  });

  it("propagates a network-level rejection untouched", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    await expect(listAgents()).rejects.toThrow("network down");
  });

  it("surfaces the backend error envelope, like post does", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: { code: "unavailable", message: "horizon unreachable" },
        detail: "legacy detail",
      }),
    );

    await expect(listAgents()).rejects.toThrow(
      "GET /agents → 503 — horizon unreachable",
    );
  });

  it("carries the envelope code on the ApiError for field mapping", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: "id_taken", message: "id taken" },
      }),
    );

    await expect(listAgents()).rejects.toMatchObject({
      status: 409,
      code: "id_taken",
    });
  });

  it("leaves the code undefined when the envelope has none", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: "boom" }));

    await listAgents().then(
      () => {
        throw new Error("expected a rejection");
      },
      (err) => {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.code).toBeUndefined();
      },
    );
  });

  it("falls back to the legacy detail field", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { detail: "no agents" }));

    await expect(listAgents()).rejects.toThrow("GET /agents → 404 — no agents");
  });

  // "backend offline" is a lie when the backend answered "not this second".
  it("reports a 429 as rate limited, with the wait the backend asked for", async () => {
    fetchMock.mockResolvedValueOnce({
      ...jsonResponse(429, {
        detail: "rate_limited",
        error: { code: "rate_limited", message: "too many requests" },
      }),
      headers: {
        get: (name: string) => (name === "retry-after" ? "12" : null),
      },
    });

    const err = await listAgents().then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as ApiError,
    );

    expect(err.message).toBe("GET /agents → 429 — rate limited, retry in 12s");
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(12_000);
  });

  it("still names the throttling when the backend sends no Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { detail: "rate_limited" }),
    );

    const err = await listAgents().then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as ApiError,
    );

    expect(err.message).toBe("GET /agents → 429 — rate limited, retry shortly");
    expect(err.retryAfterMs).toBeUndefined();
  });

  it("reads an HTTP-date Retry-After as a wait in ms", async () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    fetchMock.mockResolvedValueOnce({
      ...jsonResponse(429, {}),
      headers: { get: () => at },
    });

    const err = await listAgents().then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as ApiError,
    );

    expect(err.retryAfterMs).toBeGreaterThan(25_000);
    expect(err.retryAfterMs).toBeLessThanOrEqual(30_000);
  });
});

describe("fetch deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the deadline once the body has been read", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(jsonResponse(200, []));
    });

    await expect(listAgents()).resolves.toEqual([]);

    await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS * 2);
    expect(signal?.aborted).toBe(false);
  });

  // fetch() resolves when HEADERS arrive: a body that never lands used to sit
  // outside the guarded scope and hang the loading state forever.
  it("covers a stalled response body and reports it as a timeout", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<never>((_resolve, reject) => {
            signal?.addEventListener("abort", () =>
              reject(new Error("The operation was aborted")),
            );
          }),
        text: () => Promise.resolve(""),
      });
    });

    const rejects = expect(listAgents()).rejects.toThrow(
      "GET /agents → timeout after 60s",
    );
    await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS + 1);
    await rejects;
    expect(signal?.aborted).toBe(true);
  });
});

const repInfo = {
  agent_id: "agt_01h8",
  smoothed_bps: 7000,
  lower_bound_bps: 5677,
  avg_bps: 0,
  count: 0,
  weight: 0,
  disputed: 0,
  dispute_rate_bps: 0,
  source: "prior",
};

describe("listReputation", () => {
  it("hits the batch reputation endpoint and resolves the parsed batch", async () => {
    const batch = {
      reputations: { agt_01h8: repInfo },
      floor_bps: 5500,
      prior_bps: 7000,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, batch));

    await expect(listReputation()).resolves.toEqual(batch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stellar/reputation",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects on a non-OK response with method, path and status in the message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { detail: "horizon down" }),
    );

    await expect(listReputation()).rejects.toThrow(
      "GET /stellar/reputation → 502",
    );
  });
});

describe("getReputation", () => {
  it("hits the per-agent reputation endpoint and resolves the parsed object", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, repInfo));

    await expect(getReputation("agt_01h8")).resolves.toEqual(repInfo);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stellar/reputation/agt_01h8",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects on a non-OK response with method, path and status in the message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { detail: "unknown agent" }),
    );

    await expect(getReputation("agt_nope")).rejects.toThrow(
      "GET /stellar/reputation/agt_nope → 404",
    );
  });
});

// Guarded by isReputationParams: every constant the reputation math divides
// or smooths with has to be present and numeric.
const paramsFixture = {
  enabled: true,
  prior_bps: 7000,
  prior_weight_usdc: 12,
  floor_bps: 5500,
  max_rating_weight_usdc: 100,
  read_ttl_seconds: 15,
  wilson_z: 1,
  epoch_seconds: 604_800,
  decay_bps_per_epoch: 9250,
  max_decay_epochs: 96,
  contract_id: "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
  network: "testnet",
};

describe("getReputationParams", () => {
  it("hits the params endpoint and resolves the parsed object", async () => {
    const params = paramsFixture;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, params));

    await expect(getReputationParams()).resolves.toEqual(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stellar/reputation/params",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects on a non-OK response with method, path and status in the message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { detail: "rpc down" }));

    await expect(getReputationParams()).rejects.toThrow(
      "GET /stellar/reputation/params → 503",
    );
  });
});

describe("response guards", () => {
  it("rejects a malformed agent list as a normal request error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [{ id: "agt_01", name: "copywrite.v3" }]),
    );

    await expect(listAgents()).rejects.toThrow(
      "malformed response from /agents",
    );
  });

  it("rejects a flow payload with no edges as a normal request error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { nodes: [{ id: "in", label: "intent" }] }),
    );

    await expect(getFlow()).rejects.toThrow(
      "malformed response from /flow/default",
    );
  });

  it("rejects reputation params missing a decay constant", async () => {
    const { epoch_seconds: _drop, ...rest } = paramsFixture;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, rest));

    await expect(getReputationParams()).rejects.toThrow(
      "malformed response from /stellar/reputation/params",
    );
  });

  it("rejects a malformed overview payload as a normal request error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { agents_online: 1, throughput: "not-an-array" }),
    );

    await expect(getOverview()).rejects.toThrow(
      "malformed response from /metrics/overview",
    );
  });

  it("rejects a malformed decompose payload as a normal request error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { plan_id: "pln_1", steps: [], total_usdc: "0.03" }),
    );

    await expect(decompose("x")).rejects.toThrow(
      "malformed response from /orchestrator/decompose",
    );
  });

  it("rejects a trace history carrying a row that is not a trace line", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [{ t: "0.1", level: "warn", msg: "unknown level" }]),
    );

    await expect(getTrace("tsk_bad")).rejects.toThrow(
      "malformed response from /trace/tsk_bad",
    );
  });

  it("rejects a per-agent reputation payload with no source", async () => {
    const { source: _drop, ...rest } = repInfo;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, rest));

    await expect(getReputation("agt_01h8")).rejects.toThrow(
      "malformed response from /stellar/reputation/agt_01h8",
    );
  });

  it("rejects an authorize build with no xdr for the wallet to sign", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { expires_at: 1_764_000_000 }),
    );

    await expect(
      buildAuthorize({
        payer: "GABC",
        agent_id: "orizon_batch",
        max_amount_usdc: 0.5,
      }),
    ).rejects.toThrow("malformed response from /stellar/build/authorize");
  });

  it("rejects a submit result with no transaction hash", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "SUCCESS", return_value: null }),
    );

    await expect(submitSigned("AAAAAgAAAAB…")).rejects.toThrow(
      "malformed response from /stellar/submit",
    );
  });

  it("passes a well-formed trace history through", async () => {
    const history = [{ t: "0.1", level: "cost", msg: "0.010 USDC" }];
    fetchMock.mockResolvedValueOnce(jsonResponse(200, history));

    await expect(getTrace("tsk_ok")).resolves.toEqual(history);
  });

  // `degraded` is optional and has to survive the seam untouched — it is the
  // only thing telling a failed ledger read from a cold-start newcomer.
  it("passes a per-agent reputation through, degraded flag included", async () => {
    const degraded = { ...repInfo, degraded: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, degraded));

    await expect(getReputation("agt_ok")).resolves.toEqual(degraded);
  });

  it("passes a well-formed authorize build and submit result through", async () => {
    const build = { xdr: "AAAAAgAAAAB…", expires_at: 1_764_000_000 };
    const receipt = { hash: "9f2c1a", status: "SUCCESS", return_value: null };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, build))
      .mockResolvedValueOnce(jsonResponse(200, receipt));

    await expect(
      buildAuthorize({ payer: "GABC", agent_id: "a", max_amount_usdc: 1 }),
    ).resolves.toEqual(build);
    await expect(submitSigned("AAAAAgAAAAB…")).resolves.toEqual(receipt);
  });

  it("resolves a well-formed guarded payload untouched", async () => {
    const overview = {
      agents_online: 12,
      tasks_per_sec: 0.4,
      avg_completion: 0.97,
      avg_trust: 4.6,
      throughput: [1, 2, 3],
      skills: [{ name: "code", pct: 62, tone: "violet" }],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, overview));

    await expect(getOverview()).resolves.toEqual(overview);
  });
});

describe("buildRegisterAgent", () => {
  const body = {
    owner: "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E",
    agent_id: "orizon_batch",
    name: "Batch Runner",
    skills: ["content", "seo"],
    price_usdc: 0.5,
  };

  it("posts the register body and resolves the parsed xdr envelope", async () => {
    const build = { xdr: "AAAAAgAAAAB…" };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, build));

    await expect(buildRegisterAgent(body)).resolves.toEqual(build);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stellar/build/register-agent",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects a build with no xdr for the wallet to sign", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await expect(buildRegisterAgent(body)).rejects.toThrow(
      "malformed response from /stellar/build/register-agent",
    );
  });

  // Proves the whole seam the register form keys on: a 409 id_taken envelope
  // surfaces as an ApiError carrying the machine-readable code, never the human
  // message.
  it("carries the id_taken code on a 409 conflict", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: "id_taken", message: "agent id already registered" },
      }),
    );

    const err = await buildRegisterAgent(body).then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as ApiError,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("id_taken");
  });
});

describe("agentIdAvailable", () => {
  const owner = "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E";

  it("hits the availability endpoint with the id in the path", async () => {
    const free = { available: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, free));

    await expect(agentIdAvailable("orizon_batch")).resolves.toEqual(free);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stellar/agent-id-available/orizon_batch",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("carries the id_taken reason and owner through", async () => {
    const taken = { available: false, reason: "id_taken", owner };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, taken));

    const res = await agentIdAvailable("orizon_batch");

    expect(res.available).toBe(false);
    expect(res.reason).toBe("id_taken");
    expect(res.owner).toBe(owner);
  });

  it("rejects a malformed availability payload as a normal request error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { available: "yes" }));

    await expect(agentIdAvailable("orizon_batch")).rejects.toThrow(
      "malformed response from /stellar/agent-id-available",
    );
  });
});

describe("syncAgents", () => {
  it("posts an empty body and resolves the parsed count", async () => {
    const result = { synced: 4 };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, result));

    await expect(syncAgents()).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stellar/agents/sync",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects a malformed sync payload as a normal request error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { synced: "4" }));

    await expect(syncAgents()).rejects.toThrow(
      "malformed response from /stellar/agents/sync",
    );
  });
});

describe("get dedupe cache", () => {
  it("shares one fetch across concurrent requests for the same path", async () => {
    const agents = [agentFixture];
    fetchMock.mockResolvedValueOnce(jsonResponse(200, agents));

    const [a, b] = await Promise.all([listAgents(), listAgents()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(agents);
    expect(b).toBe(a); // same underlying promise → same resolved value
  });

  it("reuses a resolved response inside the dedupe window and refetches after it", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await listAgents();
    await listAgents();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_000_000 + GET_DEDUPE_MS + 1);
    await listAgents();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts a resolved entry from the cache once the dedupe window elapses", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      fetchMock.mockResolvedValue(jsonResponse(200, []));

      await listAgents();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Let the eviction timer fire, then rewind the clock so the lazy
      // dedupe-window check would still call the entry fresh: a refetch
      // proves the map entry itself is gone, not merely aged past reuse.
      await vi.advanceTimersByTimeAsync(GET_DEDUPE_MS + 1);
      vi.setSystemTime(1_000_000);

      await listAgents();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts rejected requests so the next call retries the network", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: "boom" }));
    await expect(listAgents()).rejects.toThrow("GET /agents → 500");

    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));
    await expect(listAgents()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not dedupe across different paths", async () => {
    // Both paths are guarded, so each mock body has to satisfy its own guard.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(200, paramsFixture));

    await Promise.all([listAgents(), getReputationParams()]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("post (via decompose)", () => {
  it("sends a JSON body with content-type header and resolves parsed JSON", async () => {
    const plan = {
      plan_id: "pln_1",
      intent: "tetris",
      steps: [],
      total_usdc: 0,
      total_eta: 0,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, plan));

    await expect(decompose("tetris")).resolves.toEqual(plan);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orchestrator/decompose",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "tetris" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("surfaces the backend `detail` field in the rejection message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { detail: "plan too vague" }),
    );

    await expect(decompose("x")).rejects.toThrow(
      "POST /orchestrator/decompose → 422 — plan too vague",
    );
  });

  it("prefers the standardized error-envelope message over detail", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(402, {
        error: { code: "payment_required", message: "authorization expired" },
        detail: "legacy detail",
      }),
    );

    await expect(decompose("x")).rejects.toThrow(
      "POST /orchestrator/decompose → 402 — authorization expired",
    );
  });

  it("falls back to detail when the envelope carries no message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        error: { code: "invalid_plan" },
        detail: "plan too vague",
      }),
    );

    await expect(decompose("x")).rejects.toThrow(
      "POST /orchestrator/decompose → 422 — plan too vague",
    );
  });

  it("falls back to statusText when the body is unreadable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: () => Promise.reject(new Error("no body")),
      text: () => Promise.reject(new Error("no body")),
    });

    await expect(decompose("x")).rejects.toThrow(
      "POST /orchestrator/decompose → 503 — Service Unavailable",
    );
  });

  it("falls back to the stringified JSON body (capped at 300 chars) when detail is absent", async () => {
    const noise = "z".repeat(400);
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: noise }));

    const err = await decompose("x").then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as Error,
    );

    expect(err.message).toContain("POST /orchestrator/decompose → 400 — ");
    expect(err.message).toContain('{"error":"zzz');
    const detail = err.message.split(" — ")[1];
    expect(detail.length).toBe(300);
  });

  it("falls back to the raw text body when the error payload is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
      text: () => Promise.resolve("Bad Gateway"),
    });

    await expect(decompose("x")).rejects.toThrow(
      "POST /orchestrator/decompose → 502 — Bad Gateway",
    );
  });

  it("still rejects with method, path and status when the body is unreadable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("no body")),
      text: () => Promise.reject(new Error("no body")),
    });

    await expect(decompose("x")).rejects.toThrow(
      "POST /orchestrator/decompose → 500",
    );
  });

  it("propagates a network-level rejection untouched", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));

    await expect(decompose("x")).rejects.toThrow("socket hang up");
  });
});

describe("task read tokens", () => {
  it("attaches X-Task-Token to getTrace when a token is known", async () => {
    rememberTaskToken("tsk_tok", "tok_1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));

    await getTrace("tsk_tok");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trace/tsk_tok",
      expect.objectContaining({ headers: { "X-Task-Token": "tok_1" } }),
    );
  });

  it("attaches X-Task-Token to getArtifact when a token is known", async () => {
    rememberTaskToken("tsk_tok", "tok_1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { artifact: null }));

    await getArtifact("tsk_tok");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/tsk_tok/artifact",
      expect.objectContaining({ headers: { "X-Task-Token": "tok_1" } }),
    );
  });

  it("sends no headers when no token is known for the task", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await getTrace("tsk_unknown");

    expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it("remembers the token from an execute response for later reads", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { task_id: "tsk_9", read_token: "tok_9" }),
    );
    await expect(execute("pln_1")).resolves.toEqual({
      task_id: "tsk_9",
      read_token: "tok_9",
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));
    await getTrace("tsk_9");

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/trace/tsk_9",
      expect.objectContaining({ headers: { "X-Task-Token": "tok_9" } }),
    );
  });

  it("leaves reads bare when the execute response ships no token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { task_id: "tsk_10" }));
    await execute("pln_1");

    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));
    await getTrace("tsk_10");

    expect(fetchMock.mock.lastCall?.[1]?.headers).toBeUndefined();
  });

  it("appends the token as a query param on the SSE stream url", () => {
    // EventSource cannot set headers — the token rides the query string,
    // encoded so reserved characters survive.
    rememberTaskToken("tsk_sse", "tok se/1");
    const dispose = openTraceStream("tsk_sse", () => {});

    expect(FakeEventSource.urls).toEqual([
      "/api/trace/tsk_sse/stream?token=tok%20se%2F1",
    ]);
    dispose();
  });

  it("opens the SSE stream without a query param when no token is known", () => {
    const dispose = openTraceStream("tsk_plain", () => {});

    expect(FakeEventSource.urls).toEqual(["/api/trace/tsk_plain/stream"]);
    dispose();
  });
});

/**
 * Richer than the URL-only stub above: the suites below drive the whole
 * connection lifecycle (open / trace / done / error) that openTraceStream
 * reacts to.
 */
class StubEventSource {
  static instances: StubEventSource[] = [];
  url: string;
  closed = false;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    StubEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (e: MessageEvent) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: unknown): void {
    for (const cb of this.listeners.get(type) ?? []) {
      cb({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  static last(): StubEventSource {
    return StubEventSource.instances[StubEventSource.instances.length - 1];
  }
}

const traceLine = (t: string, msg: string): TraceLine => ({
  t,
  level: "cost",
  msg,
});

function useStubEventSource() {
  beforeEach(() => {
    vi.useFakeTimers();
    StubEventSource.instances = [];
    vi.stubGlobal("EventSource", StubEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    // Hand the module-level stub back to the token tests above.
    vi.stubGlobal("EventSource", FakeEventSource);
  });
}

describe("openTraceStream reconnect budget", () => {
  useStubEventSource();

  // A free-form workflow streams for minutes. A budget that never reset
  // declared such a run dead on its third transport hiccup — while it was
  // still executing, and still charging.
  it("refreshes the budget after every connection that carried lines", async () => {
    const lines: TraceLine[] = [];
    const onError = vi.fn();
    const dispose = openTraceStream(
      "tsk_long",
      (l) => lines.push(l),
      undefined,
      onError,
      () => {
        lines.length = 0;
      },
    );

    // Six outages — twice the old whole-stream budget of three.
    for (let i = 0; i < 6; i += 1) {
      const es = StubEventSource.last();
      es.emit("open");
      es.emit("trace", traceLine(`${i}.0`, `step ${i} — 0.010 USDC`));
      es.emit("error");
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(StubEventSource.instances).toHaveLength(7);
    expect(onError).not.toHaveBeenCalled();
    expect(lines).toHaveLength(0); // consumer cleared on the last reset
    dispose();
  });

  // Silence is not failure — steps can take 120s — so simply holding the
  // connection counts as working.
  it("refreshes the budget after a connection that merely stayed up", async () => {
    const dispose = openTraceStream("tsk_quiet", () => {});

    // Each connection opens, outlives STABLE_CONNECTION_MS carrying nothing,
    // then dies. Without the refresh the 3-attempt budget would be spent and
    // the stream would hand over to polling after 3 sockets; with it, it keeps
    // reconnecting. Kept under MAX_OUTAGE_MS in total — the attempt budget is
    // what this test is about, and the outage ceiling (covered separately)
    // is what now bounds a silent stream overall.
    for (let i = 0; i < 3; i += 1) {
      const es = StubEventSource.last();
      es.emit("open");
      await vi.advanceTimersByTimeAsync(5_000);
      es.emit("ping");
      es.emit("error");
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(StubEventSource.instances).toHaveLength(4);
    dispose();
  });

  it("does not refresh the budget for a connection that dies on open", async () => {
    const dispose = openTraceStream("tsk_flap", () => {});

    for (const delay of [1_000, 2_000, 4_000, 1_000]) {
      const es = StubEventSource.last();
      es.emit("open");
      es.emit("error");
      await vi.advanceTimersByTimeAsync(delay);
    }

    // Three reconnects, then no more sockets: the flap does not loop.
    expect(StubEventSource.instances).toHaveLength(4);
    dispose();
  });

  it("closes the socket and reconnects no further once disposed", async () => {
    const onReset = vi.fn();
    const dispose = openTraceStream(
      "tsk_gone",
      () => {},
      undefined,
      undefined,
      onReset,
    );

    StubEventSource.last().emit("error");
    dispose();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(onReset).not.toHaveBeenCalled();
    expect(StubEventSource.instances).toHaveLength(1);
  });
});

/**
 * Mirrors what app/app/trace/page.tsx does with onReset: treat the rendered
 * lines as superseded, and swap them for the replay only when the
 * replacement connection actually delivers a line.
 */
function deferredConsumer() {
  const state = { lines: [] as TraceLine[], pending: false };
  return {
    state,
    onEvent: (l: TraceLine) => {
      if (state.pending) {
        state.pending = false;
        state.lines.length = 0;
      }
      state.lines.push(l);
    },
    onReset: () => {
      state.pending = true;
    },
  };
}

describe("openTraceStream history handoff", () => {
  useStubEventSource();

  it("hands the replayed history over without duplicating or losing lines", async () => {
    const { state, onEvent, onReset } = deferredConsumer();
    const dispose = openTraceStream(
      "tsk_replay",
      onEvent,
      undefined,
      undefined,
      onReset,
    );

    const first = StubEventSource.last();
    first.emit("open");
    first.emit("trace", traceLine("0.1", "0.010 USDC"));
    first.emit("trace", traceLine("0.2", "0.020 USDC"));
    first.emit("error");

    // Still on screen while the reconnect is only scheduled.
    expect(state.lines).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state.lines).toHaveLength(2);

    const second = StubEventSource.last();
    second.emit("open");
    second.emit("trace", traceLine("0.1", "0.010 USDC"));
    second.emit("trace", traceLine("0.2", "0.020 USDC"));
    second.emit("trace", traceLine("0.3", "0.030 USDC"));

    expect(state.lines.map((l) => l.t)).toEqual(["0.1", "0.2", "0.3"]);
    dispose();
  });

  // The backend keeps traces in memory only: a restart 404s every reconnect
  // and the polling fallback alike, and nothing re-fetches what was rendered.
  it("keeps the rendered history when nothing can be recovered", async () => {
    const { state, onEvent, onReset } = deferredConsumer();
    const onError = vi.fn();
    fetchMock.mockRejectedValue(new Error("GET /trace/tsk_restart → 404"));
    const dispose = openTraceStream(
      "tsk_restart",
      onEvent,
      undefined,
      onError,
      onReset,
    );

    const first = StubEventSource.last();
    first.emit("open");
    first.emit("trace", traceLine("0.1", "0.010 USDC"));
    first.emit("trace", traceLine("0.2", "0.020 USDC"));

    // Every reconnect answers 404 — EventSource reports that as `error`.
    for (const delay of [1_000, 2_000, 4_000, TRACE_POLL_MS * 3]) {
      StubEventSource.last().emit("error");
      await vi.advanceTimersByTimeAsync(delay);
    }

    expect(onError).toHaveBeenCalledTimes(1);
    expect(state.lines.map((l) => l.msg)).toEqual(["0.010 USDC", "0.020 USDC"]);
    dispose();
  });
});

describe("openTraceStream polling fallback", () => {
  useStubEventSource();

  /** Serves the history endpoint and the task-status endpoint separately. */
  function serve(history: () => TraceLine[], status: () => string) {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith("/api/trace/")
          ? jsonResponse(200, history())
          : jsonResponse(200, { id: "t", status: status() }),
      ),
    );
  }

  /** Burns the reconnect budget: 3 retries, then the handover. */
  async function exhaustReconnects() {
    for (const delay of [1_000, 2_000, 4_000, 0]) {
      StubEventSource.last().emit("error");
      await vi.advanceTimersByTimeAsync(delay);
    }
  }

  it("polls the history endpoint when the stream cannot be sustained", async () => {
    const { state, onEvent, onReset } = deferredConsumer();
    const onFallback = vi.fn();
    rememberTaskToken("tsk_fb", "tok_fb");
    serve(
      () => [
        traceLine("0.1", "a"),
        traceLine("0.2", "b"),
        traceLine("0.3", "c"),
      ],
      () => "running",
    );

    const dispose = openTraceStream(
      "tsk_fb",
      onEvent,
      undefined,
      undefined,
      onReset,
      { onFallback },
    );
    const first = StubEventSource.last();
    first.emit("open");
    first.emit("trace", traceLine("0.1", "a"));
    first.emit("trace", traceLine("0.2", "b"));

    await exhaustReconnects();

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(state.lines.map((l) => l.msg)).toEqual(["a", "b", "c"]);
    // Reads carry the task token exactly as getTrace does.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trace/tsk_fb",
      expect.objectContaining({ headers: { "X-Task-Token": "tok_fb" } }),
    );
    dispose();
  });

  it("hands over to polling when reconnects keep opening but deliver nothing", async () => {
    const onFallback = vi.fn();
    serve(
      () => [traceLine("0.1", "a")],
      () => "running",
    );
    const dispose = openTraceStream(
      "tsk_silent",
      () => {},
      undefined,
      undefined,
      undefined,
      { onFallback },
    );

    // Every connection opens, outlives STABLE_CONNECTION_MS — which refreshes
    // the attempt budget — and dies without carrying a single line: a proxy
    // that accepts the stream and forwards nothing. The attempt budget alone
    // can never end this, so without the wall-clock ceiling the reader sits on
    // "reconnecting" for ~20 minutes and is never told the stream is gone.
    for (let i = 0; i < 4; i += 1) {
      const es = StubEventSource.last();
      es.emit("open");
      await vi.advanceTimersByTimeAsync(6_000);
      es.emit("error");
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(onFallback).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("does not hand over while lines keep arriving", async () => {
    const onFallback = vi.fn();
    const dispose = openTraceStream(
      "tsk_flappy",
      () => {},
      undefined,
      undefined,
      undefined,
      { onFallback },
    );

    // Eight drops spanning well past MAX_OUTAGE_MS — but each connection
    // delivers a line, which ends the outage, so the ceiling never fires. A
    // flapping-but-working transport must not be demoted to polling.
    for (let i = 0; i < 8; i += 1) {
      const es = StubEventSource.last();
      es.emit("open");
      es.emit("trace", traceLine(`${i}.0`, `step ${i}`));
      es.emit("error");
      await vi.advanceTimersByTimeAsync(4_000);
    }

    expect(onFallback).not.toHaveBeenCalled();
    dispose();
  });

  it("re-delivers nothing a previous poll already showed", async () => {
    const { state, onEvent, onReset } = deferredConsumer();
    const history = [traceLine("0.1", "a"), traceLine("0.2", "b")];
    serve(
      () => history,
      () => "running",
    );

    const dispose = openTraceStream(
      "tsk_dupe",
      onEvent,
      undefined,
      undefined,
      onReset,
    );
    await exhaustReconnects();
    expect(state.lines.map((l) => l.msg)).toEqual(["a", "b"]);

    // Same history again: the poll must add nothing.
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS);
    expect(state.lines.map((l) => l.msg)).toEqual(["a", "b"]);

    // Only the new tail is forwarded when it grows.
    history.push(traceLine("0.3", "c"));
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS);
    expect(state.lines.map((l) => l.msg)).toEqual(["a", "b", "c"]);
    dispose();
  });

  it("seals the run once the task reports a terminal status", async () => {
    const onDone = vi.fn();
    const onError = vi.fn();
    const history = [traceLine("0.1", "a")];
    let status = "running";
    serve(
      () => history,
      () => status,
    );

    const dispose = openTraceStream("tsk_seal", () => {}, onDone, onError);
    await exhaustReconnects();
    expect(onDone).not.toHaveBeenCalled();

    status = "complete";
    // One tick notices the terminal status, the next confirms the trace
    // stopped growing — the backend finalizes before its last line lands.
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS * 2 + 10);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(calls); // no loop left running
    dispose();
  });

  it("still delivers a line that lands after the task went terminal", async () => {
    const lines: TraceLine[] = [];
    const onDone = vi.fn();
    const history = [traceLine("0.1", "a")];
    let status = "running";
    serve(
      () => history,
      () => status,
    );

    const dispose = openTraceStream("tsk_late", (l) => lines.push(l), onDone);
    await exhaustReconnects();

    status = "failed";
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS); // notices terminal
    history.push(traceLine("0.2", "workflow failed: boom"));
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS); // picks the last line up

    expect(lines.map((l) => l.msg)).toEqual(["a", "workflow failed: boom"]);
    dispose();
  });

  it("gives up after repeated poll failures without erasing the run", async () => {
    const { state, onEvent, onReset } = deferredConsumer();
    const onError = vi.fn();
    fetchMock.mockResolvedValue(jsonResponse(503, { detail: "backend down" }));

    const dispose = openTraceStream(
      "tsk_pollfail",
      onEvent,
      undefined,
      onError,
      onReset,
    );
    const first = StubEventSource.last();
    first.emit("open");
    first.emit("trace", traceLine("0.1", "a"));
    await exhaustReconnects();

    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS * 3);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(state.lines.map((l) => l.msg)).toEqual(["a"]);
    dispose();
  });

  it("stops at the poll ceiling instead of polling forever", async () => {
    const onError = vi.fn();
    const history: TraceLine[] = [];
    // A history that never stops growing never looks terminal — only the
    // ceiling ends this.
    serve(
      () => {
        history.push(traceLine(`${history.length}`, "tick"));
        return history;
      },
      () => "running",
    );

    const dispose = openTraceStream(
      "tsk_forever",
      () => {},
      undefined,
      onError,
    );
    await exhaustReconnects();

    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS * 200);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(100); // it did keep trying
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(155); // but not forever
    dispose();
  });

  it("stops polling when the subscription is disposed", async () => {
    serve(
      () => [traceLine("0.1", "a")],
      () => "running",
    );
    const dispose = openTraceStream("tsk_unmount", () => {});
    await exhaustReconnects();

    dispose();
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(TRACE_POLL_MS * 10);

    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});

describe("openTraceStream connect deadline", () => {
  useStubEventSource();

  // Every GET/POST has an AbortController deadline; EventSource has none and
  // fires no error while the request simply hangs — a shared trace link
  // opened against a sleeping backend pulsed "awaiting next step…" forever.
  it("fails a connection that never answers, and retries", async () => {
    const dispose = openTraceStream("tsk_cold", () => {});
    const first = StubEventSource.last();

    await vi.advanceTimersByTimeAsync(STREAM_CONNECT_TIMEOUT_MS - 1);
    expect(first.closed).toBe(false);
    expect(StubEventSource.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2);
    expect(first.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(StubEventSource.instances).toHaveLength(2);
    dispose();
  });

  it("stops arming the deadline once the connection is open", async () => {
    const dispose = openTraceStream("tsk_warm", () => {});
    const first = StubEventSource.last();
    first.emit("open");

    // A quiet-but-live stream (steps take up to 120s) must survive.
    await vi.advanceTimersByTimeAsync(STREAM_CONNECT_TIMEOUT_MS * 10);

    expect(first.closed).toBe(false);
    expect(StubEventSource.instances).toHaveLength(1);
    dispose();
  });

  it("surfaces a real failure instead of hanging when no connection ever answers", async () => {
    const onError = vi.fn();
    fetchMock.mockRejectedValue(new Error("GET /trace/tsk_dead → 404"));
    const dispose = openTraceStream("tsk_dead", () => {}, undefined, onError);

    // Hung connects and their backoffs until the outage ceiling hands over to
    // polling, which 404s its way out too. The ceiling bounds one outage by
    // wall clock, so the failure surfaces after fewer attempts than the raw
    // 4-attempt budget would have taken.
    await vi.advanceTimersByTimeAsync(
      (STREAM_CONNECT_TIMEOUT_MS + 4_000) * 4 + TRACE_POLL_MS * 3 + 10,
    );

    expect(StubEventSource.instances).toHaveLength(3);
    expect(onError).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("clears the deadline on dispose", async () => {
    const dispose = openTraceStream("tsk_unmounted", () => {});
    const first = StubEventSource.last();

    dispose();
    await vi.advanceTimersByTimeAsync(STREAM_CONNECT_TIMEOUT_MS * 3);

    expect(StubEventSource.instances).toHaveLength(1);
    expect(first.closed).toBe(true);
  });
});

// ── Agent endpoint binding (story 2.01) ─────────────────────

const AGENT_ID = "orizon_batch";
const ENDPOINT = "https://agent.example.com/run";
const OWNER = "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E";

const challengeFixture = {
  agent_id: AGENT_ID,
  nonce: "n_7f3a91",
  message: `orizon-bind:v1:${AGENT_ID}:${ENDPOINT}:n_7f3a91`,
  expires_at: "2026-09-15T12:00:30Z",
  ttl_seconds: 30,
};

const bindingFixture = {
  agent_id: AGENT_ID,
  endpoint_url: ENDPOINT,
  owner: OWNER,
  bound_at: "2026-09-15T12:00:00Z",
  replaced: false,
};

describe("createBindChallenge", () => {
  it("posts the candidate endpoint and resolves the parsed challenge", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, challengeFixture));

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).resolves.toEqual(
      challengeFixture,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/orizon_batch/bind/challenge",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint_url: ENDPOINT }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("escapes the agent id into its path segment", async () => {
    const id = "orizon batch";
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...challengeFixture,
        agent_id: id,
        message: `orizon-bind:v1:${id}:${ENDPOINT}:n_7f3a91`,
      }),
    );

    await createBindChallenge(id, ENDPOINT);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/orizon%20batch/bind/challenge",
      expect.anything(),
    );
  });

  it("accepts an epoch expires_at as readily as an ISO one", async () => {
    const epoch = { ...challengeFixture, expires_at: 1_789_000_000 };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, epoch));

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).resolves.toEqual(
      epoch,
    );
  });

  it("rejects a challenge with no message for the wallet to sign", async () => {
    const { message: _drop, ...rest } = challengeFixture;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, rest));

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toThrow(
      "malformed response from /agents/orizon_batch/bind/challenge",
    );
  });

  // The wallet prompt shows an opaque blob, so a challenge for someone else's
  // agent would be signed without the owner ever seeing whose it was.
  it("rejects a challenge that addresses a different agent", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...challengeFixture,
        agent_id: "someone_else",
        message: `orizon-bind:v1:someone_else:${ENDPOINT}:n_7f3a91`,
      }),
    );

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toThrow(
      "challenge does not address orizon_batch",
    );
  });

  it("rejects a message whose id segment disagrees with the body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...challengeFixture,
        message: `orizon-bind:v1:someone_else:${ENDPOINT}:n_7f3a91`,
      }),
    );

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toThrow(
      "challenge does not address orizon_batch",
    );
  });

  it("rejects a message that does not end in the nonce it reports", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...challengeFixture,
        message: `orizon-bind:v1:${AGENT_ID}:${ENDPOINT}:n_other`,
      }),
    );

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toThrow(
      "challenge does not address orizon_batch",
    );
  });

  it("carries agent_not_found on a 404", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, {
        detail: "unknown agent",
        error: { code: "agent_not_found", message: "unknown agent" },
      }),
    );

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toMatchObject(
      { status: 404, code: "agent_not_found" },
    );
  });

  it("carries not_agent_owner on a 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: "not_agent_owner", message: "wallet does not own it" },
      }),
    );

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toMatchObject(
      { status: 401, code: "not_agent_owner" },
    );
  });

  it("carries endpoint_not_allowed on a 422", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        error: { code: "endpoint_not_allowed", message: "loopback refused" },
      }),
    );

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toMatchObject(
      { status: 422, code: "endpoint_not_allowed" },
    );
  });

  it("reports a 429 with the wait the limiter asked for", async () => {
    fetchMock.mockResolvedValueOnce({
      ...jsonResponse(429, {
        error: { code: "rate_limited", message: "too many requests" },
      }),
      headers: {
        get: (name: string) => (name === "retry-after" ? "8" : null),
      },
    });

    await expect(createBindChallenge(AGENT_ID, ENDPOINT)).rejects.toMatchObject(
      { status: 429, code: "rate_limited", retryAfterMs: 8_000 },
    );
  });
});

describe("bindAgent", () => {
  const body = { endpoint_url: ENDPOINT, signature: "c2lnbmF0dXJl" };

  it("posts the endpoint and signature and resolves the stored binding", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, bindingFixture));

    await expect(bindAgent(AGENT_ID, body)).resolves.toEqual(bindingFixture);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/orizon_batch/bind",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("carries the replaced flag through so the UI can say what happened", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...bindingFixture, replaced: true }),
    );

    await expect(bindAgent(AGENT_ID, body)).resolves.toMatchObject({
      replaced: true,
    });
  });

  it("rejects a binding whose replaced flag is a string", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...bindingFixture, replaced: "false" }),
    );

    await expect(bindAgent(AGENT_ID, body)).rejects.toThrow(
      "malformed response from /agents/orizon_batch/bind",
    );
  });

  it("carries challenge_invalid on a 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: "challenge_invalid", message: "nonce expired" },
      }),
    );

    await expect(bindAgent(AGENT_ID, body)).rejects.toMatchObject({
      status: 401,
      code: "challenge_invalid",
    });
  });

  it("carries signature_malformed on a 422", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        error: { code: "signature_malformed", message: "not base64 ed25519" },
      }),
    );

    await expect(bindAgent(AGENT_ID, body)).rejects.toMatchObject({
      status: 422,
      code: "signature_malformed",
    });
  });

  it("carries registry_unavailable on a 503", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: { code: "registry_unavailable", message: "rpc down" },
      }),
    );

    await expect(bindAgent(AGENT_ID, body)).rejects.toMatchObject({
      status: 503,
      code: "registry_unavailable",
    });
  });
});
