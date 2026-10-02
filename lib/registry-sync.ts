/**
 * Whether the backend's agent registry is complete: the one question that
 * decides if a registry count may be published as final.
 *
 * The backend runs on Render's free plan, which sleeps and restarts it. After
 * a restart its in-memory registry refills from the chain over about 45 s
 * (226 → 266 → 278 agents on 2026-10-02), and a count read in that window is
 * partial. Published as final it is simply wrong: the hero showed "31
 * registered agents" against a registry of 278.
 *
 * A read is complete only when the backend says so:
 *   - the measured overview's `registry_synced: true`, or
 *   - `X-Registry-Synced: true` on GET /api/agents.
 * `false` from either is partial, whatever the count.
 *
 * THE INTERIM RULE, for a backend that sends neither signal (every backend
 * deployed before the signals shipped): two reads of the count at least
 * `INTERIM_READ_GAP_MS` apart must agree. A count that grew between them is
 * still refilling; one that shrank restarted in between. It is a heuristic,
 * not a guarantee: a refill that pauses for longer than the gap passes it.
 * It is used ONLY when no signal exists, and goes once every deployed
 * backend sends one.
 */

/** What the backend said about its registry: complete, refilling, or
 * nothing at all (a backend from before the signals). */
export type SyncSignal = "synced" | "syncing" | "unknown";

/** Sent on GET /api/agents; the body is unchanged. Header names are
 * case-insensitive, so `Headers.get` finds either spelling. */
export const REGISTRY_SYNCED_HEADER = "X-Registry-Synced";

/** How far apart the interim rule's two reads must be. */
export const INTERIM_READ_GAP_MS = 10_000;

/** The measured overview's flag. Absent on a backend from before it. */
export function overviewSyncSignal(o: {
  registry_synced?: boolean;
}): SyncSignal {
  if (o.registry_synced === true) return "synced";
  if (o.registry_synced === false) return "syncing";
  return "unknown";
}

/** `X-Registry-Synced`: "true" or "false"; anything else says nothing. */
export function headerSyncSignal(headers: Headers): SyncSignal {
  const v = headers.get(REGISTRY_SYNCED_HEADER)?.trim().toLowerCase();
  if (v === "true") return "synced";
  if (v === "false") return "syncing";
  return "unknown";
}

/** One read of the registry count, and when it was taken (ms). */
export type CountSample = { count: number; at: number };

/**
 * The interim rule: `second` confirms `first` when it was read at least
 * `INTERIM_READ_GAP_MS` later and reports the same count. A larger count is
 * a registry still refilling; a smaller one, a backend that restarted
 * between the reads. Neither is complete.
 */
export function interimAgrees(
  first: CountSample,
  second: CountSample,
): boolean {
  return (
    second.at - first.at >= INTERIM_READ_GAP_MS && second.count === first.count
  );
}

/**
 * The interim rule over a stream of reads, for a surface that polls (the
 * console): the count is confirmed once it has held for
 * `INTERIM_READ_GAP_MS`. Any change starts a new run, and a sample older
 * than the run it would extend never confirms it.
 */
export class InterimCountTracker {
  private run: CountSample | null = null;

  observe(sample: CountSample): boolean {
    const run = this.run;
    if (!run || run.count !== sample.count) {
      this.run = sample;
      return false;
    }
    return interimAgrees(run, sample);
  }

  reset(): void {
    this.run = null;
  }
}
