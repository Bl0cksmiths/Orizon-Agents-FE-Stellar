/**
 * The home page's network figures, read on the server: registered agents,
 * external agents and operator wallets — all three, complete, or none.
 *
 * The hero is static marketing, regenerated at most every
 * `PUBLIC_STATS_REVALIDATE_S` seconds (ISR). It reads the backend directly at
 * the origin the `/api` rewrite targets (`resolveApiBase`), since a server
 * render has no page origin for a relative URL. Every read is `no-store`:
 * the page itself is the cache, and a read served from Next's data cache
 * would let the interim rule below compare a response with itself.
 *
 * NEVER A PARTIAL COUNT. After a restart the backend's registry refills from
 * the chain over about 45 s, and a count read in that window is partial (the
 * hero published "31 registered agents" against 278 on 2026-10-02). A read is
 * accepted only when it is known to be complete (lib/registry-sync.ts):
 *   1. the measured overview says `registry_synced: true` — its figures are
 *      used as sent; `false` is partial;
 *   2. otherwise the registry is read: `X-Registry-Synced` on GET /api/agents
 *      decides it, and without that header two reads `INTERIM_READ_GAP_MS`
 *      apart must agree (the interim rule, for a backend with no signal);
 *   3. with the registry confirmed, external agents and operator wallets come
 *      from the overview when its snapshot counted that same registry; on a
 *      backend whose overview has no owner figures, from the adoption read
 *      if it answers within `ADOPTION_BUDGET_MS` (it takes 13 s to minutes);
 *      else from the registry's owners by the adoption rule
 *      (lib/external-owners.ts).
 * Anything short of all three figures is not a result.
 *
 * What the page does with "not a result" depends on when it renders
 * (`getHeroStats`): a regeneration THROWS, so Next keeps serving the last
 * page it generated and the hero keeps its last complete figures; a build,
 * which has no last page, retries for `BUILD_RETRY_BUDGET_MS` and then
 * renders the hero without its stat row.
 */

import { resolveApiBase } from "./api-base.mjs";
import { isEcosystemAdoption } from "./ecosystem";
import { deriveExternalOwners, ourKeys } from "./external-owners";
import { droppedCount, isOverviewV2, screenAgentList } from "./guards";
import { cachedReadHeaders, proxyToken } from "./proxy-identity";
import {
  INTERIM_READ_GAP_MS,
  headerSyncSignal,
  interimAgrees,
  overviewSyncSignal,
  type CountSample,
} from "./registry-sync";
import type { Agent, OverviewV2 } from "./types";

/** How long a rendered hero may be served before it is regenerated. */
export const PUBLIC_STATS_REVALIDATE_S = 300;
/** Per-read deadline. Long enough for a warm backend under load; a cold one
 * takes 30–60 s to wake, which the build's retries absorb. */
export const PUBLIC_STATS_READ_TIMEOUT_MS = 15_000;
/** How long the adoption read may take before the derivation is used. */
export const ADOPTION_BUDGET_MS = 12_000;
/** How long a build waits for a complete registry before it renders the hero
 * without its figures. A cold Render backend takes 30–60 s to wake and about
 * 45 s more to refill. */
export const BUILD_RETRY_BUDGET_MS = 120_000;
/** The build's first pause between attempts; it doubles up to the cap. */
export const BUILD_RETRY_FIRST_DELAY_MS = 2_000;
export const BUILD_RETRY_MAX_DELAY_MS = 20_000;

/** The hero's three figures. Never one without the others. */
export type PublicNetworkStats = {
  registered: number;
  external: number;
  operatorWallets: number;
};

/** One attempt's outcome: three complete figures, or why not. */
export type StatsAttempt =
  | { ok: true; stats: PublicNetworkStats; via: string }
  | { ok: false; reason: string };

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type StatsDeps = {
  env: Env;
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** No read may run past this (epoch ms). */
  deadline?: number;
};

export const defaultDeps = (): StatsDeps => ({
  env: process.env,
  fetch: (url, init) => fetch(url, init),
  now: Date.now,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});

/** Thrown by a regeneration that could not read complete figures, so Next
 * keeps serving the page it generated last. */
export class IncompleteStatsError extends Error {
  constructor(reason: string) {
    super(`hero stats incomplete, keeping the last page: ${reason}`);
    this.name = "IncompleteStatsError";
  }
}

