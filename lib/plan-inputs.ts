/**
 * Which earlier steps each plan step builds on (`PlanStep.inputs_from`):
 * 1-based indices of the steps whose outputs it uses, as the planner states
 * them. The plan card names those sources rather than implying a strict
 * chain, where a step may well draw on two steps back.
 *
 * Read defensively, since a wrong handoff on the card misstates the plan: a
 * source that is not an EARLIER step (itself, a later one, zero, a fraction,
 * a string) is dropped, and a list that is not a list is no list at all.
 */
import type { PlanStep } from "./types";

/**
 * Each step's sources, sorted and unique — or null when no step names any
 * list, which is a backend predating the field: the card then falls back to
 * the sequential handoff. Once any step names a list, a step without one
 * builds on nothing named.
 */
export function planInputs(steps: PlanStep[]): number[][] | null {
  if (!steps.some((s) => Array.isArray(s.inputs_from))) return null;
  return steps.map((s, i) => {
    const raw: unknown = s.inputs_from;
    if (!Array.isArray(raw)) return [];
    const earlier = raw.filter(
      (n): n is number => Number.isInteger(n) && n >= 1 && n <= i,
    );
    return [...new Set(earlier)].sort((a, b) => a - b);
  });
}
