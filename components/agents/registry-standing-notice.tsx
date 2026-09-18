/**
 * What the floor is, and whether the scores on this page are readings of the
 * chain at all. Stated once, above the agent registry.
 *
 * Story 3.05, AC-2 and AC-5. Both facts belong to the page rather than to a
 * row, for the same reason twice over:
 *
 *   - AC-2. `floor_bps` already reaches every row's reputation badge, where it
 *     silently decides whether a chip turns magenta — but the number itself is
 *     printed nowhere, so the threshold that every one of those verdicts refers
 *     to is invisible to the buyer reading them. The marketplace is where a
 *     buyer meets this rule for the first time, so it is also where the rule
 *     has to be explained. "Wilson" is deliberately absent from the copy:
 *     naming the statistic tells a buyer nothing they can act on, whereas the
 *     fact that the floor is checked against the LOWER BOUND and not the
 *     headline score is the single most misunderstood thing in this system.
 *
 *   - AC-5. A failed read is not a property of one agent. The reputation
 *     service fails OPEN by design: when the chain cannot be read, every agent
 *     reverts to the Bayesian prior at once, and the prior clears the floor —
 *     so during an outage the floor stops filtering. Counting the failures is
 *     the only way to tell a couple of stale rows from a page that has stopped
 *     showing evidence altogether, and those two situations look identical
 *     row by row.
 *
 * Two words are load-bearing in that second block and neither reaches the
 * screen. `degraded` is an internal field name, and elsewhere in this product
 * it already means "re-admitted below the floor by the starvation backstop",
 * which is a completely different fact — so the copy below never uses it. And
 * a failed read is NOT a cold start: a never-rated agent reports the same
 * `source: "prior"` carrying the same number, and is an honest new agent
 * rather than a failure. `degraded` is the only thing separating them, which
 * is why it is the only thing counted here.
 *
 * The component fetches nothing and decides nothing. The page owns the
 * reputation batch and this is a reading of what came back — which is also
 * what makes every branch below testable without a network.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { StaleBadge } from "@/components/ui/stale-badge";
import { scoreOutOfFive } from "@/lib/reputation-math";
import type { ReputationBatch } from "@/lib/types";

/** The console's voice for explanatory prose, matching the operator panels. */
const body = "font-mono text-[11px] leading-relaxed text-muted";

