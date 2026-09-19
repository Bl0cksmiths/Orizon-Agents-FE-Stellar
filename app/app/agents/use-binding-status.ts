"use client";
/**
 * Endpoint-binding status for the agents the connected wallet owns (story 2.05).
 *
 * The marketplace lists every agent, but only a handful of rows can ever be
 * unbound, and asking the registry about the rest would be both wrong and
 * expensive. This hook is the bound on that cost, and every bound below is
 * deliberate:
 *
 *   1. It asks ONLY about agents that pass `isOwnedBy` AND `needsBinding` —
 *      never the seeded catalog (no owner, no endpoint, "unbound" is its normal
 *      state) and never someone else's agent, whose endpoint is none of this
 *      operator's business and whose row carries no action anyway.
 *   2. It caps the set at `MAX_CHECKED`, matching the cap the bind page already
 *      applies to its owned-agent shortcuts, so an operator with fifty agents
 *      cannot turn one page view into fifty requests.
 *   3. It fetches once per mount, and again only when the *set of ids* actually
 *      changes (the wallet connects, the registry list resolves). The agents
 *      list revalidates on focus and hands back a fresh array every time, so
 *      the dependency is the joined id string, not the array identity.
 *
 * The reason for the care: this is one HTTP request per owned agent against a
 * rate limit that is currently a single bucket for the whole service, and the
 * config comments plan to lower it. There is deliberately no
 * `revalidateOnFocus` here — binding state changes only when this operator
 * binds, and the bind page is where that happens.
 *
 * Each agent is settled independently, so one failing lookup leaves the other
 * rows correct instead of blanking them all. That also means the promise this
 * hook hands `useFetch` never rejects: the automatic backoff never runs, a 404
 * is treated as data exactly as `getAgentBindingOrNull` intends, and recovery
 * is the explicit `recheck` an errored row offers.
 */

import { useCallback, useMemo } from "react";
import { getAgentBindingOrNull } from "@/lib/api";
import { isOwnedBy, needsBinding } from "@/lib/binding-status";
import { useFetch } from "@/lib/use-fetch";
import type { Agent } from "@/lib/types";

/**
 * What we know about one agent's endpoint.
 *
 * `checking` and `error` exist as distinct states because neither may ever be
 * rendered as "unbound": saying an operator's live agent cannot be selected for
 * work, when we simply have not heard back yet, is a false accusation about
 * their production service.
 */
export type BindingState = "checking" | "bound" | "unbound" | "error";

/** Owned agents asked about per page view. Matches the bind page's own cap on
 *  the owned-agent shortcut list, so both surfaces stop counting at the same
 *  place rather than disagreeing about how many agents an operator "has". */
const MAX_CHECKED = 8;

type Resolved = Record<string, Exclude<BindingState, "checking">>;

async function resolveAll(ids: string[]): Promise<Resolved> {
  const settled = await Promise.allSettled(
    ids.map((id) => getAgentBindingOrNull(id)),
  );
  const out: Resolved = {};
  ids.forEach((id, i) => {
    const result = settled[i];
    // A rejection here is a real failure, not "never bound":
    // `getAgentBindingOrNull` already folded the `binding_not_found` 404 into a
    // null, and still rejects the `agent_not_found` one — which must not read
    // as a healthy unbound agent.
    out[id] =
      result.status === "rejected"
        ? "error"
        : result.value === null
          ? "unbound"
          : "bound";
  });
  return out;
}

export type BindingStatus = {
  /**
   * The binding state of an agent, or null when this agent is not one we ask
   * about — a seeded catalog agent, another wallet's agent, or one past the
   * cap. Null means "no claim", and a row must render no binding marker at all.
   */
  stateOf: (agentId: string) => BindingState | null;
  /** Re-run the lookup for every checked agent; offered on a failed row. */
  recheck: () => void;
  /** True while a lookup is in flight. The recheck control disables on it: one
   *  click already costs a request per owned agent, and an impatient second
   *  one against a single rate-limit bucket is exactly what we cannot afford. */
  rechecking: boolean;
};

export function useBindingStatus(
  agents: Agent[] | null,
  address: string | null,
): BindingStatus {
  // `isOwnedBy` narrows to this operator's agents; `needsBinding` is what keeps
  // the twelve seeded catalog rows out. The second test is implied by the first
  // today — both read `owner` — but it is the predicate of record for "can this
  // agent be unbound at all", and stating it here is what stops a future
  // ownership change from quietly enrolling the catalog.
  const ids = useMemo(
    () =>
      (agents ?? [])
        .filter((a) => isOwnedBy(a, address) && needsBinding(a))
        .map((a) => a.id)
        .slice(0, MAX_CHECKED),
    [agents, address],
  );
  // Joined on a character an agent id cannot contain (ids are letters, digits
  // and underscore), so two different sets can never collide into the same
  // dependency.
  const key = ids.join("|");
  const checked = useMemo(() => new Set(ids), [ids]);

  const { data, loading, reload } = useFetch<Resolved>(
    () => resolveAll(ids),
    [key],
  );

  const stateOf = useCallback(
    (agentId: string): BindingState | null => {
      if (!checked.has(agentId)) return null;
      // No entry yet = still in flight. Never "unbound".
      return data?.[agentId] ?? "checking";
    },
    [checked, data],
  );

  return { stateOf, recheck: reload, rechecking: loading };
}
