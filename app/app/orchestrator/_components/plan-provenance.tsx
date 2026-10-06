/**
 * How this plan was made (orchestrator v2), in one line under the plan card's
 * header: the request's tier, and the model behind each planning stage — the
 * check, the brief, the plan. Renders nothing for a plan from a backend that
 * predates it, so an older backend's card is exactly what it was.
 */

import { TierBadge } from "@/components/console/tier-badge";
import { modelLabel, readTier } from "@/lib/plan-tier";
import type { DecomposeResponse } from "@/lib/types";

export function PlanProvenance({ plan }: { plan: DecomposeResponse }) {
  const tier = readTier(plan.tier) ?? readTier(plan.guard?.tier);
  const stages = [
    ["checked by", modelLabel(plan.models?.guard)],
    ["brief by", modelLabel(plan.models?.improver)],
    ["planned by", modelLabel(plan.models?.planner)],
  ].filter((s): s is [string, string] => s[1] !== null);
  // Null, not absent: the backend judged its rewrite not to be the same
  // request, and planned from the buyer's own words instead.
  const asWritten = plan.understood_as === null && plan.models != null;
  if (!tier && stages.length === 0 && !asWritten) return null;

  return (
    <ul
      aria-label="How this plan was made"
      className="mb-5 -mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px] tracking-wide text-muted"
    >
      {tier && (
        <li>
          <TierBadge tier={tier} />
        </li>
      )}
      {stages.map(([verb, name]) => (
        <li key={verb} className="[overflow-wrap:anywhere]">
          {verb} <span className="text-text/80">{name}</span>
        </li>
      ))}
      {asWritten && <li>planned from your request as written</li>}
    </ul>
  );
}
