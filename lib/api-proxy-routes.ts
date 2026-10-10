/**
 * The backend reads the console caches (lib/api-proxy.ts), one per route
 * handler under app/api/. Each is the read every visitor shares and nobody
 * owns: what the network looks like, not anything about the person asking.
 * Per-user and per-task reads, and every POST, stay uncached: on the plain
 * rewrite in next.config.mjs, or on a BotID-guarded handler that forwards
 * them unchanged (lib/botid-proxy.ts).
 *
 * Every shape check is the guard the browser already applies (lib/guards.ts,
 * lib/ecosystem.ts), so a body the console would reject never becomes the
 * copy that replaces a good one.
 */

import { resolveApiBase } from "./api-base.mjs";
import {
  CachedRead,
  platformBackground,
  type CachedReadConfig,
} from "./api-proxy";
import { isEcosystemAdoption } from "./ecosystem";
import { cachedReadHeaders } from "./proxy-identity";
import {
  isLegacyOverview,
  isOverviewV2,
  isReputationParams,
  isStellarNetworkInfo,
  screenAgentList,
  screenReputationBatch,
} from "./guards";
import {
  REGISTRY_SYNCED_HEADER,
  headerSyncSignal,
  overviewSyncSignal,
} from "./registry-sync";

/** How long a request with nothing to serve waits before saying "waking". */
const COLD_WAIT_MS = 10_000;
/** How long a request holding a stale copy waits for a fresh one. Above the
 * warm backend's slowest shared read (~2.9 s, the reputation batch). */
const STALE_WAIT_MS = 4_000;
/** One backend read's bound: a cold start is about a minute, and the route
 * functions run for at most 60 s (`maxDuration` in each route file). */
const UPSTREAM_TIMEOUT_MS = 55_000;

const SHARED = {
  coldWaitMs: COLD_WAIT_MS,
  staleWaitMs: STALE_WAIT_MS,
  upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
} as const;

export const OVERVIEW: CachedReadConfig = {
  ...SHARED,
  path: "/metrics/overview",
  freshMs: 15_000,
  accept: (v) => isOverviewV2(v) || isLegacyOverview(v),
  // The overview counted a registry still refilling.
  partial: (v) => isOverviewV2(v) && overviewSyncSignal(v) === "syncing",
};

export const AGENTS: CachedReadConfig = {
  ...SHARED,
  path: "/agents",
  freshMs: 15_000,
  accept: (v) => screenAgentList(v) !== null,
  partial: (_, headers) => headerSyncSignal(headers) === "syncing",
  passHeaders: [REGISTRY_SYNCED_HEADER, "X-Registry-Count"],
};

export const REPUTATION: CachedReadConfig = {
  ...SHARED,
  path: "/stellar/reputation",
  freshMs: 15_000,
  accept: (v) => screenReputationBatch(v) !== null,
};

/** Contract parameters: they change only when the ledger is redeployed. */
export const REPUTATION_PARAMS: CachedReadConfig = {
  ...SHARED,
  path: "/stellar/reputation/params",
  freshMs: 300_000,
  accept: isReputationParams,
};

/** Network and contract ids: fixed for a deployment. */
export const NETWORK: CachedReadConfig = {
  ...SHARED,
  path: "/stellar/network",
  freshMs: 300_000,
  accept: isStellarNetworkInfo,
};

/** The adoption read takes minutes on the backend (QA defect D-091); its
 * figures move when an operator registers or a workflow settles. */
export const ADOPTION: CachedReadConfig = {
  ...SHARED,
  path: "/ecosystem/adoption",
  freshMs: 120_000,
  accept: isEcosystemAdoption,
};

/** A cached read against the configured backend, through the global fetch. */
export function backendRead(config: CachedReadConfig): CachedRead {
  return new CachedRead(config, {
    fetch: (input, init) => fetch(input, init),
    base: resolveApiBase(process.env),
    now: Date.now,
    background: platformBackground,
    // The proxy token alone: one cached read serves every visitor, so it
    // acts for nobody in particular (lib/proxy-identity.ts).
    headers: () => cachedReadHeaders(),
  });
}
