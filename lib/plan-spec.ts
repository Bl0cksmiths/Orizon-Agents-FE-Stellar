/**
 * Editing the brief a plan was built from ("We understood this as…").
 *
 * Orchestrator v2 rewrites the buyer's request as a structured brief before it
 * plans, and returns it with the plan. The buyer can correct it and plan
 * again: the edited brief goes back as `spec`, and the backend checks it again
 * before planning from it. This module is the form's model — the brief as
 * editable text, and the text back as a brief, checked here first so a
 * mistake is named beside its field instead of costing a round trip.
 */

import type { PlanSpec } from "./types";

/** The brief as the form edits it: each list one item per line. */
export type SpecDraft = {
  summary: string;
  goal: string;
  deliverable: string;
  constraints: string;
  done_criteria: string;
};

export type SpecField = keyof SpecDraft;

/** Client-side bounds, so a mistake is named beside its field. The backend
 *  checks the brief again on its own terms. */
export const SPEC_LIMITS = {
  summary: 300,
  goal: 500,
  deliverable: 300,
  /** Items per list. */
  items: 10,
  /** Characters per list item. */
  item: 200,
} as const;

export function specToDraft(spec: PlanSpec): SpecDraft {
  return {
    summary: spec.summary,
    goal: spec.goal,
    deliverable: spec.deliverable,
    constraints: spec.constraints.join("\n"),
    done_criteria: spec.done_criteria.join("\n"),
  };
}

/** A bullet or number a buyer types at the start of a line: "- ", "• ",
 *  "* ", "1. ", "2) ". The list is already a list. */
const BULLET = /^(?:[-•*]|\d+[.)])\s+/;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(BULLET, "").trim())
    .filter((l) => l !== "");
}

export type SpecDraftResult =
  | { ok: true; spec: PlanSpec }
  | { ok: false; errors: Partial<Record<SpecField, string>> };

/** The draft as a brief, or what to fix, field by field. */
export function draftToSpec(draft: SpecDraft): SpecDraftResult {
  const errors: Partial<Record<SpecField, string>> = {};
  const goal = draft.goal.trim();
  const deliverable = draft.deliverable.trim();
  // A cleared summary falls back to the goal rather than blocking the form:
  // it is the panel's headline, and the goal says the same thing longer.
  const summary = draft.summary.trim() || goal;
  const constraints = lines(draft.constraints);
  const done_criteria = lines(draft.done_criteria);

  if (!goal) errors.goal = "Say what the goal is.";
  else if (goal.length > SPEC_LIMITS.goal)
    errors.goal = `Keep the goal to ${SPEC_LIMITS.goal} characters or fewer.`;
  if (!deliverable) errors.deliverable = "Say what should be delivered.";
  else if (deliverable.length > SPEC_LIMITS.deliverable)
    errors.deliverable = `Keep the deliverable to ${SPEC_LIMITS.deliverable} characters or fewer.`;
  if (summary.length > SPEC_LIMITS.summary)
    errors.summary = `Keep the summary to ${SPEC_LIMITS.summary} characters or fewer.`;
  const listError = (items: string[]) =>
    items.length > SPEC_LIMITS.items
      ? `List at most ${SPEC_LIMITS.items} items, one per line.`
      : items.some((i) => i.length > SPEC_LIMITS.item)
        ? `Keep each line to ${SPEC_LIMITS.item} characters or fewer.`
        : null;
  const c = listError(constraints);
  if (c) errors.constraints = c;
  const d = listError(done_criteria);
  if (d) errors.done_criteria = d;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    spec: { goal, deliverable, constraints, done_criteria, summary },
  };
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Whether `next` asks for anything `prev` did not. Planning again from an
 *  unchanged brief would spend a planning call to get the same plan. */
export function specChanged(prev: PlanSpec, next: PlanSpec): boolean {
  return (
    prev.goal !== next.goal ||
    prev.deliverable !== next.deliverable ||
    prev.summary !== next.summary ||
    !sameList(prev.constraints, next.constraints) ||
    !sameList(prev.done_criteria, next.done_criteria)
  );
}
