/**
 * The planning stages in a run's trace (orchestrator v2).
 *
 * Before any step runs, a request is checked (jev), rewritten as a brief
 * (Claude Sonnet 5.5) and planned (Claude Opus 5.5), and the trace reports
 * each as one line. The trace marks those lines as stages so they read as the
 * run's preamble rather than as steps. A line is a stage when the backend tags
 * it so (`stage`), or — from a backend that writes the line but not the tag —
 * when it opens with the stage's documented wording.
 */

import { modelLabel, readTier } from "./plan-tier";
import type { Tier, TraceLine } from "./types";

export const TRACE_STAGES = ["guard", "improve", "plan"] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];

const isTraceStage = (v: unknown): v is TraceStage =>
  TRACE_STAGES.some((s) => s === v);

/** Each stage's documented opening words. Anchored at the start: a step
 *  line that only mentions planning mid-sentence is not a stage. */
const STAGE_WORDING: Record<TraceStage, RegExp> = {
  guard: /^request checked by\b/i,
  improve: /^prompt improved by\b/i,
  plan: /^planned by\b/i,
};

/** The word each stage is marked with in the trace's gutter, and what a
 *  screen reader hears for it. */
export const STAGE_COPY: Record<TraceStage, { label: string; spoken: string }> =
  {
    guard: { label: "check", spoken: "Request check" },
    improve: { label: "brief", spoken: "Brief written" },
    plan: { label: "plan", spoken: "Plan made" },
  };

export function traceStage(
  line: Pick<TraceLine, "msg" | "stage">,
): TraceStage | null {
  if (line.stage != null) return isTraceStage(line.stage) ? line.stage : null;
  for (const stage of TRACE_STAGES) {
    if (STAGE_WORDING[stage].test(line.msg.trim())) return stage;
  }
  return null;
}

/** The model a line names in its `model` tag, labelled; null when untagged.
 *  The line's own words may name it too — that is the backend's prose. */
export function traceLineModel(line: Pick<TraceLine, "model">): string | null {
  return modelLabel(line.model);
}

/** The tier a line's `tier` tag carries, when this build can name it. */
export function traceLineTier(line: Pick<TraceLine, "tier">): Tier | null {
  return readTier(line.tier);
}
