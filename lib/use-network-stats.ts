"use client";
/**
 * Reads the network figures (lib/network-stats.ts) for the console: the
 * Overview page polls `loadNetworkStats`, and the sidebar reads it through
 * `useNetworkStats`.
 *
 * The measured overview answers alone. Against an older backend the three
 * derived reads run instead, and two things keep them affordable inside a
 * 5-second poll:
 *
 *   - each read is shared for `DERIVED_READ_TTL_MS` across every caller, so
 *     the sidebar and the page, and consecutive polls, do not each ask again;
 *   - a read that has not answered within `DERIVED_READ_WAIT_MS` is reported
 *     as pending rather than awaited. The adoption read takes ~40s on a cold
 *     backend; the registry counts must not wait on it, and the request it
 *     started stays shared, so the next poll picks up its answer. *
 * NEVER A MID-REFILL COUNT. After a restart the backend's registry refills
 * from the chain for about 45 s (lib/registry-sync.ts). A read is complete
 * when the overview says `registry_synced: true`; with no flag (a backend
 * from before it) only when the count has held for INTERIM_READ_GAP_MS
 * across reads. Until then the registry's figures are the last complete ones
 * this session read, or gaps saying the registry is syncing, and the
 * surfaces ask again.
 */

import { useEffect } from "react";
import { getNetworkOverview, listAgentsWithSync, listReputation } from "./api";
import { getEcosystemAdoption, type EcosystemAdoption } from "./ecosystem";
import { isOverviewV2 } from "./guards";
import {
  deriveNetworkStats,
  hasPendingReads,
  statsFromOverview,
  withRegistrySync,
  type NetworkStats,
  type Read,
} from "./network-stats";
import {
  INTERIM_READ_GAP_MS,
  InterimCountTracker,
  overviewSyncSignal,
  type SyncSignal,
} from "./registry-sync";
import type {
  Agent,
  LegacyOverview,
  OverviewV2,
  ReputationBatch,
} from "./types";
import { useFetch } from "./use-fetch";

/** How long a derived read's answer is shared before it is asked again. */
export const DERIVED_READ_TTL_MS = 30_000;
/** How long a poll waits on a derived read before calling it pending. */
export const DERIVED_READ_WAIT_MS = 10_000;
/** How soon a surface showing a pending figure asks again. */
export const PENDING_RECHECK_MS = 5_000;

export type NetworkStatsReaders = {
  overview: () => Promise<LegacyOverview | OverviewV2>;
  /** The registry, with its `X-Registry-Synced` signal. */
  agents: () => Promise<{ agents: Agent[]; signal: SyncSignal }>;
  adoption: () => Promise<EcosystemAdoption>;
  reputation: () => Promise<ReputationBatch>;
};

const READERS: NetworkStatsReaders = {
  overview: getNetworkOverview,
  agents: listAgentsWithSync,
  adoption: getEcosystemAdoption,
  reputation: listReputation,
};

type Shared = { promise: Promise<unknown>; settledAt: number | null };
const shared = new Map<string, Shared>();

/** The last figures read from a registry known to be complete, kept for
 * this session (the module lives as long as the tab). */
let lastComplete: NetworkStats | null = null;
/** The interim rule over the overview's snapshots, and over registry reads,
 * for a backend that sends no sync signal. */
const overviewCounts = new InterimCountTracker();
const registryCounts = new InterimCountTracker();
/** Whether the last registry read was known complete. Until it is, the
 * registry is read again every INTERIM_READ_GAP_MS rather than shared for
 * the full DERIVED_READ_TTL_MS, so the interim rule can confirm it sooner. */
let registryConfirmed = false;

/** Drops every shared read and the session's sync memory — for tests. */
export function clearNetworkStatsCache(): void {
  shared.clear();
  lastComplete = null;
  overviewCounts.reset();
  registryCounts.reset();
  registryConfirmed = false;
}

/** Holds a read's registry figures until the registry is known complete,
 * and remembers them once it is. */
function settled(stats: NetworkStats, complete: boolean): NetworkStats {
  const out = withRegistrySync(stats, complete, lastComplete);
  if (complete) lastComplete = out;
  return out;
}

/** Whether this overview counted a complete registry: its flag, or, with
 * none, the same count across snapshots the gap apart. The snapshot's own
 * `generated_at` dates it, so one cached snapshot read twice is not two. */
