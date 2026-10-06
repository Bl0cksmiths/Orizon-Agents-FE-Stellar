"use client";
import { useCallback } from "react";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { DataAge } from "@/components/console/data-age";
import { WakeStatus } from "@/components/console/wake-status";
import { Composition } from "@/components/network/composition";
import { NetworkTiles } from "@/components/network/network-tiles";
import { SettledChart } from "@/components/network/settled-chart";
import { getStellarNetwork, listTasks } from "@/lib/api";
import { formatSpent, taskSpent } from "@/lib/trace-amounts";
import type { Task } from "@/lib/types";
import { loadNetworkStats } from "@/lib/use-network-stats";
import { useFetch } from "@/lib/use-fetch";
import { usePolledRead } from "@/lib/use-polled-read";

const statusTone: Record<
  Task["status"],
  "cyan" | "violet" | "muted" | "magenta"
> = {
  complete: "cyan",
  running: "violet",
  pending: "muted",
  failed: "magenta",
};

/** Both panels refresh on this cadence; each backs off on its own. */
const POLL_MS = 5_000;

export default function OverviewPage() {
  // Two panels, two reads, two failure states: the figures stay up when the
  // task list fails and the reverse. They used to share one Promise.all, so
  // one slow or failing read blanked the whole page.
  const readStats = useCallback(() => loadNetworkStats(), []);
  const readTasks = useCallback(() => listTasks(), []);
  const figures = usePolledRead(readStats, POLL_MS);
  const recent = usePolledRead(readTasks, POLL_MS);
  const stats = figures.data;
  const tasks = recent.data;
  // A failure worth saying out loud: anything but a backend still waking,
  // which the status line below covers as the wait it is.
  const statsError = figures.waiting ? null : figures.error;
  const tasksError = recent.waiting ? null : recent.error;

  // What a task's spend is denominated in: the escrow SAC's asset, native XLM
  // on testnet — never the "USDC" a field name suggests. Printed with no unit
  // until the read lands, or if it fails.
  const { data: network } = useFetch(getStellarNetwork, []);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Measured from the agent registry and the chain.
          </p>
        </div>
        {/* One height whatever it holds — the waking line while the first
            figures are out, the badges after — so nothing below moves. */}
        <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2">
          {figures.waiting ? (
            <WakeStatus
              active
              what="network metrics"
              className="w-72 max-w-full"
            />
          ) : (
            <>
              {/* Hidden unless a payload is actually on screen: a first load
                  that never landed is a failure, not stale data, and the
                  ErrorNote below owns that case. */}
              <StaleBadge
                stale={Boolean(statsError)}
                lastSuccessAt={figures.dataAt}
                what="network metrics"
              />
              {/* Old figures that arrived fine: the cache served its last
                  copy through an outage. */}
              {!statsError && (
                <DataAge at={stats?.asOf} what="network metrics" />
              )}
              <Badge tone={statsError ? "magenta" : "violet"} dot>
                {statsError ? "backend offline" : "streaming"}
              </Badge>
            </>
          )}
        </div>
      </div>

      {statsError && (
        <ErrorNote
          className="clip-cyber-sm"
          onRetry={figures.retry}
          retrying={figures.retrying}
        >
          {figures.terminal
            ? "this data isn't available — "
            : "couldn't reach the backend — "}
          {statsError}
          {figures.terminal
            ? " · this won't resolve on its own — retry once it's restored"
            : stats && " · showing the last values received"}
        </ErrorNote>
      )}

      {stats && stats.notes.length > 0 && (
        <div className="space-y-1 font-mono text-[11px] text-muted">
          {stats.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}

      {/* Two up on a phone, four from md. One column wasted a phone's
          height on four short figures; four beside a 240px sidebar at 768px
          clipped them, since a Card's clip-path cuts what overflows it. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {/* The waking line above announces the load; no second one here. */}
        <NetworkTiles stats={stats} failed={Boolean(statsError)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Throughput</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              settled workflows per day · all payers · last 14 days (UTC)
            </p>
          </div>
          {stats ? (
            <SettledChart series={stats.series} />
          ) : statsError ? (
            <div className="grid h-36 place-items-center border border-dashed border-border font-mono text-[11px] text-muted">
              throughput unavailable — backend unreachable
            </div>
          ) : (
            <>
              <Skeleton className="h-36 w-full" />
              <LoadingStatus label="Loading throughput chart…" />
            </>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-1">Network composition</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted mb-5">
            registered agents by source
          </p>
          {stats ? (
            <Composition stats={stats} />
          ) : statsError ? (
            <p className="font-mono text-[11px] text-muted">
              composition unavailable — backend unreachable
            </p>
          ) : (
            <div className="space-y-3">
              <LoadingStatus label="Loading network composition…" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Recent tasks</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
            {tasks
              ? `${tasks.length} tracked`
              : tasksError
                ? "unavailable"
                : "loading…"}
          </span>
        </div>
        {/* This panel's own failure, with its own retry: the figures above
            do not depend on it, and stay up. */}
        {tasksError && (
          <ErrorNote
            className="clip-cyber-sm mb-4"
            onRetry={recent.retry}
            retrying={recent.retrying}
          >
            {tasks
              ? "couldn't refresh recent tasks — the rows below are from the last read that succeeded. "
              : "couldn't load recent tasks. "}
            {tasksError}
          </ErrorNote>
        )}
        <ScrollRegion label="Recent tasks table, scrolls horizontally">
          <table className="w-full min-w-[40rem] text-sm">
            {/* The heading above already names this table on screen, so the
                caption carries the same name for assistive tech only. */}
            <caption className="sr-only">
              Recent tasks — id, intent, agents, spend, status and start time
            </caption>
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                <th scope="col" className="pb-3 text-left">
                  id
                </th>
                <th scope="col" className="pb-3 text-left">
                  intent
                </th>
                <th scope="col" className="pb-3 text-left">
                  agents
                </th>
                <th scope="col" className="pb-3 text-left">
                  spent
                </th>
                <th scope="col" className="pb-3 text-left">
                  status
                </th>
                <th scope="col" className="pb-3 text-right">
                  started
                </th>
              </tr>
            </thead>
            <tbody>
              {(tasks ?? []).map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border/50 last:border-0 hover:bg-violet/5 transition"
                >
                  {/* The task id is what identifies the row, so it is the
                      row header; `text-left font-normal` only holds the
                      cell's existing look against the th defaults. */}
                  <th
                    scope="row"
                    className="py-3 pr-4 text-left font-mono text-xs font-normal text-muted"
                  >
                    {/* Capped and ellipsised; the whole id stays in the
                        cell and in the title. */}
                    <span title={t.id} className="block max-w-[10rem] truncate">
                      {t.id}
                    </span>
                  </th>
                  <td className="py-3 pr-4">
                    <span title={t.intent} className="block max-w-md truncate">
                      {t.intent}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-xs">{t.agents}</td>
                  <td className="py-3 font-mono text-xs text-cyan">
                    {formatSpent(taskSpent(t) ?? Number.NaN, network?.asset)}
                  </td>
                  <td className="py-3">
                    <Badge
                      tone={statusTone[t.status]}
                      dot={t.status !== "complete"}
                    >
                      {t.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-muted">
                    {t.started}
                  </td>
                </tr>
              ))}
              {tasks && tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-muted font-mono text-xs"
                  >
                    No tasks yet — try the Orchestrator.
                  </td>
                </tr>
              )}
              {!tasks &&
                (tasksError ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-muted font-mono text-xs"
                    >
                      couldn&apos;t load recent tasks — backend unreachable.
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={6} className="py-3">
                        {i === 0 ? (
                          <WakeStatus active what="recent tasks" />
                        ) : (
                          <Skeleton className="h-5 w-full" />
                        )}
                      </td>
                    </tr>
                  ))
                ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Card>
    </div>
  );
}
