/**
 * A step's tier and model, as the plan card and the trace show them
 * (orchestrator v2). Each renders nothing when the backend sent nothing this
 * build can name: no badge is better than a guessed one.
 */

import { Badge } from "@/components/ui/badge";
import { TIER_COPY, modelLabel, readTier } from "@/lib/plan-tier";
import { cn } from "@/lib/utils";

/** "LOW TIER" / "MODERATE TIER" / "COMPLEX TIER": the word carries the
 *  meaning, the tone only reinforces it. */
export function TierBadge({
  tier,
  className,
}: {
  tier: string | null | undefined;
  className?: string;
}) {
  const t = readTier(tier);
  if (!t) return null;
  const copy = TIER_COPY[t];
  return (
    <Badge tone={copy.tone} className={cn("shrink-0", className)}>
      {copy.label} tier
    </Badge>
  );
}

/** The model a step ran or runs on, by its display name. Wraps anywhere: a
 *  model id the backend sends verbatim may be one unbroken token. */
export function ModelTag({
  model,
  prefix,
  className,
}: {
  model: string | null | undefined;
  /** Words before the name, e.g. "runs on". */
  prefix?: string;
  className?: string;
}) {
  const name = modelLabel(model);
  if (!name) return null;
  return (
    <span
      className={cn(
        "font-mono text-[10px] tracking-wide text-muted [overflow-wrap:anywhere]",
        className,
      )}
    >
      {prefix ? `${prefix} ` : ""}
      <span className="text-text/80">{name}</span>
    </span>
  );
}
