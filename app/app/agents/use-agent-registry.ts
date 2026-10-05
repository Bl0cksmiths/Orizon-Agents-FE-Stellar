"use client";
/**
 * The agent registry for the Agents page, first page first.
 *
 * The registry is ~590 agents and ~240 KB. The page asks for a small first
 * page (`listAgentsPage`) so the table can paint from a few KB, then for the
 * whole list, which search, the filters and the routable check need. The
 * request for the rest waits for the first page's answer — on purpose, so the
 * two never compete for a phone's bandwidth.
 *
 * Feature-detected: a server that ignores `?limit=` (a backend proxied
 * straight through, the test fixtures) answers with the whole list, which is
 * then all there is to read — one request, as before.
 *
 * Never a partial registry count (lib/registry-sync.ts): `total` is the
 * registry's size only when the answer says the registry is synced; while it
 * refills, or with no signal, it is null and the page states no count.
 */

import {
  isWakingError,
  listAgentsPage,
  listAgentsWithSync,
  readAtOf,
} from "@/lib/api";
import type { SyncSignal } from "@/lib/registry-sync";
import type { Agent } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";

/** Rows in the first page, and in each step of the table's window. */
export const REGISTRY_PAGE_SIZE = 50;

export type AgentRegistry = {
  /** The whole registry once it is in, the first page until then. */
  agents: Agent[] | null;
  /** `agents` is the whole registry. */
  complete: boolean;
  /** The registry's size, only when the registry says it is synced. */
  total: number | null;
  /** A failure worth showing — a backend still waking is not one. */
  error: string | null;
  loading: boolean;
  retrying: boolean;
  /** Nothing on screen yet, and still trying. */
  waiting: boolean;
  /** When the registry on screen arrived, and when the backend was read for
   * it (they differ for a copy from the console's cache). */
  lastSuccessAt: number | null;
  dataAt: number | null;
  reload: () => void;
};

export function useAgentRegistry(opts: {
  staleAfterMs: number;
}): AgentRegistry {
  const first = useFetch(
    (signal) => listAgentsPage({ limit: REGISTRY_PAGE_SIZE }, signal),
    [],
    // Kept fresh on focus like the whole list: it is a few KB, and against
    // a server that does not page it IS the whole list.
    { revalidateOnFocus: true, staleAfterMs: opts.staleAfterMs },
  );
  const more =
    first.data !== null && first.data.paged && first.data.nextCursor !== null;
  const rest = useFetch((signal) => listAgentsWithSync(signal), [], {
    enabled: more,
    revalidateOnFocus: true,
    staleAfterMs: opts.staleAfterMs,
  });

  // Whichever read now answers for the registry.
  const primary = more ? rest : first;
  const agents = rest.data?.agents ?? first.data?.agents ?? null;
  const complete = more ? rest.data !== null : first.data !== null;
  const signal: SyncSignal | null =
    rest.data?.signal ?? first.data?.signal ?? null;
  const total =
    signal === "synced"
      ? complete && agents
        ? agents.length
        : (first.data?.total ?? null)
      : null;

  const failure = (e: string | null) => (e && !isWakingError(e) ? e : null);
  // The first page failing leaves nothing; the rest failing leaves the first
  // page, and says the rest did not come.
  const error = failure(first.error) ?? (more ? failure(rest.error) : null);

  return {
    agents,
    complete,
    total,
    error,
    loading: first.loading || rest.loading,
    retrying: primary.retrying || first.retrying,
    waiting: first.waiting,
    lastSuccessAt: primary.lastSuccessAt ?? first.lastSuccessAt,
    dataAt: (agents && readAtOf(agents)) ?? primary.lastSuccessAt,
    reload: () => {
      if (more) rest.reload();
      else first.reload();
    },
  };
}