function overviewComplete(o: OverviewV2): boolean {
  const signal = overviewSyncSignal(o);
  if (signal !== "unknown") return signal === "synced";
  return overviewCounts.observe({
    count: o.agents.registered,
    at: o.generated_at * 1000,
  });
}

/** One in-flight or recent read per key, shared for `ttlMs`. A rejection is
 * dropped at once, so the next poll asks again instead of replaying a
 * failure. */
function sharedRead<T>(
  key: string,
  read: () => Promise<T>,
  ttlMs: number = DERIVED_READ_TTL_MS,
): Promise<T> {
  const hit = shared.get(key);
  if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < ttlMs)) {
    return hit.promise as Promise<T>;
  }
  const entry: Shared = { promise: read(), settledAt: null };
  shared.set(key, entry);
  entry.promise.then(
    () => {
      entry.settledAt = Date.now();
    },
    () => {
      if (shared.get(key) === entry) shared.delete(key);
    },
  );
  return entry.promise as Promise<T>;
}

const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e ?? "read failed");

/** A read's outcome within `waitMs`: its answer, its failure, or pending. */
async function settle<T>(
  promise: Promise<T>,
  waitMs: number,
): Promise<Read<T> & { cause?: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Promise<"pending">((resolve) => {
    timer = setTimeout(() => resolve("pending"), waitMs);
  });
  try {
    const out = await Promise.race([
      promise.then((value) => ({ value })),
      pending,
    ]);
    return out === "pending"
      ? { ok: false, error: "still reading", pending: true }
      : { ok: true, value: out.value };
  } catch (cause) {
    return { ok: false, error: message(cause), cause };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The network figures, from whichever source this backend supports.
 *
 * Rejects only when nothing headline could be read — the overview failed
 * and neither the registry nor the adoption read answered — so the page
 * shows its error state. It rejects with the overview's own error, which
 * keeps `isTransientFetchError` able to tell an outage from a 404.
 */
export async function loadNetworkStats(
  readers: NetworkStatsReaders = READERS,
  waitMs: number = DERIVED_READ_WAIT_MS,
): Promise<NetworkStats> {
  let overviewError: unknown = null;
  try {
    const overview = await readers.overview();
    if (isOverviewV2(overview)) {
      return settled(statsFromOverview(overview), overviewComplete(overview));
    }
  } catch (e) {
    overviewError = e;
  }

  // Dated when the read was made, not when a poll picked up its shared
  // answer, so the interim rule never mistakes one read for two.
  const [dated, adoption, reputation] = await Promise.all([
    settle(
      sharedRead(
        "agents",
        async () => {
          const at = Date.now();
          return { ...(await readers.agents()), at };
        },
        registryConfirmed ? DERIVED_READ_TTL_MS : INTERIM_READ_GAP_MS,
      ),
      waitMs,
    ),
    settle(sharedRead("adoption", readers.adoption), waitMs),
    settle(sharedRead("reputation", readers.reputation), waitMs),
  ]);
  const agents: Read<Agent[]> & { cause?: unknown } = dated.ok
    ? { ok: true, value: dated.value.agents }
    : dated;
  const failed = (r: { ok: boolean; pending?: boolean }) => !r.ok && !r.pending;
  if (failed(agents) && failed(adoption)) {
    throw (
      overviewError ?? agents.cause ?? new Error("network figures unavailable")
    );
  }
  const stats = deriveNetworkStats({ agents, adoption, reputation });
  // No registry read, no registry figure to hold: those are gaps already.
  if (!dated.ok) return stats;
  const { agents: list, signal, at } = dated.value;
  registryConfirmed =
    signal === "unknown"
      ? registryCounts.observe({ count: list.length, at })
      : signal === "synced";
  return settled(stats, registryConfirmed);
}

/**
 * The figures for a surface that reads once and revalidates on focus — the
 * sidebar. A figure still pending is asked for again shortly, so the
 * sidebar does not sit on "still reading" until the tab is refocused.
 */
export function useNetworkStats(readers?: NetworkStatsReaders) {
  const result = useFetch(() => loadNetworkStats(readers), [], {
    revalidateOnFocus: true,
  });
  const { data, reload } = result;
  useEffect(() => {
    if (!data || !hasPendingReads(data)) return;
    const t = setTimeout(reload, PENDING_RECHECK_MS);
    return () => clearTimeout(t);
  }, [data, reload]);
  return result;
}
