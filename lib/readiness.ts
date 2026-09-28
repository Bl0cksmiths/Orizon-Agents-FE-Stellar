/**
 * Onboarding readiness (story 5.02): the seven things an external operator's
 * agent needs before it can earn, as the backend checked them.
 *
 * GET /api/agents/{agent_id}/readiness answers with every step, in order,
 * each one `done`, `todo`, `failed` or `unknown`. This module is the whole
 * client side of that answer — the wire types, the guard, the request and the
 * rules the checklist renders — so the component decides nothing.
 *
 * Two rules matter more than the rest:
 *
 * - A value this build does not know never crashes and never flatters. An
 *   unknown `status` reads as `unknown` ("couldn't check"), never as done; a
 *   step this build has no name for is shown under the key it arrived with.
 * - The seven steps are always shown, in the documented order, whatever the
 *   payload did. A step the backend left out is `unknown`, not skipped: a
 *   checklist that quietly drops a step reads as a checklist with one fewer
 *   thing to do.
 */

import { GET_TIMEOUT_MS, ensure, fetchWithTimeout, httpError } from "./api";

/** The steps, in the order the backend checks them and the checklist lists
 * them. Each one depends on the ones before it. */
export const READINESS_STEP_KEYS = [
  "registered",
  "active",
  "bound",
  "reachable",
  "routable",
  "first_run",
  "first_settlement",
] as const;
export type ReadinessStepKey = (typeof READINESS_STEP_KEYS)[number];

export const READINESS_STATUSES = [
  "done",
  "todo",
  "failed",
  "unknown",
] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

/** On-chain proof for a step, when there is some. */
export type ReadinessEvidence = {
  tx_hash?: string | null;
  explorer?: string | null;
};

/** One step as it arrives. `key` and `status` are any string on the wire: a
 * backend that adds a step or a status must not blank the checklist. */
export type ReadinessStep = {
  key: string;
  status: string;
  detail: string;
  action?: string | null;
  evidence?: ReadinessEvidence | null;
};

export type AgentReadiness = {
  agent_id: string;
  /** Unix seconds: when the backend ran the check, which may be up to its
   * cache TTL before this response was served. */
  checked_at: number;
  /** The agent can be routed to and dispatched. Says nothing about whether it
   * has been, which is what the last two steps are for. */
  ready: boolean;
  steps: ReadinessStep[];
};

/** How long the backend caches a readiness answer, in seconds. Only used to
 * tell the operator why a re-check can repeat the last answer. */
export const READINESS_CACHE_SECONDS = 30;

/** The readiness route. One constant, because the path is not final. */
export const readinessPath = (agentId: string): string =>
  `/agents/${encodeURIComponent(agentId)}/readiness`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isOptionalStr = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || isStr(v);

function isEvidence(v: unknown): v is ReadinessEvidence | null | undefined {
  return (
    v === undefined ||
    v === null ||
    (isRecord(v) && isOptionalStr(v.tx_hash) && isOptionalStr(v.explorer))
  );
}

/** One step. `detail` and `action` are rendered as React children, so an
 * object in either would take the operator dashboard down; `evidence` builds
 * links, so a number where a hash belongs is rejected rather than linked. */
function isReadinessStep(v: unknown): v is ReadinessStep {
  return (
    isRecord(v) &&
    isStr(v.key) &&
    isStr(v.status) &&
    isStr(v.detail) &&
    isOptionalStr(v.action) &&
    isEvidence(v.evidence)
  );
}

/** The whole answer. `ready` is strictly boolean: the string "false" is
 * truthy and would tell an operator an unroutable agent is ready. */
export function isAgentReadiness(v: unknown): v is AgentReadiness {
  return (
    isRecord(v) &&
    isStr(v.agent_id) &&
    typeof v.checked_at === "number" &&
    Number.isFinite(v.checked_at) &&
    typeof v.ready === "boolean" &&
    Array.isArray(v.steps) &&
    v.steps.every(isReadinessStep)
  );
}

/**
 * Reads one agent's readiness. Deliberately NOT through the shared GET dedupe
 * in lib/api.ts: this is what the "Re-check" button calls, and a re-check
 * answered from the client's own dedupe window would be a re-check that never
 * left the browser. The backend's cache is the only one in the way, and the
 * checklist says so.
 */
export async function getAgentReadiness(
  agentId: string,
): Promise<AgentReadiness> {
  const path = readinessPath(agentId);
  const res = await fetchWithTimeout(
    "GET",
    path,
    { cache: "no-store" },
    GET_TIMEOUT_MS,
  );
  if (!res.ok) throw await httpError("GET", path, res);
  return ensure(path, isAgentReadiness)(await res.json());
}