type Read = (
  path: string,
  timeoutMs?: number,
) => Promise<{ body: unknown; headers: Headers; at: number }>;

function reader(deps: StatsDeps, base: string): Read {
  // The hero's reads act for no visitor: they send the frontend's proxy token
  // alone (lib/proxy-identity.ts), and nothing when none is configured.
  const headers = {
    accept: "application/json",
    ...cachedReadHeaders(proxyToken(deps.env)),
  };
  return async (path, timeoutMs = PUBLIC_STATS_READ_TIMEOUT_MS) => {
    const at = deps.now();
    const left = deps.deadline === undefined ? timeoutMs : deps.deadline - at;
    if (left <= 0) throw new Error(`${path}: out of time`);
    const res = await deps.fetch(`${base}${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(timeoutMs, left)),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return { body: (await res.json()) as unknown, headers: res.headers, at };
  };
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
const partial = (reason: string): StatsAttempt => ({ ok: false, reason });
const syncing = (count: number) =>
  `the backend reports its registry still syncing (${count} so far)`;

/** The overview's figures, when it has all three. */
function fromOverview(o: OverviewV2, via: string): StatsAttempt {
  const { registered, external } = o.agents;
  const wallets = o.operators.external_wallets;
  if (external === null || wallets === null) {
    return partial("the overview could not read agent owners");
  }
  return {
    ok: true,
    stats: { registered, external, operatorWallets: wallets },
    via,
  };
}

type Registry = { agents: Agent[]; count: number; via: string };

/** The registry, confirmed complete by its header or the interim rule; a
 * string says why it is not. */
async function confirmedRegistry(
  deps: StatsDeps,
  api: Read,
): Promise<Registry | string> {
  const once = async () => {
    const got = await api("/agents");
    const agents = screenAgentList(got.body);
    if (agents === null) throw new Error("/agents: malformed");
    const sample = { count: agents.length + droppedCount(agents), at: got.at };
    return { agents, sample, signal: headerSyncSignal(got.headers) };
  };

  const first = await once();
  if (first.signal === "synced") {
    return { agents: first.agents, count: first.sample.count, via: "header" };
  }
  if (first.signal === "syncing") return syncing(first.sample.count);

  // No signal: the interim rule. The registry must hold still for the gap.
  if (
    deps.deadline !== undefined &&
    deps.now() + INTERIM_READ_GAP_MS > deps.deadline
  ) {
    return "no time left for a second registry read";
  }
  await deps.sleep(INTERIM_READ_GAP_MS);
  const second = await once();
  if (second.signal === "syncing") return syncing(second.sample.count);
  const a: CountSample = first.sample;
  const b: CountSample = second.sample;
  if (second.signal === "unknown" && !interimAgrees(a, b)) {
    return `the registry count moved from ${a.count} to ${b.count} between reads`;
  }
  return {
    agents: second.agents,
    count: b.count,
    via: second.signal === "synced" ? "header" : "two agreeing reads",
  };
}

/** The adoption read's totals, if it answers in time with nothing unread. */
async function quickAdoption(api: Read) {
  try {
    const { body } = await api("/ecosystem/adoption", ADOPTION_BUDGET_MS);
    if (!isEcosystemAdoption(body) || body.degraded === true) return null;
    if ((body.unreadable_agents?.length ?? 0) > 0) return null;
    return body.totals;
  } catch {
    return null;
  }
}

/** External agents and wallets from the registry's owners, or why not. */
async function fromOwners(
  api: Read,
  root: Read,
  registry: Registry,
): Promise<StatsAttempt> {
  const [network, readiness] = await Promise.all([
    api("/stellar/network").then(
      (r) => r.body,
      () => null,
    ),
    root("/readiness").then(
      (r) => r.body,
      () => null,
    ),
  ]);
  const ours = ourKeys(network, readiness);
  if (!ours) return partial("couldn't read the platform's own keys");
  const owners = deriveExternalOwners(registry.agents, ours);
  if (owners.unowned > 0) {
    return partial(`${owners.unowned} on-chain agents have no known owner`);
  }
  return {
    ok: true,
    stats: {
      registered: registry.count,
      external: owners.external,
      operatorWallets: owners.operatorWallets,
    },
    via: `registry owners, ${registry.via}`,
  };
}

/**
 * One attempt at the three figures. Never throws: whatever went wrong is the
 * `reason` of a not-ok result.
 */
export async function readCompleteStats(
  deps: StatsDeps,
): Promise<StatsAttempt> {
  let base: string;
  try {
    base = resolveApiBase(deps.env);
  } catch (e) {
    return partial(why(e));
  }
  const api = reader(deps, `${base}/api`);
  const root = reader(deps, base);

  let overview: OverviewV2 | null = null;
  try {
    const { body } = await api("/metrics/overview");
    if (isOverviewV2(body)) overview = body;
  } catch {
    // An unreachable or legacy overview: the registry decides below.
  }
  if (overview) {
    const signal = overviewSyncSignal(overview);
    if (signal === "synced") return fromOverview(overview, "overview flag");
    if (signal === "syncing")
      return partial(syncing(overview.agents.registered));
  }
  const ownersFromOverview =
    overview !== null &&
    overview.agents.external !== null &&
    overview.operators.external_wallets !== null;

  // The adoption read is costly (a settlement scan per external agent), so it
  // is asked only of a backend whose overview cannot answer, and started now
  // so it runs during the interim rule's wait.
  const adoption = ownersFromOverview ? null : quickAdoption(api);
  let registry: Registry | string;
  try {
    registry = await confirmedRegistry(deps, api);
  } catch (e) {
    registry = why(e);
  }
  if (typeof registry === "string") return partial(registry);

  // The overview counted this same registry: its owner figures stand.
  if (overview && overview.agents.registered === registry.count) {
    const fromIt = fromOverview(overview, `overview, ${registry.via}`);
    if (fromIt.ok) return fromIt;
  }

  const totals = adoption ? await adoption : null;
  if (totals) {
    return {
      ok: true,
      stats: {
        registered: registry.count,
        external: totals.external_agents,
        operatorWallets: totals.unique_operator_wallets,
      },
      via: `adoption read, ${registry.via}`,
    };
  }
  return fromOwners(api, root, registry);
}

/** When the page is rendering: a build has no previous page to fall back on;
 * a regeneration does; development renders every request afresh. */
export type RenderPhase = "build" | "regenerate" | "dev";

export function renderPhase(env: Env): RenderPhase {
  // Set by `next build` for every page it prerenders (next/constants
  // PHASE_PRODUCTION_BUILD).
  if (env.NEXT_PHASE === "phase-production-build") return "build";
  if (env.NODE_ENV === "development") return "dev";
  return "regenerate";
}

/**
 * Attempts until one is complete or `budgetMs` has passed, backing off
 * between attempts. Null when the budget ran out: the build renders the hero
 * without its figures rather than fail or publish a partial one.
 */
export async function readWithRetry(
  deps: StatsDeps,
  budgetMs: number = BUILD_RETRY_BUDGET_MS,
): Promise<PublicNetworkStats | null> {
  const deadline = deps.now() + budgetMs;
  const bounded = { ...deps, deadline };
  let delay = BUILD_RETRY_FIRST_DELAY_MS;
  let last = "no attempt";
  for (;;) {
    const attempt = await readCompleteStats(bounded);
    if (attempt.ok) return attempt.stats;
    last = attempt.reason;
    const left = deadline - deps.now();
    if (left <= 0) break;
    await deps.sleep(Math.min(delay, left));
    delay = Math.min(delay * 2, BUILD_RETRY_MAX_DELAY_MS);
  }
  console.warn(
    `[hero] no complete network figures after ${Math.round(budgetMs / 1000)}s (${last}); rendering the hero without its stat row`,
  );
  return null;
}

/**
 * The hero's figures for this render. Complete, or:
 *   - build: null after retrying (no stat row; the first regeneration that
 *     reads complete figures adds it);
 *   - regeneration: throws `IncompleteStatsError`, and Next keeps the last
 *     page — the figures on it were complete when they were read;
 *   - development: null.
 */
export async function getHeroStats(
  deps: StatsDeps = defaultDeps(),
): Promise<PublicNetworkStats | null> {
  const phase = renderPhase(deps.env);
  if (phase === "build") return readWithRetry(deps);
  const attempt = await readCompleteStats(deps);
  if (attempt.ok) return attempt.stats;
  if (phase === "regenerate") throw new IncompleteStatsError(attempt.reason);
  return null;
}
