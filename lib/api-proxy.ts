/**
 * The console's read-through cache in front of the backend, for the reads
 * every visitor shares: the overview, the registry, the reputation batch, the
 * network info, the adoption figures. Server-only: the route handlers under
 * app/api/ build on it, and the browser reaches it as the same `/api/*` paths
 * it always used (a route handler wins over the catch-all rewrite in
 * next.config.mjs, which still proxies every other path).
 *
 * Why it exists. The backend sleeps on Render's free plan and takes about a
 * minute to wake; awake, the overview takes ~2.7 s and the reputation batch
 * ~2.9 s, and the adoption read minutes. Proxied straight through, every
 * visitor paid that. Here:
 *
 *   - A copy is served from memory while it is fresh, and Vercel's CDN holds
 *     the response (`Vercel-CDN-Cache-Control`, stale-while-revalidate), so a
 *     warm answer comes from the edge in tens of milliseconds and refreshes in
 *     the background.
 *   - Reads of the backend are single-flight and bounded: one read per
 *     resource at a time, aborted at `upstreamTimeoutMs`.
 *   - Holding a copy, the handler waits at most `staleWaitMs` for a fresh one
 *     and otherwise answers with the copy it has, dated. Holding none, it
 *     waits `coldWaitMs` and then answers 503 `backend_waking` with a
 *     Retry-After, so the browser hears "waking" in seconds instead of
 *     holding a socket open for a minute. Either way the read it started
 *     keeps going (Vercel's `waitUntil` when the platform offers it), so the
 *     next request finds the answer.
 *   - A failed or malformed read never replaces a good copy, and a backend
 *     error never reaches the browser while a copy exists.
 *   - A registry read the backend calls partial never replaces a complete
 *     copy (lib/registry-sync.ts): the complete copy is served, dated, until
 *     the refill finishes.
 *
 * Every successful answer carries `X-Orizon-Read-At` (epoch ms of the
 * backend read it came from), so the browser can say how old it is, and
 * `X-Orizon-Cache` (fresh | stale | held) for whoever is debugging.
 */

import {
  CACHE_STATE_HEADER,
  NEXT_CURSOR_HEADER,
  READ_AT_HEADER,
  TOTAL_COUNT_HEADER,
  WAKING_MESSAGE,
} from "./api-contract";

export {
  CACHE_STATE_HEADER,
  NEXT_CURSOR_HEADER,
  READ_AT_HEADER,
  TOTAL_COUNT_HEADER,
  WAKING_MESSAGE,
};

/** What a waking 503 asks the browser to wait before asking again. */
export const WAKING_RETRY_AFTER_S = 3;

/** How long the CDN may serve a copy past its freshness while it asks the
 * function again in the background, or while the function is failing. */
export const CDN_STALE_S = 86_400;
/** CDN freshness of an answer that is not a fresh complete copy: a stale
 * copy served through an outage, or a partial registry. Short, so the edge
 * asks again soon. */
export const CDN_SHORT_S = 5;
/** How long a partial registry read is reused before the backend is asked
 * again: the refill takes ~45 s and the surfaces want to see it finish. */
export const PARTIAL_FRESH_MS = 5_000;
/** Largest page a paged read serves. */
export const MAX_PAGE_LIMIT = 200;

export type CachedReadConfig = {
  /** The backend path under `/api`, e.g. "/metrics/overview". */
  path: string;
  /** How long a copy counts as fresh, in memory and at the CDN. */
  freshMs: number;
  /** How long a request holding no copy waits on the backend. */
  coldWaitMs: number;
  /** How long a request holding a stale copy waits for a fresh one. */
  staleWaitMs: number;
  /** The hard bound on one backend read. */
  upstreamTimeoutMs: number;
  /** The shape check. A body failing it is an error, never a copy. */
  accept: (body: unknown) => boolean;
  /** Whether the read is a partial registry (lib/registry-sync.ts). */
  partial?: (body: unknown, headers: Headers) => boolean;
  /** Backend response headers the answer carries on (case-insensitive). */
  passHeaders?: readonly string[];
};

/** One good read of the backend. */
export type Copy = {
  /** The body exactly as the backend sent it. */
  text: string;
  value: unknown;
  /** Epoch ms the read completed — what this proxy's freshness runs on. */
  readAt: number;
  /** Epoch ms the data itself dates from: the read, less the backend's own
   * `X-Snapshot-Age` when it serves a snapshot. What the browser is told. */
  dataAt?: number;
  /** The backend's validator, sent back as `If-None-Match` on the next read. */
  etag?: string;
  partial: boolean;
  /** The `passHeaders` the backend sent, by their configured spelling. */
  headers: Record<string, string>;
};

