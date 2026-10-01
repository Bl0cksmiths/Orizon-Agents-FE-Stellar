"use client";
import { useCallback, useState } from "react";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { Composition } from "@/components/network/composition";
import { NetworkTiles } from "@/components/network/network-tiles";
import { SettledChart } from "@/components/network/settled-chart";
import { getStellarNetwork, listTasks } from "@/lib/api";
import type { NetworkStats } from "@/lib/network-stats";
import { formatSpent } from "@/lib/trace-amounts";
import type { Task } from "@/lib/types";
import { loadNetworkStats } from "@/lib/use-network-stats";
import { isTransientFetchError, useFetch } from "@/lib/use-fetch";
import { usePolling } from "@/lib/use-polling";

const statusTone: Record<
  Task["status"],
  "cyan" | "violet" | "muted" | "magenta"
> = {
  complete: "cyan",
  running: "violet",
  pending: "muted",
  failed: "magenta",
};

export default function OverviewPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A terminal failure (a 4xx that will not fix itself) is distinct from a
  // transient one: polling a 404 forever tells the reader nothing and hides
  // which of the two they are looking at. Set from isTransientFetchError.
  const [terminal, setTerminal] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // When the manual retry below last succeeded; the poller tracks its own.
  const [manualSuccessAt, setManualSuccessAt] = useState<number | null>(null);
  // What a task's spend is denominated in: the escrow SAC's asset, native XLM
  // on testnet — never the "USDC" a field name suggests. Printed with no unit
  // until the read lands, or if it fails.
  const { data: network } = useFetch(getStellarNetwork, []);

  const load = useCallback(async () => {
    const [n, t] = await Promise.all([loadNetworkStats(), listTasks()]);
    setStats(n);
    setTasks(t);
    setError(null);
    setTerminal(false);
  }, []);

  // `trackStatus` dates the numbers still on screen: the poller keeps the last
  // payload rendered when a tick fails, and without a timestamp those metrics
  // present themselves as live for the whole outage.
  const { lastSuccessAt } = usePolling(
    async () => {
      try {
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "fetch failed");
        setTerminal(!isTransientFetchError(e));
        // Rethrow so the poller backs off while the backend is down.
        throw e;
      }
    },
    5000,
    // A terminal failure stops the loop — re-polling a 404 every 5s is noise,
    // and the manual retry below is the way back.
    { enabled: !terminal, trackStatus: true },
  );

  // Manual retry: the poller has backed off to a 20s cadence by the time the
  // error box is read, so the button fetches immediately instead of waiting.
  const retry = useCallback(() => {
    setRetrying(true);
    load()
      .then(() => setManualSuccessAt(Date.now()))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "fetch failed");
        setTerminal(!isTransientFetchError(e));
      })
      .finally(() => setRetrying(false));
  }, [load]);

  // The data on screen is whatever landed last — a poll tick or a manual
  // retry. Dating it by the poller alone would age the numbers by up to a
  // full backoff window after a hand-triggered refresh.
  const dataAt = Math.max(lastSuccessAt ?? 0, manualSuccessAt ?? 0) || null;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Measured from the agent registry and the chain.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden unless a payload is actually on screen: a first load that
              never landed is a failure, not stale data, and the ErrorNote
              below owns that case. */}
          <StaleBadge
            stale={Boolean(error)}
            lastSuccessAt={dataAt}
            what="network metrics"
          />
          <Badge tone={error ? "magenta" : "violet"} dot>
            {error ? "backend offline" : "streaming"}
          </Badge>
        </div>
      </div>

      {error && (
        <ErrorNote
          className="clip-cyber-sm"
          onRetry={retry}
          retrying={retrying}
        >
          {terminal
            ? "this data isn't available — "
            : "couldn't reach the backend — "}
          {error}
          {terminal
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
        {!stats && !error && <LoadingStatus label="Loading metrics…" />}
        <NetworkTiles stats={stats} failed={Boolean(error)} />
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
          ) : error ? (
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
          ) : error ? (
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
              : error
                ? "unavailable"
                : "loading…"}
          </span>
        </div>
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
                    {/* Capped like the registry's id column; the whole id
                        stays in the cell and in the title. */}
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
                    {formatSpent(t.spent, network?.asset)}
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
                (error ? (
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
                        <Skeleton className="h-5 w-full" />
                        {i === 0 && (
                          <LoadingStatus label="Loading recent tasks…" />
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
