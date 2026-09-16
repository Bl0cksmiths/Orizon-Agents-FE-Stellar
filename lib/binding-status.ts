/**
 * Whether an agent still needs an endpoint bound, and the words we use for it.
 *
 * Shared because story 2.05 states the same fact on three surfaces — the
 * registration page, the bind page and the marketplace row — and three
 * copies of a security claim drift. The predicate lives here for a sharper
 * reason: getting it wrong is not a typo, it mislabels the whole catalog.
 */

import type { Agent } from "./types";

/**
 * Does this agent need an endpoint binding to be able to work?
 *
 * ONLY on-chain agents do. A seeded catalog agent runs on a worker inside the
 * backend and has no endpoint at all, so "unbound" is not a defect for it —
 * it is the normal state. The backend's own `is_dispatchable` returns true for
 * every seeded agent precisely because of that, which is why dispatchability
 * must NEVER be used as a proxy for boundness: it would render all twelve
 * catalog agents as bound, and any "unbound" flag keyed off `!bound` alone
 * would flag them all as broken.
 *
 * `owner` is the discriminator rather than `source` because `source` is not in
 * the frontend's `Agent` type today; the two are equivalent because the seed
 * never sets an owner.
 */
export function needsBinding(agent: Pick<Agent, "owner">): boolean {
  return !!agent.owner;
}

/** Is this agent owned by the connected wallet? Mirrors the story-1.08 rule
 *  already applied in the marketplace: trust the on-chain owner, never a
 *  local record. */
export function isOwnedBy(agent: Pick<Agent, "owner">, address: string | null): boolean {
  return !!address && !!agent.owner && agent.owner === address;
}

/** The bind route, carrying the agent so the operator never retypes an id.
 *  Encoded because an agent id reaches us from the chain, not from our form. */
export function bindHref(agentId: string): string {
  return `/app/bind?agent=${encodeURIComponent(agentId)}`;
}

/**
 * What an unbound agent actually means — and this wording is load-bearing.
 *
 * The obvious phrasing, "it will fail any work routed to it", is FALSE for
 * this system: an unbound agent is never routed to in the first place. The
 * backend filters it out of the planner's candidate list, out of the
 * floor-substitution search, and out of the model's returned plan. So it does
 * not fail work; it is passed over silently, which is worse for an operator
 * because nothing ever breaks loudly enough to notice.
 */
export const UNBOUND_WARNING =
  "This agent cannot be selected for work until you bind an endpoint. " +
  "It is listed, but the orchestrator passes over it when building a plan.";

/** Said before the FIRST wallet prompt, never after. An unexplained second
 *  popup reads as an attack, and an operator who was not warned is right to
 *  treat it as one. */
export const TWO_SIGNATURES =
  "Listing an agent takes two signatures. This one is the on-chain " +
  "registration transaction. Binding an endpoint afterwards takes a second, " +
  "separate signature — a signed message that proves you own the agent. It " +
  "moves no funds and costs no fee.";

/** The trust boundary, stated plainly wherever binding is done — the same
 *  disclosure standard the settler already holds itself to. */
export const TRUST_BOUNDARY =
  "Ownership of this agent is on-chain and permanent. The endpoint is not: " +
  "it is an off-chain service record held by the registry, so you can move " +
  "hosts by binding again, and nothing about your ownership changes.";