/** What a request gets: a copy, or the reason there is none. */
export type ReadOutcome =
  | {
      ok: true;
      copy: Copy;
      /** fresh: read within `freshMs` · stale: older, the backend did not
       * answer in time · held: a complete copy kept over a partial read. */
      state: "fresh" | "stale" | "held";
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      /** Seconds, for a Retry-After. */
      retryAfter?: string;
      /** The backend's own error body, passed on for a 4xx. */
      upstreamBody?: string;
    };

/** A backend read that failed with an answer worth relaying. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly body?: string,
    readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export type CachedReadDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** Backend origin, no trailing slash, no `/api` (lib/api-base.mjs). */
  base: string;
  now: () => number;
  /** Keeps a read alive past the response that started it, when the
   * platform can (Vercel's request-context `waitUntil`). */
  background?: (work: Promise<unknown>) => void;
  /** Extra headers for every backend read — the proxy token
   * (lib/proxy-identity.ts). Read per request, so a rotated secret applies
   * without a restart. */
  headers?: () => Record<string, string>;
};

type Deadline<T> =
  | { kind: "value"; value: T }
  | { kind: "error"; error: unknown }
  | { kind: "late" };

/** `promise`'s outcome, or "late" once `ms` has passed. Never rejects. */
function within<T>(promise: Promise<T>, ms: number): Promise<Deadline<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: "late" }), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ kind: "value", value });
      },
      (error: unknown) => {
        clearTimeout(timer);
        resolve({ kind: "error", error });
      },
    );
  });
}

/**
 * One cached backend resource. Holds at most one copy and one read in
 * flight; instances live as long as the server process (one per route).
 */
export class CachedRead {
  private copy: Copy | null = null;
  private inflight: Promise<Copy> | null = null;
  /** When the latest backend read completed, whether or not it was kept. */
  private lastReadAt = 0;

  constructor(
    readonly config: CachedReadConfig,
    private readonly deps: CachedReadDeps,
  ) {}

  /** The copy held right now — for tests and diagnostics. */
  peek(): Copy | null {
    return this.copy;
  }

  private isFresh(copy: Copy): boolean {
    const ttl = copy.partial
      ? Math.min(PARTIAL_FRESH_MS, this.config.freshMs)
      : this.config.freshMs;
    return this.deps.now() - copy.readAt < ttl;
  }

  /** The answer for one request. Never rejects. */
  async read(): Promise<ReadOutcome> {
    const held = this.copy;
    if (held && this.isFresh(held)) {
      return { ok: true, copy: held, state: "fresh" };
    }
    const wait = held ? this.config.staleWaitMs : this.config.coldWaitMs;
    const outcome = await within(this.refresh(), wait);
    if (outcome.kind === "value") {
      const served = outcome.value;
      // A partial read beside a complete copy resolves to the complete one.
      const state = served.readAt === this.lastReadAt ? "fresh" : "held";
      return { ok: true, copy: served, state };
    }
    // The read failed or is still running: serve whatever is held, which may
    // be newer than `held` if a parallel read landed meanwhile.
    const fallback = this.copy;
    if (fallback) return { ok: true, copy: fallback, state: "stale" };
    if (outcome.kind === "late") {
      return {
        ok: false,
        status: 503,
        code: "backend_waking",
        message: WAKING_MESSAGE,
        retryAfter: String(WAKING_RETRY_AFTER_S),
      };
    }
    return failure(outcome.error);
  }

  /** The single read in flight, started if there is none. Resolves to the
   * copy to serve after it: the new one, or a complete copy it did not
   * replace. */
  private refresh(): Promise<Copy> {
    if (this.inflight) return this.inflight;
    const run = this.fetchUpstream()
      .then((incoming) => {
        this.lastReadAt = incoming.readAt;
        const held = this.copy;
        // Never trade a complete registry for a partial one.
        if (!incoming.partial || !held || held.partial) this.copy = incoming;
        return this.copy ?? incoming;
      })
      .finally(() => {
        if (this.inflight === run) this.inflight = null;
      });
    this.inflight = run;
    // A request that stops waiting must not take the read down with it.
    this.deps.background?.(run.catch(() => undefined));
    return run;
  }

