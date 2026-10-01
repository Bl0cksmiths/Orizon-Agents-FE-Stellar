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
 *     started stays shared, so the next poll picks up its answer.
 */

import { useEffect } from "react";
import { getNetworkOverview, listAgents, listReputation } from "./api";
import { getEcosystemAdoption, type EcosystemAdoption } from "./ecosystem";
import { isOverviewV2 } from "./guards";
import {
  deriveNetworkStats,
  hasPendingReads,
  statsFromOverview,
  type NetworkStats,
  type Read,
} from "./network-stats";
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
  agents: () => Promise<Agent[]>;
  adoption: () => Promise<EcosystemAdoption>;
  reputation: () => Promise<ReputationBatch>;
};

const READERS: NetworkStatsReaders = {
  overview: getNetworkOverview,
  agents: listAgents,
  adoption: getEcosystemAdoption,
  reputation: listReputation,
};

type Shared = { promise: Promise<unknown>; settledAt: number | null };
const shared = new Map<string, Shared>();

/** Drops every shared read — exposed for tests. */
export function clearNetworkStatsCache(): void {
  shared.clear();
}

/** One in-flight or recent read per key. A rejection is dropped at once, so
 * the next poll asks again instead of replaying a failure. */
function sharedRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const hit = shared.get(key);
  if (
    hit &&
    (hit.settledAt === null || Date.now() - hit.settledAt < DERIVED_READ_TTL_MS)
  ) {
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
    if (isOverviewV2(overview)) return statsFromOverview(overview);
  } catch (e) {
    overviewError = e;
  }

  const [agents, adoption, reputation] = await Promise.all([
    settle(sharedRead("agents", readers.agents), waitMs),
    settle(sharedRead("adoption", readers.adoption), waitMs),
    settle(sharedRead("reputation", readers.reputation), waitMs),
  ]);
  const failed = (r: { ok: boolean; pending?: boolean }) => !r.ok && !r.pending;
  if (failed(agents) && failed(adoption)) {
    throw (
      overviewError ?? agents.cause ?? new Error("network figures unavailable")
    );
  }
  return deriveNetworkStats({ agents, adoption, reputation });
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
