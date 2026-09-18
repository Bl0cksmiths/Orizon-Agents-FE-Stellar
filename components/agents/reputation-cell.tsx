/**
 * One agent's score in the marketplace's reputation column — and nothing
 * standing in for a score nobody read.
 *
 * The column used to fall back to `agent.rep`, the seeded catalog rating
 * (4.58–4.95 across the first-party catalog), whenever an agent's live entry
 * was not an on-chain one. That put two different numbers on one agent: the
 * marketplace read 4.87 for an unrated agent while the plan card, which
 * reads the live batch, read the 3.50 prior it is actually routed on. The
 * seeded rating is catalog copy, not reputation, and nothing routes on it.
 *
 * So there are exactly two sources of a number here, both from the batch: an
 * on-chain score, and the live prior for an agent with no ratings (or one
 * whose read failed, which the badge words differently). With no entry there
 * is no number, and the cell says which kind of absence it is — the read has
 * not landed, it failed, or it carried nothing for this agent — because each
 * sends a reader somewhere different, and none is a cold start.
 *
 * The cell fetches nothing. The page owns the batch and the read state, which
 * is what keeps every branch testable without a network.
 */

import { ReputationBadge } from "@/components/ui/reputation-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReputationInfo } from "@/lib/types";

/**
 * Where the page's reputation read stands: still on its way, failed with
 * nothing on screen, or landed (possibly an earlier read kept through a
 * failed refresh, which is still a real reading).
 */
export type ReputationRead = "loading" | "failed" | "loaded";

export function ReputationCell({
  agentName,
  rep,
  floorBps,
  read,
}: {
  /** Names the row for a screen reader, which meets this cell out of context. */
  agentName: string;
  /** This agent's entry in the live reputation batch, or null when it has none. */
  rep: ReputationInfo | null;
  /** The network floor from the same batch, or null when it has not loaded. */
  floorBps: number | null;
  read: ReputationRead;
}): JSX.Element {
  if (rep !== null) {
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

  if (read === "loading") {
    return (
      <>
        <Skeleton className="ml-auto h-5 w-16" />
        <span className="sr-only">
          Loading the reputation score for {agentName}.
        </span>
      </>
    );
  }

  // No score, and none invented. Both cases below used to render the catalog's
  // seeded rating as a "prior estimate … no on-chain ratings yet" chip: a
  // number nothing routes on, captioned with a claim about the agent's history
  // that nobody had read.
  const failed = read === "failed";
  const detail = failed
    ? `Reputation unavailable for ${agentName}: the reputation read failed, so no score is shown rather than a guessed one. This says nothing about the agent's record.`
    : `No reputation score is known for ${agentName}: the reputation read carried no entry for it, so no score is shown rather than a guessed one.`;

  return (
    <span
      title={detail}
      className="inline-flex max-w-full items-center whitespace-nowrap border border-border px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted"
    >
      <span aria-hidden="true">{failed ? "unavailable" : "no score"}</span>
      <span className="sr-only">{detail}</span>
    </span>
  );
}