  private async fetchUpstream(): Promise<Copy> {
    const { path, upstreamTimeoutMs, accept, partial, passHeaders } =
      this.config;
    const held = this.copy;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs);
    let res: Response;
    let text: string;
    try {
      res = await this.deps.fetch(`${this.deps.base}/api${path}`, {
        method: "GET",
        headers: {
          ...this.deps.headers?.(),
          accept: "application/json",
          // Revalidate what is held: an unchanged snapshot answers 304 with
          // no body, which for the adoption report saves its whole payload.
          ...(held?.etag ? { "if-none-match": held.etag } : {}),
        },
        // Next's own fetch cache would answer stale reads by blocking the
        // response on the refresh; this module is the cache.
        cache: "no-store",
        signal: controller.signal,
      });
      text = await res.text();
    } catch (err) {
      if (controller.signal.aborted) {
        throw new UpstreamError(
          `GET ${path} timed out after ${upstreamTimeoutMs / 1000}s`,
          504,
          "backend_timeout",
        );
      }
      throw new UpstreamError(
        `GET ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
        503,
        "backend_unreachable",
      );
    } finally {
      clearTimeout(timer);
    }
    const now = this.deps.now();
    const dataAt = snapshotDataAt(res.headers, now);
    if (res.status === 304 && held) {
      // Unchanged: the same body, read again just now.
      return { ...held, readAt: now, dataAt: dataAt ?? held.dataAt };
    }
    if (res.status === 202) {
      // The backend has no report yet and is building one. Not an answer to
      // cache, and never one that replaces a copy: relayed as it came, with
      // its Retry-After, only to a request that has nothing better.
      throw new UpstreamError(
        `GET ${path} is still being computed`,
        202,
        "backend_computing",
        text,
        res.headers.get("retry-after") ?? undefined,
      );
    }
    if (!res.ok) {
      throw new UpstreamError(
        `GET ${path} answered ${res.status}`,
        res.status,
        "backend_error",
        text,
        res.headers.get("retry-after") ?? undefined,
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
    if (value === undefined || !accept(value)) {
      throw new UpstreamError(
        `malformed response from ${path}`,
        502,
        "backend_malformed",
      );
    }
    const headers: Record<string, string> = {};
    for (const name of passHeaders ?? []) {
      const v = res.headers.get(name);
      if (v !== null) headers[name] = v;
    }
    const etag = res.headers.get("etag");
    return {
      text,
      value,
      readAt: now,
      ...(dataAt === undefined ? {} : { dataAt }),
      ...(etag ? { etag } : {}),
      partial: partial?.(value, res.headers) ?? false,
      headers,
    };
  }
}

/** When a snapshot's data dates from, by the backend's `X-Snapshot-Age`
 * (whole seconds); undefined when it sent none or sent nonsense. */
function snapshotDataAt(headers: Headers, now: number): number | undefined {
  const raw = headers.get("x-snapshot-age");
  if (raw === null || !/^\d+$/.test(raw.trim())) return undefined;
  return now - Number(raw.trim()) * 1_000;
}

/** The answer for a request that has no copy to fall back on. */
function failure(error: unknown): ReadOutcome {
  if (!(error instanceof UpstreamError)) {
    return {
      ok: false,
      status: 502,
      code: "proxy_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const { status } = error;
  if (status === 202) {
    // "Still computing": relayed as the backend worded it, so the browser
    // can say so and ask again when it was told to.
    return {
      ok: false,
      status: 202,
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
      upstreamBody: error.body,
    };
  }
  // A 4xx is the backend's answer about the request — a missing route on an
  // older backend, a rate limit — and the browser's error handling keys on
  // it (a 404 is not retried, a 429 waits its Retry-After). Relay it.
  if (status >= 400 && status < 500 && status !== 408) {
    return {
      ok: false,
      status,
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
      upstreamBody: error.body,
    };
  }
  return {
    ok: false,
    status: status === 502 || status === 504 ? status : 503,
    code: error.code,
    message:
      status === 504
        ? WAKING_MESSAGE
        : "the backend could not answer right now — try again shortly",
    retryAfter: error.retryAfter ?? String(WAKING_RETRY_AFTER_S),
  };
}

/** A page request: the first `limit` items from `offset`. */
export type PageQuery = { limit: number; offset: number };

/**
 * `?limit=&cursor=` → a page query, null for a whole-list request, or an
 * error sentence for a malformed one. The cursor is opaque to the browser;
 * here it is the offset of the page's first item.
 */
export function parsePageQuery(
  params: URLSearchParams,
): PageQuery | null | { error: string } {
  const rawLimit = params.get("limit");
  const rawCursor = params.get("cursor");
  if (rawLimit === null && rawCursor === null) return null;
  const limit = rawLimit === null ? MAX_PAGE_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    return { error: `limit must be an integer from 1 to ${MAX_PAGE_LIMIT}` };
  }
  const offset = rawCursor === null ? 0 : Number(rawCursor);
  if (!/^\d+$/.test(rawCursor ?? "0") || !Number.isSafeInteger(offset)) {
    return { error: "cursor is not one this server issued" };
  }
  return { limit, offset };
}

const JSON_TYPE = "application/json";
/** What the browser itself may do: keep nothing it cannot revalidate. */
const BROWSER_CACHE = "public, max-age=0, must-revalidate";

/** The CDN directive for a served copy. */
export function cdnDirective(
  copy: Copy,
  state: "fresh" | "stale" | "held",
  freshMs: number,
  now: number,
): string {
  if (copy.partial) {
    return `max-age=${CDN_SHORT_S}, stale-while-revalidate=${CDN_SHORT_S * 2}`;
  }
  const remaining = Math.ceil((freshMs - (now - copy.readAt)) / 1000);
  const maxAge =
    state === "fresh" ? Math.max(1, remaining) : Math.max(1, CDN_SHORT_S);
  return `max-age=${maxAge}, stale-while-revalidate=${CDN_STALE_S}, stale-if-error=${CDN_STALE_S}`;
}

/** Builds the HTTP answer for an outcome, paging an array body on request. */
export function toResponse(
  outcome: ReadOutcome,
  config: Pick<CachedReadConfig, "freshMs">,
  now: number,
  page: PageQuery | null = null,
): Response {
  if (!outcome.ok) {
    const headers = new Headers({
      "content-type": JSON_TYPE,
      "cache-control": "no-store",
    });
    if (outcome.retryAfter) headers.set("retry-after", outcome.retryAfter);
    const body =
      outcome.upstreamBody && isJsonText(outcome.upstreamBody)
        ? outcome.upstreamBody
        : JSON.stringify({
            detail: outcome.message,
            error: { code: outcome.code, message: outcome.message },
          });
    return new Response(body, { status: outcome.status, headers });
  }

  const { copy, state } = outcome;
  const headers = new Headers({
    "content-type": JSON_TYPE,
    "cache-control": BROWSER_CACHE,
    "vercel-cdn-cache-control": cdnDirective(copy, state, config.freshMs, now),
    [READ_AT_HEADER]: String(copy.dataAt ?? copy.readAt),
    [CACHE_STATE_HEADER]: state,
  });
  for (const [k, v] of Object.entries(copy.headers)) headers.set(k, v);

  if (page === null || !Array.isArray(copy.value)) {
    return new Response(copy.text, { status: 200, headers });
  }
  const items: unknown[] = copy.value;
  const slice = items.slice(page.offset, page.offset + page.limit);
  const next = page.offset + page.limit;
  headers.set(TOTAL_COUNT_HEADER, String(items.length));
  if (next < items.length) headers.set(NEXT_CURSOR_HEADER, String(next));
  // The backend's count is the length of ITS list; this body is a page.
  headers.delete("X-Registry-Count");
  return new Response(JSON.stringify(slice), { status: 200, headers });
}

function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Vercel's per-request `waitUntil`, when this runs on Vercel. */
export function platformBackground(work: Promise<unknown>): void {
  const holder = (globalThis as Record<symbol, unknown>)[
    Symbol.for("@vercel/request-context")
  ] as
    { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
  const ctx = holder?.get?.();
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
}

/**
 * A GET route handler over a cached read. `paged` lets the browser ask for
 * `?limit=&cursor=` over an array resource; without it the query is ignored.
 */
export function cachedRouteHandler(
  read: CachedRead,
  opts: { paged?: boolean; now?: () => number } = {},
): (request: Request) => Promise<Response> {
  const now = opts.now ?? Date.now;
  return async function GET(request: Request): Promise<Response> {
    let page: PageQuery | null = null;
    if (opts.paged) {
      const parsed = parsePageQuery(new URL(request.url).searchParams);
      if (parsed !== null && "error" in parsed) {
        return toResponse(
          {
            ok: false,
            status: 400,
            code: "invalid_query",
            message: parsed.error,
          },
          read.config,
          now(),
        );
      }
      page = parsed;
    }
    const outcome = await read.read();
    return toResponse(outcome, read.config, now(), page);
  };
}
