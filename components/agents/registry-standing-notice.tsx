/**
 * The network floor, stated once, above the agent registry.
 *
 * Story 3.05, AC-2. `floor_bps` already reaches every row's reputation badge,
 * where it silently decides whether a chip turns magenta — but the number
 * itself is printed nowhere on the page, so the threshold that every one of
 * those verdicts refers to is invisible to the buyer reading them. The
 * marketplace is where a buyer meets this rule for the first time, so it is
 * also where the rule has to be explained.
 *
 * "Wilson" is deliberately absent from the copy. Naming the statistic tells a
 * buyer nothing they can act on; what they can act on is that the floor is
 * checked against the reputation LOWER BOUND rather than the headline score,
 * which is the single most misunderstood fact in this system.
 *
 * The component fetches nothing and decides nothing. The page owns the
 * reputation batch and this is a reading of what came back — which is also
 * what makes every branch below testable without a network.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { scoreOutOfFive } from "@/lib/reputation-math";
import type { ReputationBatch } from "@/lib/types";

/** The console's voice for explanatory prose, matching the operator panels. */
const body = "font-mono text-[11px] leading-relaxed text-muted";

export function RegistryStandingNotice({
  batch,
}: {
  batch: ReputationBatch | null;
}): JSX.Element | null {
  // The reputation read has not landed. The page owns its own loading and
  // error frames for that fetch; a second verdict on the same request here
  // would only contradict them, and printing a floor nobody sent would be
  // inventing the one number the rest of the page defers to.
  if (batch === null) return null;

  const floorBps = batch.floor_bps;

  // `== null` is the absence check, never `!floorBps`. A floor of 0 is a real
  // configuration — the floor that admits everyone — and it is exactly the
  // setting a buyer most needs told about, so falsiness would suppress the one
  // value worth shouting about.
  if (floorBps == null) return null;

  return (
    <Card className="p-4 sm:p-6">
      {/* The page's only h1 is "Agent Registry", and nothing else on it opens a
          section, so this is an h2 — the notice sits beside the table rather
          than inside it. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold tracking-tight">
          Selection floor
        </h2>
        {/* The same ★ and the same 0–5 scale as the chips in the reputation
            column, because the whole point of the number is that it is the line
            those chips are measured against. The word "floor" rides in the
            badge text: the violet tint is decoration, and a threshold stated
            only in a colour is not stated at all. */}
        <Badge tone="violet">
          <span aria-hidden="true">★</span> floor {scoreOutOfFive(floorBps)}
        </Badge>
      </div>
      <p className={`mt-2 max-w-[72ch] ${body}`}>
        The floor decides which agents the orchestrator will consider when it
        builds a plan. It is checked against each agent&apos;s reputation lower
        bound — what a score is worth once it has been discounted for how few
        rated jobs stand behind it — and never against the headline score in the
        reputation column. An agent can show a strong score and still sit below
        the floor.
      </p>
    </Card>
  );
}
