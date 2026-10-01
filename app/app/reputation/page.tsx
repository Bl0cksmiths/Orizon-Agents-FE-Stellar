"use client";
import { DesignPrinciples } from "@/components/reputation/design-principles";
import { OnchainDetails } from "@/components/reputation/onchain-details";
import { PipelineDiagram } from "@/components/reputation/pipeline-diagram";
import { escrowGeneration } from "@/lib/escrow-generation";
import { RatingRubric } from "@/components/reputation/rating-rubric";
import { RepLeaderboard } from "@/components/reputation/rep-leaderboard";
import { RepStats } from "@/components/reputation/rep-stats";
import { ScoreCalculator } from "@/components/reputation/score-calculator";
import {
  getReputationParams,
  getStellarNetwork,
  listAgents,
  listReputation,
} from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

/**
 * /app/reputation — the reputation system end to end: live scores for every
 * registered agent, the interactive math, and the on-chain ledger behind it.
 *
 * Reads degrade where a fallback is honest (built-in math defaults — never a
 * seeded score in place of an agent's reputation) but never silently: every
 * failed read is announced next to
 * the thing it should have filled, and every announcement carries the
 * matching `reload` so a transient backend outage is one click from recovery.
 * This page drives who the orchestrator hires and what gets paid — a
 * placeholder standing in for an unreachable ledger is a data-integrity bug,
 * not a cosmetic one.
 */
export default function ReputationPage() {
  const {
    data: agents,
    error: agentsError,
    loading: agentsLoading,
    retrying: agentsRetrying,
    lastSuccessAt: agentsLastSuccessAt,
    reload: reloadAgents,
  } = useFetch(listAgents, [], { revalidateOnFocus: true });
  const {
    data: batch,
    error: batchError,
    loading: batchLoading,
    retrying: batchRetrying,
    lastSuccessAt: batchLastSuccessAt,
    reload: reloadBatch,
  } = useFetch(listReputation, [], { revalidateOnFocus: true });
  // Static config. The calculator and ledger card fall back to built-in
  // defaults, but the failure is surfaced rather than swallowed — a default
  // floor rendered as if it were live is a routing claim we cannot back up.
  const {
    data: params,
    error: paramsError,
    loading: paramsLoading,
    retrying: paramsRetrying,
    reload: reloadParams,
  } = useFetch(getReputationParams, [], {
    revalidateOnFocus: true,
  });
  // What evidence weight is denominated in: each rating is weighted by its
  // step's quoted price, in stroops of the escrow's asset — native XLM on
  // testnet, whatever the params' `*_usdc` names say. Unknown → no unit.
  const { data: network } = useFetch(getStellarNetwork, []);
  const asset = network?.asset ?? null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reputation</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Decayed, value-weighted rating evidence on the ReputationLedger —
          smoothed with a Bayesian prior, bounded by a Wilson interval, and
          applied as a routing floor every time the orchestrator hires.
        </p>
      </div>

      {/* `retrying` is threaded into every card below so an automatic retry
          reads as "retrying…" on a stable error surface instead of dropping
          back to skeletons and placeholders once per attempt. */}
      <RepStats
        batch={batch}
        loading={batchLoading}
        error={batchError}
        retrying={batchRetrying}
        onRetry={reloadBatch}
        asset={asset}
      />

      <section aria-labelledby="rep-leaderboard-heading" className="space-y-4">
        <div>
          <h2
            id="rep-leaderboard-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Leaderboard
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every registered agent, ranked by its smoothed score. Agents without
            settled on-chain evidence show the ≈ prior.
          </p>
        </div>
        <RepLeaderboard
          agents={agents}
          batch={batch}
          loading={agentsLoading || batchLoading}
          retrying={agentsRetrying || batchRetrying}
          agentsError={agentsError}
          batchError={batchError}
          agentsLastSuccessAt={agentsLastSuccessAt}
          batchLastSuccessAt={batchLastSuccessAt}
          onRetryAgents={reloadAgents}
          onRetryBatch={reloadBatch}
          asset={asset}
        />
      </section>

      <PipelineDiagram generation={escrowGeneration(network)} />

      {/* `grid-cols-1` is load-bearing: an implicit track sizes to its
          content's min-content, so the rubric table widened the whole column
          past a phone's edge and took the calculator with it. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <RatingRubric />
        <ScoreCalculator
          params={params}
          loading={paramsLoading}
          error={paramsError}
          retrying={paramsRetrying}
          onRetry={reloadParams}
          asset={asset}
        />
      </div>

      <OnchainDetails
        params={params}
        loading={paramsLoading}
        error={paramsError}
        retrying={paramsRetrying}
        onRetry={reloadParams}
        asset={asset}
      />

      <section aria-labelledby="rep-principles-heading" className="space-y-4">
        <div>
          <h2
            id="rep-principles-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Design principles
          </h2>
          <p className="mt-1 text-sm text-muted">
            Why the score is hard to game — and safe to route on.
          </p>
        </div>
        <DesignPrinciples />
      </section>
    </div>
  );
}
