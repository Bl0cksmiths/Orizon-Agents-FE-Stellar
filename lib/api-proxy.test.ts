/**
 * The read-through cache behind the console's shared reads (lib/api-proxy.ts):
 * freshness, the two waits, single flight, the never-a-5xx-over-a-copy rule,
 * the registry rule, paging, and the headers the browser and the CDN read.
 * Fake timers throughout; the backend is a fetch stub the tests answer by
 * hand, so "slow", "asleep" and "down" are each one line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_STATE_HEADER,
  CDN_SHORT_S,
  CDN_STALE_S,
  CachedRead,
  MAX_PAGE_LIMIT,
  NEXT_CURSOR_HEADER,
  PARTIAL_FRESH_MS,
  READ_AT_HEADER,
  TOTAL_COUNT_HEADER,
  WAKING_MESSAGE,
  cachedRouteHandler,
  parsePageQuery,
  platformBackground,
  toResponse,
  type CachedReadConfig,
} from "./api-proxy";

const BASE = "https://backend.test";

type Pending = {
  url: string;
  init: RequestInit;
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
};

/** A backend whose every read waits for the test to answer it. */
function backend() {
  const pending: Pending[] = [];
  const fetch = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const entry = { url, init, resolve, reject };
        pending.push(entry);
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );
  const answer = (
    body: unknown,
    init: { status?: number; headers?: Record<string, string> } = {},
  ) => {
    const next = pending.shift();
    if (!next) throw new Error("no read is waiting");
    next.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json", ...init.headers },
      }),
    );
  };
  const fail = (err: unknown = new TypeError("fetch failed")) => {
    const next = pending.shift();
    if (!next) throw new Error("no read is waiting");
    next.reject(err);
  };
  return { fetch, pending, answer, fail };
}

const CONFIG: CachedReadConfig = {
  path: "/things",
  freshMs: 15_000,
  coldWaitMs: 10_000,
  staleWaitMs: 4_000,
  upstreamTimeoutMs: 55_000,
  accept: (v) => Array.isArray(v),
};

function setup(config: Partial<CachedReadConfig> = {}) {
  const be = backend();
  const background = vi.fn();
  const read = new CachedRead(
    { ...CONFIG, ...config },
    { fetch: be.fetch, base: BASE, now: () => Date.now(), background },
  );
  return { be, read, background };
}

