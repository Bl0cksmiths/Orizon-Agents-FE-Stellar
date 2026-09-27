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
 * The notice's kind when this build has a mark and copy for it, otherwise
 * null. `kind` is any string on the wire so that a backend adding one (say
 * `"delisted"`) cannot blank the plan; a null here is the cue to render the
 * notice neutrally, beside the backend's own `reason` prose, rather than to
 * drop it or index a per-kind map with a key it does not have.
 */
export const knownKind = (n: PlanFloorNotice): PlanFloorNoticeKind | null =>
  isPlanFloorNoticeKind(n.kind) ? n.kind : null;
