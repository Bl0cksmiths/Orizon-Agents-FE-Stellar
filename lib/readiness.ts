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
import { bindHref } from "./binding-status";
import { explorerHref } from "./explorer-href";

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

/** Narrows a wire status. Anything this build does not know is `unknown` —
 * "couldn't check" — and never `done`: a status that cannot be read is not a
 * step that is finished. */
export function readinessStatus(raw: string): ReadinessStatus {
  return (READINESS_STATUSES as readonly string[]).includes(raw)
    ? (raw as ReadinessStatus)
    : "unknown";
}

const isStepKey = (v: string): v is ReadinessStepKey =>
  (READINESS_STEP_KEYS as readonly string[]).includes(v);

/** One checklist row, ready to render. */
export type ChecklistStep = {
  /** The wire key; one of `READINESS_STEP_KEYS` unless a newer backend sent
   * a step this build has no name for. */
  key: string;
  status: ReadinessStatus;
  detail: string;
  action: string | null;
  evidence: ReadinessEvidence | null;
};

/** What a documented step reads as when the backend sent nothing for it. */
const MISSING_DETAIL = "The backend did not report this step.";

/**
 * The checklist, always the seven documented steps in the documented order,
 * followed by any step this build does not know (in the order it arrived).
 *
 * A documented step the payload left out is `unknown` rather than dropped,
 * and a repeated key keeps its first occurrence — the backend promises one of
 * each, and showing two answers to one question would be showing neither.
 */
export function checklistSteps(r: AgentReadiness): ChecklistStep[] {
  const byKey = new Map<string, ReadinessStep>();
  for (const step of r.steps)
    if (!byKey.has(step.key)) byKey.set(step.key, step);
  const row = (key: string, step: ReadinessStep | undefined): ChecklistStep =>
    step
      ? {
          key,
          status: readinessStatus(step.status),
          detail: step.detail,
          action: step.action ?? null,
          evidence: step.evidence ?? null,
        }
      : {
          key,
          status: "unknown",
          detail: MISSING_DETAIL,
          action: null,
          evidence: null,
        };
  const known = READINESS_STEP_KEYS.map((key) => row(key, byKey.get(key)));
  const extra = [...byKey.entries()]
    .filter(([key]) => !isStepKey(key))
    .map(([key, step]) => row(key, step));
  return [...known, ...extra];
}

/** The first step that is not done, in checklist order, or null when every
 * step is. A failed or unchecked step is not done: it is where to look next. */
export function nextStep(steps: ChecklistStep[]): ChecklistStep | null {
  return steps.find((s) => s.status !== "done") ?? null;
}

/** What each documented step is called on screen. */
const STEP_LABELS: Record<ReadinessStepKey, string> = {
  registered: "Registered on-chain",
  active: "Active",
  bound: "Endpoint bound",
  reachable: "Endpoint reachable",
  routable: "Routable",
  first_run: "First workflow run",
  first_settlement: "First settlement",
};

/** A step's name. An undocumented key is shown as sent, underscores opened
 * up, rather than hidden. */
export function stepLabel(key: string): string {
  return isStepKey(key) ? STEP_LABELS[key] : key.replace(/_/g, " ");
}

/** What each status says in words. The icon beside it is decoration; this is
 * the meaning, so colour and glyph are never the only signal. */
export const STATUS_TEXT: Record<ReadinessStatus, string> = {
  done: "Done",
  todo: "To do",
  failed: "Failed",
  unknown: "Couldn't check",
};

/** A page in this app where a step is fixed. */
export type StepLink = { href: string; label: string };

/**
 * Where the operator goes to finish a step, when that is a page in this app.
 * Only for a step that is not done. Activation has no page of its own (it is
 * a setting on the agent's card) and the last two steps are finished by a
 * buyer, not by the operator, so none of those three links anywhere.
 */
export function stepLink(
  step: ChecklistStep,
  agentId: string,
): StepLink | null {
  if (step.status === "done") return null;
  switch (step.key) {
    case "registered":
      return { href: "/app/register", label: "Open Register" };
    case "bound":
    case "reachable":
      return { href: bindHref(agentId), label: "Open Bind" };
    case "routable":
      return { href: "/app/agents", label: "Open the marketplace" };
    default:
      return null;
  }
}

/** The evidence link for a step, or null when it carries none. */
export function evidenceLink(
  step: ChecklistStep,
): { href: string; label: string } | null {
  const ev = step.evidence;
  if (!ev) return null;
  const href = explorerHref(ev.explorer, "tx", ev.tx_hash);
  if (!href) return null;
  return {
    href,
    label: ev.tx_hash ? `tx ${ev.tx_hash.slice(0, 8)}…` : "evidence",
  };
}

/** `checked_at` as the operator's own wall-clock time, 24-hour HH:MM:SS. */
export function formatCheckedAt(checkedAtSeconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(checkedAtSeconds * 1_000);
}

/**
 * What the live region says after a re-check. It names the agent (several
 * checklists share one page), the count, and the next step; and when the
 * answer carries the same `checked_at` as the one it replaced, it says the
 * backend served its cached check rather than implying nothing changed.
 */
export function recheckAnnouncement(
  r: AgentReadiness,
  previousCheckedAt: number | null,
): string {
  const steps = checklistSteps(r);
  const done = steps.filter((s) => s.status === "done").length;
  const next = nextStep(steps);
  const parts = [
    `Re-checked ${r.agent_id}: ${done} of ${steps.length} steps done.`,
    next ? `Next: ${stepLabel(next.key)}.` : "Nothing left to do.",
  ];
  if (previousCheckedAt !== null && previousCheckedAt === r.checked_at) {
    parts.push(
      `Same check as before, from ${formatCheckedAt(r.checked_at)}: the backend caches it for about ${READINESS_CACHE_SECONDS} seconds.`,
    );
  }
  return parts.join(" ");
}