/** Lets resolved promises and their continuations run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CachedRead", () => {
  it("reads the backend once, then serves the fresh copy from memory", async () => {
    const { be, read } = setup();
    const first = read.read();
    await flush();
    expect(be.fetch).toHaveBeenCalledWith(
      `${BASE}/api/things`,
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
    be.answer([1, 2]);
    const out = await first;
    expect(out).toMatchObject({ ok: true, state: "fresh" });

    await vi.advanceTimersByTimeAsync(14_000);
    const again = await read.read();
    expect(again).toMatchObject({ ok: true, state: "fresh" });
    expect(be.fetch).toHaveBeenCalledTimes(1);
  });

  it("shares one backend read between concurrent requests", async () => {
    const { be, read } = setup();
    const a = read.read();
    const b = read.read();
    await flush();
    expect(be.fetch).toHaveBeenCalledTimes(1);
    be.answer([1]);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.ok && rb.ok && ra.copy === rb.copy).toBe(true);
  });

  it("answers 503 backend_waking after the cold wait and keeps the read alive", async () => {
    const { be, read, background } = setup();
    const out = read.read();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await out).toEqual({
      ok: false,
      status: 503,
      code: "backend_waking",
      message: WAKING_MESSAGE,
      retryAfter: "3",
    });
    // Handed to the platform so it outlives the response…
    expect(background).toHaveBeenCalledTimes(1);
    // …and still the one read in flight: the next request joins it.
    const next = read.read();
    await flush();
    expect(be.fetch).toHaveBeenCalledTimes(1);
    be.answer(["woke"]);
    expect(await next).toMatchObject({
      ok: true,
      state: "fresh",
      copy: { value: ["woke"] },
    });
  });

  it("serves the stale copy, dated, when the backend is slower than the stale wait", async () => {
    const { be, read } = setup();
    const first = read.read();
    await flush();
    be.answer(["v1"]);
    const v1 = await first;
    const readAt = v1.ok ? v1.copy.readAt : 0;

    await vi.advanceTimersByTimeAsync(20_000);
    const slow = read.read();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await slow).toMatchObject({
      ok: true,
      state: "stale",
      copy: { value: ["v1"], readAt },
    });
    // The slow read lands later and replaces the copy for the next request.
    be.answer(["v2"]);
    await flush();
    expect(read.peek()?.value).toEqual(["v2"]);
  });

  it("returns the fresh read when it lands within the stale wait", async () => {
    const { be, read } = setup();
    const first = read.read();
    await flush();
    be.answer(["v1"]);
    await first;
    await vi.advanceTimersByTimeAsync(20_000);
    const next = read.read();
    await vi.advanceTimersByTimeAsync(2_900);
    be.answer(["v2"]);
    expect(await next).toMatchObject({
      state: "fresh",
      copy: { value: ["v2"] },
    });
  });

  it("never answers a backend 5xx over a copy it holds", async () => {
    const { be, read } = setup();
    const first = read.read();
    await flush();
    be.answer(["good"]);
    await first;
    await vi.advanceTimersByTimeAsync(20_000);
    const next = read.read();
    await flush();
    be.answer({ detail: "down" }, { status: 502 });
    expect(await next).toMatchObject({
      ok: true,
      state: "stale",
      copy: { value: ["good"] },
    });
    expect(read.peek()?.value).toEqual(["good"]);
  });

  it("keeps the good copy over a network failure and a malformed body", async () => {
    const { be, read } = setup();
    const first = read.read();
    await flush();
    be.answer(["good"]);
    await first;

    await vi.advanceTimersByTimeAsync(20_000);
    const dropped = read.read();
    await flush();
    be.fail();
    expect(await dropped).toMatchObject({ ok: true, state: "stale" });

    await vi.advanceTimersByTimeAsync(20_000);
    const garbled = read.read();
    await flush();
    be.answer({ not: "a list" });
    expect(await garbled).toMatchObject({ ok: true, state: "stale" });
    expect(read.peek()?.value).toEqual(["good"]);
  });

  it("aborts a backend read at the upstream timeout", async () => {
    const { be, read } = setup({
      coldWaitMs: 60_000,
      upstreamTimeoutMs: 5_000,
    });
    const out = read.read();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(be.pending[0].init.signal?.aborted).toBe(true);
    expect(await out).toMatchObject({
      ok: false,
      status: 504,
      code: "backend_timeout",
      message: WAKING_MESSAGE,
    });
  });

  it("relays a backend 4xx when it holds nothing", async () => {
    const { be, read } = setup();
    const out = read.read();
    await flush();
    be.answer(
      { error: { code: "not_found", message: "no such route" } },
      { status: 404 },
    );
    const res = await out;
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(!res.ok && JSON.parse(res.upstreamBody ?? "")).toEqual({
      error: { code: "not_found", message: "no such route" },
    });
  });

  it("relays a 429 with its Retry-After", async () => {
    const { be, read } = setup();
    const out = read.read();
    await flush();
    be.answer(
      { detail: "slow down" },
      { status: 429, headers: { "retry-after": "7" } },
    );
    expect(await out).toMatchObject({
      ok: false,
      status: 429,
      retryAfter: "7",
    });
  });

  it("maps an unreachable backend to a 503 the browser retries", async () => {
    const { be, read } = setup();
    const out = read.read();
    await flush();
    be.fail();
    expect(await out).toMatchObject({
      ok: false,
      status: 503,
      code: "backend_unreachable",
      retryAfter: "3",
    });
  });

  it("calls a malformed body with nothing held a 502", async () => {
    const { be, read } = setup();
    const out = read.read();
    await flush();
    be.answer("<html>gateway</html>");
    expect(await out).toMatchObject({
      ok: false,
      status: 502,
      code: "backend_malformed",
    });
  });

  it("carries the configured backend headers on the copy", async () => {
    const { be, read } = setup({ passHeaders: ["X-Registry-Synced"] });
    const out = read.read();
    await flush();
    be.answer([1], {
      headers: { "x-registry-synced": "true", "x-other": "no" },
    });
    expect(await out).toMatchObject({
      copy: { headers: { "X-Registry-Synced": "true" } },
    });
  });

  describe("the registry rule", () => {
    const registry = {
      passHeaders: ["X-Registry-Synced"],
      partial: (_: unknown, h: Headers) =>
        h.get("x-registry-synced") === "false",
    };

    it("never replaces a complete copy with a partial read", async () => {
      const { be, read } = setup(registry);
      const first = read.read();
      await flush();
      be.answer([1, 2, 3], { headers: { "x-registry-synced": "true" } });
      await first;

      await vi.advanceTimersByTimeAsync(20_000);
      const refill = read.read();
      await flush();
      be.answer([1], { headers: { "x-registry-synced": "false" } });
      expect(await refill).toMatchObject({
        ok: true,
        state: "held",
        copy: { value: [1, 2, 3], partial: false },
      });
      expect(read.peek()?.value).toEqual([1, 2, 3]);
    });

    it("serves a partial read when nothing complete is held, and asks again soon", async () => {
      const { be, read } = setup(registry);
      const first = read.read();
      await flush();
      be.answer([1], { headers: { "x-registry-synced": "false" } });
      expect(await first).toMatchObject({ copy: { partial: true } });

      await vi.advanceTimersByTimeAsync(PARTIAL_FRESH_MS);
      const again = read.read();
      await flush();
      expect(be.fetch).toHaveBeenCalledTimes(2);
      be.answer([1, 2], { headers: { "x-registry-synced": "true" } });
      expect(await again).toMatchObject({
        state: "fresh",
        copy: { value: [1, 2], partial: false },
      });
    });
  });
});

describe("parsePageQuery", () => {
  const q = (s: string) => parsePageQuery(new URLSearchParams(s));

  it("is null for a whole-list request", () => {
    expect(q("")).toBeNull();
    expect(q("fresh=1")).toBeNull();
  });

  it("reads limit and cursor", () => {
    expect(q("limit=50")).toEqual({ limit: 50, offset: 0 });
    expect(q("limit=50&cursor=100")).toEqual({ limit: 50, offset: 100 });
    expect(q("cursor=100")).toEqual({ limit: MAX_PAGE_LIMIT, offset: 100 });
  });

  it("refuses what it did not issue", () => {
    for (const bad of [
      "limit=0",
      "limit=-1",
      "limit=2.5",
      `limit=${MAX_PAGE_LIMIT + 1}`,
      "limit=abc",
      "limit=10&cursor=-5",
      "limit=10&cursor=1e3",
      "limit=10&cursor=",
    ]) {
      expect(q(bad)).toHaveProperty("error");
    }
  });
});

describe("toResponse", () => {
  const copy = {
    text: "[1,2,3,4,5]",
    value: [1, 2, 3, 4, 5],
    readAt: 1_000_000,
    partial: false,
    headers: { "X-Registry-Synced": "true", "X-Registry-Count": "5" },
  };

  it("sends the body as read, dated, with CDN stale-while-revalidate", async () => {
    const res = toResponse(
      { ok: true, copy, state: "fresh" },
      { freshMs: 15_000 },
      1_000_000 + 5_000,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("[1,2,3,4,5]");
    expect(res.headers.get(READ_AT_HEADER)).toBe("1000000");
    expect(res.headers.get(CACHE_STATE_HEADER)).toBe("fresh");
    expect(res.headers.get("x-registry-synced")).toBe("true");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(res.headers.get("vercel-cdn-cache-control")).toBe(
      `max-age=10, stale-while-revalidate=${CDN_STALE_S}, stale-if-error=${CDN_STALE_S}`,
    );
  });

  it("gives a stale copy a short CDN life so the edge asks again soon", () => {
    const res = toResponse(
      { ok: true, copy, state: "stale" },
      { freshMs: 15_000 },
      1_000_000 + 60_000,
    );
    expect(res.headers.get("vercel-cdn-cache-control")).toBe(
      `max-age=${CDN_SHORT_S}, stale-while-revalidate=${CDN_STALE_S}, stale-if-error=${CDN_STALE_S}`,
    );
  });

  it("never lets the CDN hold a partial registry past a few seconds", () => {
    const res = toResponse(
      { ok: true, copy: { ...copy, partial: true }, state: "fresh" },
      { freshMs: 15_000 },
      1_000_000,
    );
    expect(res.headers.get("vercel-cdn-cache-control")).toBe(
      `max-age=${CDN_SHORT_S}, stale-while-revalidate=${CDN_SHORT_S * 2}`,
    );
  });

  it("pages an array body with a total and a next cursor", async () => {
    const first = toResponse(
      { ok: true, copy, state: "fresh" },
      { freshMs: 15_000 },
      1_000_000,
      { limit: 2, offset: 0 },
    );
    expect(await first.json()).toEqual([1, 2]);
    expect(first.headers.get(TOTAL_COUNT_HEADER)).toBe("5");
    expect(first.headers.get(NEXT_CURSOR_HEADER)).toBe("2");
    expect(first.headers.get("x-registry-count")).toBeNull();
    expect(first.headers.get("x-registry-synced")).toBe("true");

    const last = toResponse(
      { ok: true, copy, state: "fresh" },
      { freshMs: 15_000 },
      1_000_000,
      { limit: 2, offset: 4 },
    );
    expect(await last.json()).toEqual([5]);
    expect(last.headers.get(NEXT_CURSOR_HEADER)).toBeNull();
  });

  it("sends a failure uncached, in the backend's error envelope", async () => {
    const res = toResponse(
      {
        ok: false,
        status: 503,
        code: "backend_waking",
        message: WAKING_MESSAGE,
        retryAfter: "3",
      },
      { freshMs: 15_000 },
      0,
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("vercel-cdn-cache-control")).toBeNull();
    expect(res.headers.get("retry-after")).toBe("3");
    expect(await res.json()).toEqual({
      detail: WAKING_MESSAGE,
      error: { code: "backend_waking", message: WAKING_MESSAGE },
    });
  });

  it("relays a backend's own JSON error body", async () => {
    const body = JSON.stringify({ error: { code: "x", message: "y" } });
    const res = toResponse(
      {
        ok: false,
        status: 404,
        code: "backend_error",
        message: "m",
        upstreamBody: body,
      },
      { freshMs: 1 },
      0,
    );
    expect(await res.text()).toBe(body);
  });
});

describe("cachedRouteHandler", () => {
  it("serves a page of a paged resource", async () => {
    const { be, read } = setup();
    const GET = cachedRouteHandler(read, { paged: true });
    const res = GET(new Request("https://site.test/api/things?limit=2"));
    await flush();
    be.answer([1, 2, 3]);
    const out = await res;
    expect(await out.json()).toEqual([1, 2]);
    expect(out.headers.get(NEXT_CURSOR_HEADER)).toBe("2");
  });

  it("refuses a malformed page query without reading the backend", async () => {
    const { be, read } = setup();
    const GET = cachedRouteHandler(read, { paged: true });
    const res = await GET(new Request("https://site.test/api/things?limit=0"));
    expect(res.status).toBe(400);
    expect(be.fetch).not.toHaveBeenCalled();
  });

  it("ignores a page query on a resource that is not paged", async () => {
    const { be, read } = setup();
    const GET = cachedRouteHandler(read);
    const res = GET(new Request("https://site.test/api/things?limit=1"));
    await flush();
    be.answer([1, 2, 3]);
    expect(await (await res).json()).toEqual([1, 2, 3]);
  });
});

describe("platformBackground", () => {
  const key = Symbol.for("@vercel/request-context");
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[key];
  });

  it("hands work to Vercel's waitUntil when the platform provides one", () => {
    const waitUntil = vi.fn();
    (globalThis as Record<symbol, unknown>)[key] = {
      get: () => ({ waitUntil }),
    };
    const work = Promise.resolve();
    platformBackground(work);
    expect(waitUntil).toHaveBeenCalledWith(work);
  });

  it("is a no-op anywhere else", () => {
    expect(() => platformBackground(Promise.resolve())).not.toThrow();
  });
});
