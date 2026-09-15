import {
  isAgentBinding,
  isAgentIdAvailability,
  isAgentList,
  isArtifactResponse,
  isAuthorizeBuild,
  isBindChallenge,
  isDecomposeResponse,
  isEndpointCheck,
  isFlow,
  isOverview,
  isReputationBatch,
  isReputationInfo,
  isReputationParams,
  isStellarNetworkInfo,
  isSubmitResult,
  isSyncResponse,
  isTaskList,
  isTraceLine,
  isTraceLineList,
  isXdrResponse,
} from "./guards";
import { getTaskToken, rememberTaskToken } from "./task-tokens";
import type {
  Agent,
  AgentBinding,
  AgentIdAvailability,
  ArtifactResponse,
  AuthorizeBuild,
  BindChallenge,
  BindChallengeReq,
  BindReq,
  DecomposeResponse,
  EndpointCheck,
  ExecuteResponse,
  Flow,
  Overview,
  RegisterAgentReq,
  SetActiveReq,
  UpdatePriceReq,
  ReputationBatch,
  ReputationInfo,
  ReputationParams,
  StellarNetworkInfo,
  SubmitResult,
  SyncResponse,
  Task,
  TraceLine,
  XdrResponse,
} from "./types";

const base = "/api";

// The backend sleeps on Render's free tier and takes 30-60s to wake, so a 30s
// deadline turned every first visit into a hard failure.
export const GET_TIMEOUT_MS = 60_000;
// execute/decompose can be slow, so POSTs get a much longer leash. This MUST
// stay above the backend's own decompose budget (DECOMPOSE_TIMEOUT_SECONDS,
// 90s) plus the reputation fetch that precedes it — otherwise the client
// always aborts first and the backend's typed 504 `decompose_timeout` is
// unreachable, leaving the user a generic "timeout after 90s" instead.
export const POST_TIMEOUT_MS = 105_000;

// Methods that consume the response body. The deadline has to stay armed
// across these — `fetch()` resolves as soon as HEADERS arrive, so clearing
// the timer there left every body read (the artifact route alone returns
// 30-76 kB) unguarded, and a stalled body hung the loading state forever.
const BODY_READERS = new Set([
  "json",
  "text",
  "arrayBuffer",
  "blob",
  "bytes",
  "formData",
]);

/**
 * Wraps a Response so its body readers run inside the same deadline that
 * covered the headers: the timer is cleared when the body settles, and an
 * abort that lands mid-body is reported as the timeout it is.
 *
 * A Proxy (rather than a rebuilt Response) keeps `ok`/`status`/`headers`
 * and every other member reading exactly as the caller expects.
 */
function guardBody(
  res: Response,
  timer: ReturnType<typeof setTimeout>,
  signal: AbortSignal,
  expired: () => Error,
): Response {
  return new Proxy(res, {
    get(target, prop) {
      // `target` as receiver: Response's accessors are prototype getters
      // that need the real instance, not the proxy.
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      const fn = value as (...args: unknown[]) => unknown;
      if (typeof prop !== "string" || !BODY_READERS.has(prop)) {
        return fn.bind(target);
      }
      return async (...args: unknown[]) => {
        try {
          return await fn.apply(target, args);
        } catch (err) {
          if (signal.aborted) throw expired();
          throw err;
        } finally {
          clearTimeout(timer);
        }
      };
    },
  });
}

/**
 * fetch with an AbortController deadline so a hung backend cannot stall
 * loading states forever. The deadline covers the whole exchange — headers
 * AND body. Timeouts reject with a clear message; every other failure
 * (network drop, non-OK status) propagates untouched.
 * Exported so sibling clients (e.g. lib/pdax.ts) share the same plumbing;
 * `path` is relative to the shared `/api` base.
 */
export async function fetchWithTimeout(
  method: "GET" | "POST",
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A caller that never reads the body would otherwise hold the event loop
  // open for the full deadline (node only — browsers return a number).
  (timer as unknown as { unref?: () => void }).unref?.();
  const expired = () =>
    new Error(`${method} ${path} → timeout after ${timeoutMs / 1000}s`);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) throw expired();
    throw err;
  }
  return guardBody(res, timer, controller.signal, expired);
}

