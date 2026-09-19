/**
 * Whether the orchestrator will consider an agent at all, stated once for
 * every surface that answers "can this agent be picked?".
 *
 * Three places ask: the marketplace's "routable" filter, the operator's
 * routing standing, and the operator dashboard's "eligible" count. Each used
 * to apply the endpoint and floor gates and nothing else, so an agent its own
 * operator had delisted — bound, above the floor — read as routable in all
 * three while the backend refused to route to it. The listing rule lives here
 * so the three cannot drift apart again, and so it can be read side by side
 * with the backend rule it copies.
 */

import type { Agent } from "./types";

/**
 * Is this agent listed — still offered to the orchestrator by its operator?
 *
 * Mirrors the backend's `_is_listed` (`app/services/orchestrator_svc.py` in
 * orizon-agents-BE-Stellar) exactly, and has to keep doing so: the
 * orchestrator routes only listed agents, on every path — the planner's
 * candidate list, the floor-substitution pool and the curated kit pipeline.
 *
 * `AgentRegistry.set_active(id, false)` is the on-chain delisting control,
 * and `registry_sync` maps it to `status === "offline"`, the only producer of
 * that value. So the rule is deliberately NEGATIVE: offline is withdrawn and
 * anything else is listed. It is emphatically not `status === "online"`. An
 * "idle" agent means "nothing in flight right now", not "withdrawn" — the
 * seeded catalog ships two of them — and treating it as unlisted would hide
 * working agents behind a flag nobody set.
 *
 * Delisting is also the one exclusion nothing on the backend overrides: the
 * floor's starvation backstop re-admits below-floor agents, never withdrawn
 * ones. It is the operator's decision about their own service, not a verdict
 * on it, and surfaces must say so in those terms.
 */
export function isListed(agent: Pick<Agent, "status">): boolean {
  return agent.status !== "offline";
}
