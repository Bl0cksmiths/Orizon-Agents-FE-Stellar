"use client";
import { useMemo, useState } from "react";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";
import { ErrorNote } from "@/components/ui/error-note";
import { Skeleton, LoadingStatus } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { ReputationBadge } from "@/components/ui/reputation-badge";
import {
  DEFAULT_REP_PARAMS,
  lowerBoundBps,
  scoreOutOfFive,
} from "@/lib/reputation-math";
import type { Agent, ReputationBatch, ReputationInfo } from "@/lib/types";

// ReputationInfo.weight arrives in stroops; 10^7 stroops = 1 USDC.
const STROOPS_PER_USDC = 10_000_000;

type SortCol = "score" | "lower" | "evidence" | "ratings" | "disputes";
type SortDir = "asc" | "desc";

type Row = { agent: Agent; rep: ReputationInfo };

const sortValue: Record<SortCol, (r: Row) => number> = {
  score: (r) => r.rep.smoothed_bps,
  lower: (r) => r.rep.lower_bound_bps,
  evidence: (r) => r.rep.weight,
  ratings: (r) => r.rep.count,
  disputes: (r) => r.rep.disputed,
};

function ScoreMeter({
  bps,
  floorBps,
  belowFloor,
  prior,
}: {
  bps: number;
  floorBps?: number;
  /** Routability is decided upstream on the Wilson lower bound, not `bps`. */
  belowFloor: boolean;
  prior: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={
        `score ${scoreOutOfFive(bps)} of 5` +
        (floorBps != null ? `, floor ${scoreOutOfFive(floorBps)}` : "")
      }
      className="relative h-1.5 w-24 sm:w-32 rounded-full bg-border/20"
    >
      <div
        className={cn(
          "h-full rounded-full",
          belowFloor ? "bg-magenta" : prior ? "bg-violet/50" : "bg-cyan",
        )}
        style={{ width: `${Math.max(0, Math.min(100, bps / 100))}%` }}
      />
      {floorBps != null && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-px bg-text/40"
          style={{ left: `${Math.max(0, Math.min(100, floorBps / 100))}%` }}
        />
      )}
    </div>
  );
}

function SortableTh({
  label,
  col,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  col: SortCol;
  sort: { col: SortCol; dir: SortDir };
  onSort: (col: SortCol) => void;
  align?: "left" | "right";
}) {
  const active = sort.col === col;
  return (
    <th
      scope="col"
      className={cn("pb-3", align === "right" ? "text-right" : "text-left")}
      aria-sort={
        active ? (sort.dir === "desc" ? "descending" : "ascending") : undefined
      }
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.25em] transition hover:text-text",
          active ? "text-text" : "text-muted",
        )}
      >
        {label}
        <span aria-hidden="true">
          {active ? (sort.dir === "desc" ? " ▾" : " ▴") : ""}
        </span>
      </button>
    </th>
  );
}

/**
 * Sortable reputation leaderboard joining the agent registry with live
 * on-chain scores. Agents without on-chain evidence mirror the backend's
 * prior fallback under the live params, so only a failed *batch* fetch
 * genuinely degrades the table to seeded priors.
 *
 * The two failures are reported separately because they mean opposite things:
 * a batch failure leaves every row rendered against its seeded prior, while an
 * agents failure leaves nothing to render at all — reporting that as
 * "degraded to seeded prior" over an empty table would be a lie.
 */