export function RegistryStandingNotice({
  batch,
  readError = null,
  lastReadAt = null,
  onRetry,
  retrying = false,
}: {
  batch: ReputationBatch | null;
  /**
   * Why the latest reputation request failed, or null when it did not. The
   * request is best-effort — the registry renders without it — which is
   * exactly why its failure has to be said somewhere: nothing else on the
   * page changes shape when it fails, so without this the page looks the
   * same with and without a single score behind it.
   */
  readError?: string | null;
  /** When the batch on screen was read (`useFetch.lastSuccessAt`), so a batch
   *  kept through a failed refresh can be dated rather than passed off as live. */
  lastReadAt?: number | null;
  /** Re-runs the reputation request; offered alongside the failure. */
  onRetry?: () => void;
  /** A retry is in flight or scheduled, so the control says so. */
  retrying?: boolean;
}): JSX.Element | null {
  // The reputation read never landed and failed. Said here, at the top of the
  // page, and as an alert: every score, the floor and every standing verdict
  // below are missing for one reason, and a reader meeting a column of blank
  // scores first would otherwise take them for a registry of unrated agents.
  if (batch === null && readError !== null) {
    return (
      <ErrorNote
        className="clip-cyber-sm"
        onRetry={onRetry}
        retrying={retrying}
      >
        reputation unavailable — it could not be loaded, so this page shows no
        score, selection floor or standing verdict rather than guessed ones.{" "}
        {readError}
      </ErrorNote>
    );
  }

  // The reputation read has not landed yet. Printing a floor nobody sent
  // would be inventing the one number the rest of the page defers to, and the
  // rows already hold a placeholder for the scores that are on their way.
  if (batch === null) return null;

  const floorBps = batch.floor_bps;

  // `== null` is the absence check, never `!floorBps`. A floor of 0 is a real
  // configuration — the floor that admits everyone — and it is exactly the
  // setting a buyer most needs told about, so falsiness would suppress the one
  // value worth shouting about.
  const hasFloor = floorBps != null;

  const entries = Object.values(batch.reputations ?? {});
  const total = entries.length;
  // Counted on `degraded` alone. Counting `source === "prior"` instead would
  // accuse every honest never-rated agent on the page of being a failed read.
  const failedReads = entries.filter((r) => r.degraded === true);
  const failed = failedReads.length;
  const read = total - failed;
  const allFailed = total > 0 && failed === total;

  // The same rule the rest of the page applies — the lower bound against the
  // floor — read off the bounds we were actually handed rather than assumed
  // from the shipped config, so a config change cannot turn the sentence it
  // guards into a false claim.
  const estimateClearsFloor =
    hasFloor && failedReads.every((r) => r.lower_bound_bps >= floorBps);

  let readFailure: string | null = null;
  if (allFailed) {
    readFailure =
      (total === 1
        ? "The one reputation score on this page could not be read from the chain."
        : `None of the ${total} reputation scores on this page could be read from the chain.`) +
      " Every score here is a network-wide estimate standing in for the agent's own record, including any row that reads like a new agent with no ratings yet." +
      " The floor is not sorting these agents on evidence right now." +
      (estimateClearsFloor
        ? " That estimate sits above the floor, so the floor is admitting every agent on this page."
        : "") +
      " The failure is on our side, and nothing about these agents has changed.";
  } else if (failed > 0) {
    readFailure =
      `${failed} of ${total} reputation scores on this page could not be read from the chain, so ${failed === 1 ? "that score is" : "those scores are"} a network-wide estimate standing in for the agent's own record.` +
      ` ${read === 1 ? "The other score was" : `The other ${read} scores were`} read successfully — including any agent that has no ratings yet, which is a reading of the chain rather than a failure of one.` +
      " The failure is on our side, and it says nothing about the agents it landed on.";
  }

  // A batch is on screen, but the latest attempt to refresh it failed. What is
  // shown is still a real reading — `useFetch` keeps the last good payload —
  // so nothing is blanked; it is dated instead, because a frozen floor and
  // frozen scores present themselves as live.
  const refreshFailed = readError !== null;

  // Nothing was sent worth stating. Better an absent notice than an empty
  // frame implying the page knows something it does not.
  if (!hasFloor && readFailure === null && !refreshFailed) return null;

  return (
    <Card className="space-y-3 p-4 sm:p-6">
      {refreshFailed && (
        <ErrorNote
          className="clip-cyber-sm"
          onRetry={onRetry}
          retrying={retrying}
        >
          reputation refresh failed — the scores and selection floor on this
          page are from the last successful read. {readError}
        </ErrorNote>
      )}
      {hasFloor && (
        <div>
          {/* The page's only h1 is "Agent Registry", and nothing else on it
              opens a section, so this is an h2 — the notice sits beside the
              table rather than inside it. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h2 className="text-base font-semibold tracking-tight">
              Selection floor
            </h2>
            {/* The same ★ and the same 0–5 scale as the chips in the
                reputation column, because the whole point of the number is
                that it is the line those chips are measured against. The word
                "floor" rides in the badge text: the violet tint is decoration,
                and a threshold stated only in a colour is not stated at all. */}
            <Badge tone="violet">
              <span aria-hidden="true">★</span> floor {scoreOutOfFive(floorBps)}
            </Badge>
            {/* Beside the number it dates: after a failed refresh this floor
                is the last one read, and a deployment can have moved it. */}
            <StaleBadge
              stale={refreshFailed}
              lastSuccessAt={lastReadAt}
              what="reputation scores and selection floor"
            />
          </div>
          <p className={`mt-2 max-w-[72ch] ${body}`}>
            The floor decides which agents the orchestrator will consider when
            it builds a plan. It is checked against each agent&apos;s reputation
            lower bound — what a score is worth once it has been discounted for
            how few rated jobs stand behind it — and never against the headline
            score in the reputation column. An agent can show a strong score and
            still sit below the floor.
          </p>
        </div>
      )}

      {/* A live region, mounted whether or not it has anything to say.
          `role="status"` rather than nothing, because the batch revalidates on
          window focus: a buyer who tabs away and back can have the whole page
          turn from evidence into estimates without touching anything. That is a
          change in what every number on the page MEANS, with no visual event to
          catch, and it is precisely what a polite live region is for.
          `role="alert"` would be wrong — it interrupts, nothing here is an
          error the buyer has to act on, and the page's own ErrorNote already
          owns the failed-fetch case.

          The empty paragraph is deliberate. A live region inserted into the DOM
          together with its text is announced inconsistently, so the region
          exists from the first render that has a batch and only its contents
          change afterwards. With nothing to say it renders nothing, occupies
          nothing, and says nothing about degradation at all. */}
      <p
        role="status"
        className={
          readFailure === null
            ? undefined
            : `clip-cyber-sm max-w-[72ch] border px-3 py-2 ${body} ${
                allFailed
                  ? "border-magenta/40 bg-magenta/5 text-magenta"
                  : "border-violet/30 bg-violet/5"
              }`
        }
      >
        {readFailure !== null && (
          <>
            {/* Glyph plus words: the magenta is redundant, and a page that
                says its numbers are estimates only in a colour has not said
                it. */}
            <span aria-hidden="true">⚠ </span>
            {readFailure}
          </>
        )}
      </p>
    </Card>
  );
}
