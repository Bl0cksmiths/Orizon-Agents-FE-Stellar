/**
 * How the plan card reads a floor notice, in one place so the two sections
 * that count notices — the floor summary above the steps and the exclusions
 * panel below them — can never disagree about the same array.
 */

import {
  isPlanFloorNoticeKind,
  type PlanFloorNotice,
  type PlanFloorNoticeKind,
} from "@/lib/types";

/** An agent left out for having no endpoint bound. It rides in the same list
 *  as the floor's actions and arrives as `kind: "excluded"`, but the floor
 *  never saw it: it was not a candidate to begin with. */
export const isUnbound = (n: PlanFloorNotice): boolean =>
  n.reason_code === "unbound_endpoint";

/**
 * Whether a notice records the floor acting on an agent: every notice except
 * an unbound one. The ONE definition both the floor summary and the exclusions
 * panel count with — they used to keep one each, and on a `reason_code` this
 * build did not know the summary said "the floor acted on no agents" directly
 * above a panel saying "1 change". An open set, deliberately: a reason code
 * the backend adds is still the floor acting, and a notice with no code comes
 * from a backend that only ever reported floor actions. Only
 * `unbound_endpoint` is known NOT to be one, because an unbound agent was
 * never a candidate for the floor to decide about.
 */
export const isFloorAction = (n: PlanFloorNotice): boolean => !isUnbound(n);

/**
 * The notice's kind when this build has a mark and copy for it, otherwise
 * null. `kind` is any string on the wire so that a backend adding one (say
 * `"delisted"`) cannot blank the plan; a null here is the cue to render the
 * notice neutrally, beside the backend's own `reason` prose, rather than to
 * drop it or index a per-kind map with a key it does not have.
 */
export const knownKind = (n: PlanFloorNotice): PlanFloorNoticeKind | null =>
  isPlanFloorNoticeKind(n.kind) ? n.kind : null;