export function RepLeaderboard({
  agents,
  batch,
  loading,
  retrying = false,
  agentsError,
  batchError,
  agentsLastSuccessAt = null,
  batchLastSuccessAt = null,
  onRetryAgents,
  onRetryBatch,
}: {
  agents: Agent[] | null;
  batch: ReputationBatch | null;
  loading: boolean;
  /** An automatic retry is scheduled or in flight (`useFetch.retrying`). */
  retrying?: boolean;
  agentsError: string | null;
  batchError: string | null;
  /** When the roster on screen was read (`useFetch.lastSuccessAt`). */
  agentsLastSuccessAt?: number | null;
  /** When the on-chain scores on screen were read. */
  batchLastSuccessAt?: number | null;
  onRetryAgents?: () => void;
  onRetryBatch?: () => void;
}) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({
    col: "score",
    dir: "desc",
  });

  const onSort = (col: SortCol) =>
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "desc" ? "asc" : "desc" }
        : { col, dir: "desc" },
    );

  const rows = useMemo<Row[]>(() => {
    if (!agents) return [];
    const joined = agents.map((agent) => {
      const live = batch?.reputations[agent.id];
      // A live entry is used as sent, prior or on-chain. A prior entry is the
      // backend's own `_prior_info`, lower bound included, and it carries the
      // one fact a rebuilt copy would drop: `degraded`, whether that prior is
      // a cold start or stands in for a chain read that failed.
      //
      // Only an agent the batch carried no entry for is rebuilt here, and it
      // mirrors that same fallback: the smoothed score IS the live prior,
      // there is no evidence mean, and the lower bound is taken on the prior
      // with zero weight under the live params. Only without a batch (so no
      // live params either) does the row degrade to the seeded prior.
      const rep: ReputationInfo = live
        ? live
        : batch != null
          ? {
              agent_id: agent.id,
              smoothed_bps: batch.prior_bps,
              lower_bound_bps: lowerBoundBps(batch.prior_bps, 0, {
                ...DEFAULT_REP_PARAMS,
                prior_bps: batch.prior_bps,
                floor_bps: batch.floor_bps,
              }),
              avg_bps: 0,
              count: 0,
              weight: 0,
              disputed: 0,
              dispute_rate_bps: 0,
              source: "prior",
            }
          : {
              agent_id: agent.id,
              smoothed_bps: agent.rep * 2000,
              lower_bound_bps: lowerBoundBps(agent.rep * 2000, 0),
              avg_bps: agent.rep * 2000,
              count: 0,
              weight: 0,
              disputed: 0,
              dispute_rate_bps: 0,
              source: "prior",
              // The batch request failed, so this seeded stand-in says
              // nothing about the agent's ratings — the chip must not claim
              // it has none. Still loading is not a failure, and is not
              // flagged as one.
              degraded: batchError !== null,
            };
      return { agent, rep };
    });
    const dir = sort.dir === "desc" ? -1 : 1;
    const val = sortValue[sort.col];
    return joined.sort((a, b) => dir * (val(a) - val(b)));
  }, [agents, batch, batchError, sort]);

  // Skeleton rows stand in for agent rows, so they are only right while the
  // registry is genuinely still on its way: nothing to render yet and no
  // failure to report. useFetch retries transient failures on its own and
  // flips `loading` true for every attempt, so keying the placeholders off
  // `loading` alone would swap the failure row out for skeletons and back
  // once per attempt. A batch failure never reaches here — those rows fall
  // back to seeded priors and render normally under their own error note.
  const showSkeletons = loading && !agents && agentsError === null;

  // `useFetch` keeps the last good payload when a reload fails, so a failure
  // here does not empty the table — it freezes it, and a frozen score is what
  // the orchestrator's hiring floor is read from. A non-null `lastSuccessAt`
  // is precisely "a real payload is on screen": the hook clears it with the
  // data, so a first fetch that never succeeded leaves it null and the badge
  // hidden. That case is a failure, not staleness, and the error notes above
  // (plus the explicit failure row below) own it.
  const agentsStale = agentsError !== null && agentsLastSuccessAt !== null;
  const batchStale = batchError !== null && batchLastSuccessAt !== null;

  return (
    <div>
      {agentsError && (
        <ErrorNote
          className="mb-4 clip-cyber-sm"
          onRetry={onRetryAgents}
          retrying={retrying || loading}
        >
          agent registry unavailable — the table below is empty because the
          registry could not be read, not because no agents are registered.{" "}
          {agentsError}
        </ErrorNote>
      )}

      {batchError && (
        <ErrorNote
          className="mb-4 clip-cyber-sm"
          onRetry={onRetryBatch}
          retrying={retrying || loading}
        >
          live reputation degraded to seeded prior — on-chain scores, settled
          evidence and the routing floor are not live. {batchError}
        </ErrorNote>
      )}

      {(agentsStale || batchStale) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StaleBadge
            lastSuccessAt={agentsLastSuccessAt}
            stale={agentsError !== null}
            what="the agent roster"
          />
          <StaleBadge
            lastSuccessAt={batchLastSuccessAt}
            stale={batchError !== null}
            what="the on-chain reputation scores below"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              <th className="pb-3 text-left">#</th>
              <th className="pb-3 text-left">agent</th>
              <SortableTh
                label="score"
                col="score"
                sort={sort}
                onSort={onSort}
                align="left"
              />
              <th className="pb-3 text-left">
                <span className="sr-only">score meter</span>
              </th>
              <SortableTh
                label="lower bound"
                col="lower"
                sort={sort}
                onSort={onSort}
              />
              <SortableTh
                label="evidence"
                col="evidence"
                sort={sort}
                onSort={onSort}
              />
              <SortableTh
                label="ratings"
                col="ratings"
                sort={sort}
                onSort={onSort}
              />
              <SortableTh
                label="disputes"
                col="disputes"
                sort={sort}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {showSkeletons && (
              <>
                <tr>
                  <td colSpan={8} className="p-0">
                    <LoadingStatus label="Loading leaderboard…" />
                  </td>
                </tr>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={8} className="py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              </>
            )}

            {!showSkeletons &&
              rows.map(({ agent, rep }, i) => {
                const prior = rep.source === "prior";
                // The backend's `passes_floor` gates routing on the Wilson
                // lower bound, never the smoothed score.
                const belowFloor =
                  batch != null && rep.lower_bound_bps < batch.floor_bps;
                return (
                  <m.tr
                    key={agent.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                    className={cn(
                      "border-b border-border/50 last:border-0 hover:bg-violet/5 transition",
                      belowFloor && "border-l-2 border-l-magenta/50",
                    )}
                  >
                    <td className="py-3 pr-2 font-mono text-xs text-muted">
                      {i + 1}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-mono">{agent.name}</div>
                      <div className="font-mono text-xs text-muted">
                        {agent.id}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <ReputationBadge
                        bps={rep.smoothed_bps}
                        lowerBoundBps={rep.lower_bound_bps}
                        source={rep.source}
                        // A prior served for a failed read is not a cold
                        // start; without the flag the chip says it is.
                        degraded={rep.degraded}
                        count={rep.count}
                        disputeRateBps={rep.dispute_rate_bps}
                        floorBps={batch?.floor_bps}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <ScoreMeter
                        bps={rep.smoothed_bps}
                        floorBps={batch?.floor_bps}
                        belowFloor={belowFloor}
                        prior={prior}
                      />
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-text">
                      ★ {scoreOutOfFive(rep.lower_bound_bps)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-text">
                      {prior ? (
                        <span className="text-muted">—</span>
                      ) : (
                        `${(rep.weight / STROOPS_PER_USDC).toFixed(2)} USDC`
                      )}
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-muted">
                      {rep.count}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {rep.disputed > 0 ? (
                        <span
                          className="text-magenta"
                          title={`${rep.disputed} disputed rating${rep.disputed === 1 ? "" : "s"}`}
                        >
                          ⚑ {rep.disputed}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                  </m.tr>
                );
              })}

            {/* No agent list at all — an explicit failed row, never a blank
                table body that reads as an empty registry. */}
            {!showSkeletons && !agents && (
              <tr>
                <td
                  colSpan={8}
                  className="py-10 text-center font-mono text-xs text-magenta"
                >
                  agent registry unavailable — leaderboard could not be loaded.
                  {agentsError ? ` ${agentsError}` : ""}
                </td>
              </tr>
            )}

            {!showSkeletons && agents && rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="py-10 text-center text-muted font-mono text-xs"
                >
                  no agents in the registry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
