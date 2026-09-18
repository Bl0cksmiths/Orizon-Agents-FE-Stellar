import { ReputationBadge } from "@/components/ui/reputation-badge";
import type { ReputationInfo } from "@/lib/types";

export function ReputationCell({
  rep,
  floorBps,
}: {
  /** This agent's entry in the live reputation batch, or null when it has none. */
  rep: ReputationInfo | null;
  /** The network floor from the same batch, or null when it has not loaded. */
  floorBps: number | null;
}): JSX.Element | null {
  if (rep === null) return null;

  // The entry exactly as the batch sent it, whichever source it came from. A
  // prior entry carries the network's live prior, and that — never the
  // catalog's seeded rating — is the number routing reads for this agent.
  return (
    <ReputationBadge
      bps={rep.smoothed_bps}
      lowerBoundBps={rep.lower_bound_bps}
      source={rep.source}
      count={rep.count}
      disputeRateBps={rep.dispute_rate_bps}
      degraded={rep.degraded}
      floorBps={floorBps ?? undefined}
    />
  );
}
