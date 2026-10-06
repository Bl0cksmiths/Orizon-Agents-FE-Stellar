/**
 * The marks a trace line carries under orchestrator v2.
 *
 * `StageMark` opens a line that reports a planning stage — the request
 * check, the brief, the plan — so the run's preamble reads apart from its
 * steps. `StepMarks` closes a line that reports a step, with the step's tier
 * and the model it ran on. Both render nothing for a line from a backend that
 * predates them, so an older run's trace reads exactly as it did.
 */

import { Badge } from "@/components/ui/badge";
import { ModelTag, TierBadge } from "@/components/console/tier-badge";
import {
  STAGE_COPY,
  traceLineModel,
  traceLineTier,
  traceStage,
} from "@/lib/trace-stage";
import type { TraceLine } from "@/lib/types";

export function StageMark({ line }: { line: TraceLine }) {
  const stage = traceStage(line);
  if (!stage) return null;
  return (
    <Badge tone="violet" className="mr-2 align-middle">
      <span className="sr-only">Planning stage: </span>
      <span aria-hidden="true">◆</span>
      {STAGE_COPY[stage].label}
    </Badge>
  );
}

export function StepMarks({ line }: { line: TraceLine }) {
  const model = traceLineModel(line);
  // Named once: when the line's own words already say it, a tag repeating
  // it is noise.
  const repeat = model !== null && line.msg.includes(model);
  const tier = traceLineTier(line);
  if (!tier && (!model || repeat)) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle">
      <TierBadge tier={tier} />
      {!repeat && <ModelTag model={line.model} />}
    </span>
  );
}