/**
 * A non-OK HTTP answer, carrying the machine-readable bits the message can
 * only spell out. `retryAfterMs` mirrors the header the backend's rate
 * limiter sets — lib/use-fetch and lib/use-polling already duck-type that
 * field off rejections, so a throttled page now waits exactly as long as it
 * was asked to instead of guessing.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  // The stable machine-readable code from the error envelope (e.g. "id_taken",
  // "owner_account_unfunded"). Callers that map codes to inline field errors —
  // the register form — key on this, never on the human message.
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    retryAfterMs?: number,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
    if (code !== undefined) this.code = code;
  }
}

/**
 * `Retry-After` in ms — seconds or an HTTP-date, per RFC 9110 — or null when
 * the response says nothing. Written defensively: `headers` is absent on the
 * plain-object responses used in tests.
 */
function retryAfterMs(res: Response): number | undefined {
  const raw = (
    res as { headers?: { get?: (name: string) => string | null } }
  ).headers?.get?.("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1_000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/**
 * Turns a non-OK response into the error the user reads.
 *
 * The backend is standardizing on an { error: { code, message } } envelope —
 * prefer its message, fall back to the legacy `detail` field, then the raw
 * body, then statusText. 429 gets its own sentence: "backend offline" is a
 * lie when the answer was "not this second", and the wait is actionable.
 */
async function httpError(
  method: "GET" | "POST",
  path: string,
  res: Response,
): Promise<ApiError> {
  let detail = "";
  let code: string | undefined;
  try {
    const j = await res.json();
    if (typeof j?.error?.code === "string") code = j.error.code;
    const envelopeMsg =
      typeof j?.error?.message === "string" ? j.error.message : undefined;
    const msg = envelopeMsg ?? j?.detail;
    detail = msg ? ` — ${msg}` : ` — ${JSON.stringify(j).slice(0, 300)}`;
  } catch {
    try {
      detail = ` — ${(await res.text()).slice(0, 300)}`;
    } catch {
      /* ignore */
    }
  }
  if (!detail && res.statusText) detail = ` — ${res.statusText}`;
  const wait = retryAfterMs(res);
  if (res.status === 429) {
    // The limiter's own envelope message is "too many requests", which adds
    // nothing over the status — the wait is the part worth printing.
    detail =
      wait === undefined
        ? " — rate limited, retry shortly"
        : ` — rate limited, retry in ${Math.max(1, Math.ceil(wait / 1_000))}s`;
  }
  return new ApiError(
    `${method} ${path} → ${res.status}${detail}`,
    res.status,
    wait,
    code,
  );
}

// Several components fetch the same GET simultaneously on mount (/app fires
// getOverview from both the sidebar and the page). Identical paths share one
// request while it is in flight and for a short window after it resolves;
// rejections are evicted immediately so retries always hit the network.
export const GET_DEDUPE_MS = 1_000;

type GetCacheEntry = { promise: Promise<unknown>; settledAt: number | null };
const getCache = new Map<string, GetCacheEntry>();

/** Drops all deduped GET entries — exposed for tests. */
export function clearGetCache(): void {
  getCache.clear();
}

function get<T>(
  path: string,
  parse?: (v: unknown) => T,
  headers?: Record<string, string>,
): Promise<T> {
  const hit = getCache.get(path);
  if (
    hit &&
    (hit.settledAt === null || Date.now() - hit.settledAt < GET_DEDUPE_MS)
  ) {
    return hit.promise as Promise<T>;
  }
  const promise = (async () => {
    const res = await fetchWithTimeout(
      "GET",
      path,
      { cache: "no-store", ...(headers ? { headers } : {}) },
      GET_TIMEOUT_MS,
    );
    if (!res.ok) throw await httpError("GET", path, res);
    const json: unknown = await res.json();
    return parse ? parse(json) : (json as T);
  })();
  const entry: GetCacheEntry = { promise, settledAt: null };
  getCache.set(path, entry);
  promise.then(
    () => {
      entry.settledAt = Date.now();
      // A resolved payload must not outlive its dedupe window: per-task
      // paths (/trace/{id}, artifact bodies) are fetched once and would
      // otherwise be retained forever. `unref` (node only) so the sweep
      // never holds the event loop open.
      const evict = setTimeout(() => {
        if (getCache.get(path) === entry) getCache.delete(path);
      }, GET_DEDUPE_MS);
      (evict as unknown as { unref?: () => void }).unref?.();
    },
    () => {
      if (getCache.get(path) === entry) getCache.delete(path);
    },
  );
  return promise;
}

async function post<T, B>(
  path: string,
  body: B,
  parse?: (v: unknown) => T,
): Promise<T> {
  const res = await fetchWithTimeout(
    "POST",
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    POST_TIMEOUT_MS,
  );
  if (!res.ok) throw await httpError("POST", path, res);
  const json: unknown = await res.json();
  return parse ? parse(json) : (json as T);
}

/**
 * Wraps a runtime guard into a parse fn for `get`/`post`: a payload that
 * fails the guard rejects like any other request error and surfaces in the
 * page's normal error state, instead of crashing mid-render on
 * `undefined.toFixed(...)`.
 */
function ensure<T>(
  path: string,
  guard: (v: unknown) => v is T,
): (v: unknown) => T {
  return (v) => {
    if (!guard(v)) throw new Error(`malformed response from ${path}`);
    return v;
  };
}

/**
 * `X-Task-Token` header for per-task reads when this session holds the
 * task's read token (stored at execute time). Undefined — today's exact
 * behavior — when no token is known; required by the backend only once its
 * enforcement flag flips.
 */
function taskAuthHeaders(taskId: string): Record<string, string> | undefined {
  const token = getTaskToken(taskId);
  return token ? { "X-Task-Token": token } : undefined;
}

export const listAgents = () =>
  get<Agent[]>("/agents", ensure("/agents", isAgentList));
export const listTasks = () =>
  get<Task[]>("/tasks", ensure("/tasks", isTaskList));
export const getOverview = () =>
  get<Overview>("/metrics/overview", ensure("/metrics/overview", isOverview));
export const getFlow = () =>
  get<Flow>("/flow/default", ensure("/flow/default", isFlow));
export const getTrace = (taskId: string) =>
  get<TraceLine[]>(
    `/trace/${taskId}`,
    ensure(`/trace/${taskId}`, isTraceLineList),
    taskAuthHeaders(taskId),
  );

export const decompose = (intent: string) =>
  post<DecomposeResponse, { intent: string }>(
    "/orchestrator/decompose",
    { intent },
    ensure("/orchestrator/decompose", isDecomposeResponse),
  );

export const execute = (
  planId: string,
  opts?: { auth_id_hex?: string; payer?: string },
) =>
  post<
    ExecuteResponse,
    { plan_id: string; auth_id_hex?: string; payer?: string }
  >("/orchestrator/execute", { plan_id: planId, ...opts }).then((res) => {
    // Remember the read token at the API seam so every execute caller
    // (simulated and on-chain paths alike) gets later task reads authorized
    // without extra wiring. No-op while the backend ships no token.
    rememberTaskToken(res.task_id, res.read_token);
    return res;
  });

export const getArtifact = (taskId: string) =>
  get<ArtifactResponse>(
    `/tasks/${taskId}/artifact`,
    ensure(`/tasks/${taskId}/artifact`, isArtifactResponse),
    taskAuthHeaders(taskId),
  );

// ── Stellar / x402 ──────────────────────────────────────────
export const getStellarNetwork = () =>
  get<StellarNetworkInfo>(
    "/stellar/network",
    ensure("/stellar/network", isStellarNetworkInfo),
  );

export const buildAuthorize = (body: {
  payer: string;
  agent_id: string;
  max_amount_usdc: number;
  ttl_seconds?: number;
}) =>
  post<AuthorizeBuild, typeof body>(
    "/stellar/build/authorize",
    body,
    ensure("/stellar/build/authorize", isAuthorizeBuild),
  );

export const listReputation = () =>
  get<ReputationBatch>(
    "/stellar/reputation",
    ensure("/stellar/reputation", isReputationBatch),
  );
export const getReputationParams = () =>
  get<ReputationParams>(
    "/stellar/reputation/params",
    ensure("/stellar/reputation/params", isReputationParams),
  );
export const getReputation = (agentId: string) =>
  get<ReputationInfo>(
    `/stellar/reputation/${agentId}`,
    ensure(`/stellar/reputation/${agentId}`, isReputationInfo),
  );

export const submitSigned = (signedXdr: string) =>
  post<SubmitResult, { signed_xdr: string }>(
    "/stellar/submit",
    { signed_xdr: signedXdr },
    ensure("/stellar/submit", isSubmitResult),
  );

export const buildRegisterAgent = (body: RegisterAgentReq) =>
  post<XdrResponse, RegisterAgentReq>(
    "/stellar/build/register-agent",
    body,
    ensure("/stellar/build/register-agent", isXdrResponse),
  );

export const buildUpdatePrice = (body: UpdatePriceReq) =>
  post<XdrResponse, UpdatePriceReq>(
    "/stellar/build/update-price",
    body,
    ensure("/stellar/build/update-price", isXdrResponse),
  );

export const buildSetActive = (body: SetActiveReq) =>
  post<XdrResponse, SetActiveReq>(
    "/stellar/build/set-active",
    body,
    ensure("/stellar/build/set-active", isXdrResponse),
  );

export const agentIdAvailable = (id: string) =>
  get<AgentIdAvailability>(
    `/stellar/agent-id-available/${encodeURIComponent(id)}`,
    ensure("/stellar/agent-id-available", isAgentIdAvailability),
  );

export const syncAgents = () =>
  post<SyncResponse, Record<string, never>>(
    "/stellar/agents/sync",
    {},
    ensure("/stellar/agents/sync", isSyncResponse),
  );

// ── Agent endpoint binding (story 2.01) ─────────────────────

/** `/agents/{id}/bind`, with the id escaped for the path segment it occupies. */
const bindPath = (agentId: string) =>
  `/agents/${encodeURIComponent(agentId)}/bind`;

/**
 * Ask for a signing challenge binding `endpointUrl` to the agent. The wallet
 * signs the returned `message` verbatim — see `BindChallenge.message` for why
 * it is never rebuilt locally.
 *
 * What IS re-checked is that the challenge addresses this agent and carries
 * the nonce it reports: a wallet signature prompt shows the owner an opaque
 * blob, not a claim, so a proxy answering with someone else's challenge would
 * otherwise have them authorize a binding they never asked for. The endpoint
 * segment in the middle is deliberately left unchecked — the backend is free
 * to normalize the URL it embeds, and pinning that here would reject its own
 * canonical form.
 */
export function createBindChallenge(
  agentId: string,
  endpointUrl: string,
): Promise<BindChallenge> {
  const path = `${bindPath(agentId)}/challenge`;
  return post<BindChallenge, BindChallengeReq>(
    path,
    { endpoint_url: endpointUrl },
    ensure(path, isBindChallenge),
  ).then((challenge) => {
    const addressesAgent =
      challenge.agent_id === agentId &&
      challenge.message.startsWith(`orizon-bind:v1:${agentId}:`) &&
      challenge.message.endsWith(`:${challenge.nonce}`);
    if (!addressesAgent) {
      throw new Error(
        `malformed response from ${path} — challenge does not address ${agentId}`,
      );
    }
    return challenge;
  });
}

/**
 * Bind the endpoint, presenting the wallet's base64 ed25519 signature over the
 * challenge message. Resolves to the stored binding, whose `replaced` flag
 * says whether it superseded an earlier endpoint.
 */
export function bindAgent(
  agentId: string,
  body: BindReq,
): Promise<AgentBinding> {
  const path = bindPath(agentId);
  return post<AgentBinding, BindReq>(path, body, ensure(path, isAgentBinding));
}

/**
 * Advisory verdict on a candidate endpoint URL. The backend applies its policy
 * without opening a connection, so this is cheap enough to run while the owner
 * types: a refused URL becomes an inline field hint naming the rule, instead of
 * a bare 422 that only arrives after they have signed with their wallet.
 *
 * A refusal is a 200 with `allowed: false`, not an error — only a transport or
 * backend failure rejects.
 */
export function checkBindEndpoint(url: string): Promise<EndpointCheck> {
  return get<EndpointCheck>(
    `/agents/bind/endpoint-check?url=${encodeURIComponent(url)}`,
    ensure("/agents/bind/endpoint-check", isEndpointCheck),
  );
}

/**
 * The agent's current binding. Rejects with an `ApiError` whose code is
 * `binding_not_found` when the agent has never been bound — prefer
 * `getAgentBindingOrNull` wherever "no endpoint yet" is the ordinary state
 * rather than a failure worth showing.
 */
export function getAgentBinding(agentId: string): Promise<AgentBinding> {
  const path = `/agents/${encodeURIComponent(agentId)}/binding`;
  return get<AgentBinding>(path, ensure(path, isAgentBinding));
}

/**
 * `getAgentBinding` with the unbound case as `null` instead of a rejection: an
 * agent with no endpoint yet is where every agent starts, and bannering that
 * as an error would make the normal path look broken.
 *
 * A 404 naming `agent_not_found` still rejects. The two 404s mean opposite
 * things — one is "nothing bound yet", the other "no such agent" — and
 * collapsing them would render a mistyped id as a healthy, unbound agent.
 */
export function getAgentBindingOrNull(
  agentId: string,
): Promise<AgentBinding | null> {
  return getAgentBinding(agentId).catch((err: unknown) => {
    if (
      err instanceof ApiError &&
      err.status === 404 &&
      err.code !== "agent_not_found"
    ) {
      return null;
    }
    throw err;
  });
}

/** Consecutive failed reconnects tolerated before SSE is given up on. */
const MAX_RECONNECTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000];
/**
 * Lifetime cap on reconnects. The per-outage budget above refreshes on every
 * connection that actually ran, which is what keeps a 12-minute workflow
 * alive — this is the backstop that keeps a server accepting and instantly
 * dropping the stream from reconnecting forever.
 */
const MAX_TOTAL_RECONNECTS = 60;
/**
 * Wall-clock ceiling on a SINGLE outage.
 *
 * The attempt budget cannot bound this on its own: a connection that opens and
 * merely holds refreshes it (STABLE_CONNECTION_MS below), so a proxy that
 * accepts the stream and forwards nothing — a buffering gateway, or a backend
 * whose in-memory trace is gone after a restart — reconnects for as long as
 * MAX_TOTAL_RECONNECTS allows: ~20 minutes in which the reader is never told
 * the live stream is gone. Once an outage has run this long without a single
 * line arriving, the history endpoint takes over.
 */
export const MAX_OUTAGE_MS = 20_000;
/**
 * A connection that stayed up this long counts as having worked even if it
 * carried no line: steps can take 120s, so silence is not failure.
 */
const STABLE_CONNECTION_MS = 5_000;
/**
 * How long a new EventSource has to answer before it is treated as failed.
 *
 * Every GET/POST has an AbortController deadline; EventSource has none and
 * fires no `error` while a request simply hangs. Opening a shared trace link
 * against a sleeping backend (Render free tier, 30-60s cold start) therefore
 * pinned the page on a pulsing "awaiting next step…" forever. A warm backend
 * answers in milliseconds, so 12s is loose enough to never fire on a healthy
 * connection and short enough that a dead one surfaces.
 */
export const STREAM_CONNECT_TIMEOUT_MS = 12_000;
/**
 * Cadence of the history-polling fallback that takes over when SSE cannot be
 * sustained. GET /api/trace/{id} returns exactly what the stream replays, so
 * a user still watches their run finish when the transport will not hold.
 */
export const TRACE_POLL_MS = 4_000;
/**
 * Ceiling on fallback polls (10 minutes at the cadence above), a little past
 * the longest a plan can legitimately run — 6 steps × 120s. Degraded mode is
 * a rescue, not a permanent background loop.
 */
const MAX_TRACE_POLLS = 150;
/** Consecutive poll rejections before the fallback gives up. */
const MAX_POLL_FAILURES = 3;

/**
 * Subscribe to a live SSE trace stream.
 * Returns a disposer. onEvent is called for each trace line; onDone fires on
 * completion; onError fires if the stream drops mid-flight (falls back to
 * onDone when not provided, preserving the old behavior).
 *
 * Transient drops auto-reconnect with a 1s/2s/4s backoff. The budget is per
 * outage, not per stream: any connection that opens and carries a line (or
 * simply holds for a few seconds) refreshes it. A free-form workflow can
 * legitimately stream for ~12 minutes, and a monotonic counter declared such
 * a run dead on its third transport hiccup while it was still executing —
 * and still charging. Once `done` arrives no reconnect is attempted.
 *
 * A connection that never answers within STREAM_CONNECT_TIMEOUT_MS is failed
 * deliberately: EventSource has no deadline of its own, so a hung request
 * (asleep backend, dead proxy) otherwise streamed nothing, forever, while the
 * UI claimed to be live.
 *
 * The backend replays the full trace history to every new subscriber
 * (app/routers/trace.py), so a reconnect re-delivers already-seen lines.
 * onReset fires immediately before each reconnect opens its EventSource and
 * means "the lines you hold are about to be superseded": consumers must
 * REPLACE their buffer with the first line that arrives afterwards, not
 * empty it on the spot. Emptying it eagerly loses the whole rendered run
 * whenever the reconnect then fails — the backend's traces are in-memory
 * only, so a restart answers 404 and nothing re-fetches them.
 *
 * When SSE cannot be sustained at all the stream does not die: it falls back
 * to polling GET /api/trace/{id}, which serves the same history, forwarding
 * only the lines the consumer has not been shown. `opts.onFallback` fires
 * once when that happens so the UI can stop claiming to be live. The
 * fallback is bounded (MAX_TRACE_POLLS) and ends on `onDone` once the task
 * reports a terminal status.
 */
export function openTraceStream(
  taskId: string,
  onEvent: (line: TraceLine) => void,
  onDone?: () => void,
  onError?: () => void,
  onReset?: () => void,
  opts?: { onFallback?: () => void },
): () => void {
  let es: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  // Armed on the first failure of an outage, cleared by a delivered line —
  // bounds how long one outage may retry before the fallback takes over.
  let outageTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0; // consecutive failures since the last working connection
  let reconnects = 0; // lifetime total
  let settled = false; // done received, terminally errored, or disposed
  // How much of the task's history the consumer has been shown, in history
  // positions. Reset in lockstep with onReset, so the polling fallback knows
  // exactly which tail is still unseen.
  let delivered = 0;
  let polling = false;
  let polls = 0;
  let pollFailures = 0;
  let terminalSeen = false;

  // EventSource cannot set headers, so the task read token (when this
  // session holds one) rides along as a query param instead.
  const token = getTaskToken(taskId);
  const query = token ? `?token=${encodeURIComponent(token)}` : "";

  const clearConnectTimer = () => {
    if (connectTimer !== null) clearTimeout(connectTimer);
    connectTimer = null;
  };

  const clearOutageTimer = () => {
    if (outageTimer !== null) clearTimeout(outageTimer);
    outageTimer = null;
  };

  /**
   * Arm the one-outage ceiling on the first failure of an outage. Re-arming is
   * a no-op, so the window measures the whole outage rather than restarting
   * with every reconnect — which is the point: the per-attempt budget is
   * refreshed by a connection that merely holds, this is not.
   */
  const armOutageTimer = () => {
    if (outageTimer !== null) return;
    outageTimer = setTimeout(() => {
      outageTimer = null;
      if (settled || polling) return;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      clearConnectTimer();
      es?.close();
      startPolling();
    }, MAX_OUTAGE_MS);
  };

  const settle = (ok: boolean) => {
    if (settled) return;
    settled = true;
    clearConnectTimer();
    clearOutageTimer();
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
    es?.close();
    if (ok) onDone?.();
    else (onError ?? onDone)?.();
  };

  /**
   * Forwards only the part of the history the consumer has not seen.
   * Returns whether anything new arrived.
   *
   * Rows are screened with the shared `isTraceLine` (lib/guards.ts) — a junk
   * row must not reach the renderer as `undefined.level` — but only skipped,
   * never fatal: `getTrace` already rejects a wholly malformed history, so
   * what survives to here is worth showing.
   */
  const drain = (history: unknown): boolean => {
    const rows = Array.isArray(history) ? (history as unknown[]) : [];
    if (rows.length < delivered) {
      // Shorter than what was already shown: this is a different history
      // (the backend restarted). Supersede it rather than interleave two.
      onReset?.();
      delivered = 0;
    }
    let grew = false;
    for (let i = delivered; i < rows.length; i += 1) {
      const row = rows[i];
      delivered = i + 1;
      if (!isTraceLine(row)) continue;
      onEvent(row);
      grew = true;
    }
    return grew;
  };

  /**
   * The history endpoint cannot say whether the run ended, so the task's own
   * status answers that — asked only on a tick that delivered nothing, so a
   * live run still costs one request per tick, not two.
   */
  const taskFinished = async (): Promise<boolean> => {
    try {
      const task = await get<{ status?: unknown }>(
        `/tasks/${taskId}`,
        undefined,
        taskAuthHeaders(taskId),
      );
      return task?.status === "complete" || task?.status === "failed";
    } catch {
      return false;
    }
  };

  const poll = async (): Promise<void> => {
    if (settled) return;
    polls += 1;
    try {
      const history = await getTrace(taskId);
      if (settled) return;
      pollFailures = 0;
      if (drain(history)) {
        terminalSeen = false;
      } else if (terminalSeen) {
        // Confirmed twice: the trace stopped growing and the task is
        // terminal. A single check could seal the run one line early —
        // the backend finalizes the task before emitting its last line.
        settle(true);
        return;
      } else if (await taskFinished()) {
        terminalSeen = true;
      }
      if (settled) return;
    } catch {
      if (settled) return;
      pollFailures += 1;
      if (pollFailures >= MAX_POLL_FAILURES) {
        settle(false);
        return;
      }
    }
    if (polls >= MAX_TRACE_POLLS) {
      settle(false);
      return;
    }
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void poll();
    }, TRACE_POLL_MS);
  };

  /** SSE is unusable — keep the run visible over the history endpoint. */
  const startPolling = () => {
    if (settled || polling) return;
    polling = true;
    opts?.onFallback?.();
    void poll();
  };

  const connect = () => {
    const source = new EventSource(`${base}/trace/${taskId}/stream${query}`);
    es = source;
    let openedAt: number | null = null;
    let carried = 0;
    let dead = false;

    // `open` is the real signal, but any event proves the connection is
    // live — including the backend's 15s keepalive ping.
    const established = () => {
      if (openedAt !== null) return;
      openedAt = Date.now();
      clearConnectTimer();
    };

    /** This connection is over — reconnect if the budget allows. */
    const failed = () => {
      if (dead) return;
      dead = true;
      clearConnectTimer();
      source.close();
      // `polling` too: once the outage ceiling has handed over to the history
      // endpoint, a late `error` from the abandoned socket must not restart
      // the retry chain behind the fallback.
      if (settled || polling) return;
      // A connection that did its job earns a fresh budget; one that opened
      // and died on the spot does not, or a flapping backend would be
      // reconnected against in a tight loop.
      const worked =
        openedAt !== null &&
        (carried > 0 || Date.now() - openedAt >= STABLE_CONNECTION_MS);
      if (worked) attempts = 0;
      if (attempts < MAX_RECONNECTS && reconnects < MAX_TOTAL_RECONNECTS) {
        armOutageTimer();
        const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
        attempts += 1;
        reconnects += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          onReset?.();
          delivered = 0; // the replacement replays from the top
          connect();
        }, delay);
      } else {
        startPolling();
      }
    };

    // The deadline EventSource does not have: a request that hangs (asleep
    // backend, dead proxy) never fires `error` on its own.
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (settled || openedAt !== null) return;
      failed();
    }, STREAM_CONNECT_TIMEOUT_MS);

    source.addEventListener("open", established);
    source.addEventListener("ping", established);
    source.addEventListener("trace", (e) => {
      established();
      // A line actually arrived, so this is no longer an outage — the ceiling
      // only bounds stretches where the transport delivers nothing.
      clearOutageTimer();
      // Counted whether or not it parses: these are history positions, and
      // the fallback resumes from the position, not from what rendered.
      carried += 1;
      delivered += 1;
      try {
        // Screen the shape before it reaches render state — a well-formed but
        // wrong-shaped object would otherwise flow through unguarded, unlike the
        // polling fallback (drain) which already screens each row.
        const row: unknown = JSON.parse((e as MessageEvent).data);
        if (isTraceLine(row)) onEvent(row);
      } catch {
        /* ignore */
      }
    });
    source.addEventListener("done", () => {
      established();
      settle(true);
    });
    source.addEventListener("error", failed);
  };

  connect();

  return () => {
    settled = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
    clearConnectTimer();
    clearOutageTimer();
    es?.close();
  };
}
