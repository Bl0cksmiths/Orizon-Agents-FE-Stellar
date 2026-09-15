"use client";
import { useCallback, useState } from "react";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { getOverview, listTasks } from "@/lib/api";
import type { Overview, Task } from "@/lib/types";
import { focusRing } from "@/lib/ui";
import { isTransientFetchError } from "@/lib/use-fetch";
import { usePolling } from "@/lib/use-polling";

// Tile labels are static, so they render while the payload is loading and
// stay put when it fails — only the value slot swaps to a failed state.
const METRIC_KEYS = [
  "Agents online",
  "Tasks / s",
  "Avg completion",
  "Avg trust",
] as const;

const statusTone: Record<
  Task["status"],
  "cyan" | "violet" | "muted" | "magenta"
> = {
  complete: "cyan",
  running: "violet",
  pending: "muted",
  failed: "magenta",
};

function Sparkline({ points }: { points: number[] }) {
  if (!points.length) return <div className="h-36" />;
  const max = Math.max(...points) || 1;
  const w = 600;
  const h = 140;
  const path = points
    .map((v, i) => {
      const x = (i / Math.max(1, points.length - 1)) * w;
      const y = h - (v / max) * (h - 12) - 6;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      role="img"
      aria-label="Sparkline of tasks executed over the last 24 hours"
      viewBox={`0 0 ${w} ${h}`}
      className="h-36 w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#B026FF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#B026FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#sparkFill)" />
      <path d={path} stroke="#B026FF" strokeWidth="1.5" fill="none" />
      <path
        d={path}
        stroke="#00FFD1"
        strokeWidth="0.6"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A terminal failure (a 4xx that will not fix itself) is distinct from a
  // transient one: polling a 404 forever tells the reader nothing and hides
  // which of the two they are looking at. Set from isTransientFetchError.
  const [terminal, setTerminal] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // When the manual retry below last succeeded; the poller tracks its own.
  const [manualSuccessAt, setManualSuccessAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([getOverview(), listTasks()]);
    setOverview(o);
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

  // /api/metrics/overview carries no period-over-period deltas, so the tiles
  // show the measured value and its unit only — never an invented trend.
  const metrics: { k: string; v: string; unit?: string }[] = overview
    ? [
        {
          k: "Agents online",
          v: overview.agents_online.toLocaleString(),
        },
        {
          k: "Tasks / s",
          v: overview.tasks_per_sec.toFixed(3),
        },
        {
          k: "Avg completion",
          v: `${(overview.avg_completion * 100).toFixed(1)}%`,
        },
        {
          // avg_trust is served on a 0..5 scale; the suffix is the unit, not a delta.
          k: "Avg trust",
          v: overview.avg_trust.toFixed(2),
          unit: "/ 5",
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Realtime pulse of the Orizon network.
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
            : overview && " · showing the last values received"}
        </ErrorNote>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {!overview && !error && <LoadingStatus label="Loading metrics…" />}
        {!overview &&
          METRIC_KEYS.map((k) => (
            <Card key={k}>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                {k}
              </div>
              {error ? (
                <div className="font-mono text-sm text-magenta">
                  unavailable
                </div>
              ) : (
                <Skeleton className="h-8 w-16" />
              )}
            </Card>
          ))}
        {metrics.map((metric, i) => (
          <m.div
            key={metric.k}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
          >
            <Card>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                {metric.k}
              </div>
              <div className="font-mono text-3xl neon-text">
                {metric.v}
                {metric.unit && (
                  <span className="ml-1.5 text-base text-muted">
                    {metric.unit}
                  </span>
                )}
              </div>
            </Card>
          </m.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Throughput</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                tasks executed · last 24h
              </p>
            </div>
            <div className="flex gap-2">
              {["1h", "24h", "7d"].map((t, i) => (
                <button
                  key={t}
                  type="button"
                  disabled
                  title="coming soon"
                  className={
                    `clip-cyber-sm border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition ${focusRing} ` +
                    (i === 1
                      ? "border-violet bg-violet/20 text-text"
                      : "border-border text-muted hover:text-text")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {overview ? (
            <Sparkline points={overview.throughput} />
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
            by skill cluster
          </p>
          <div className="space-y-3">
            {(overview?.skills ?? []).map((r) => (
              <div key={r.name}>
                <div className="flex items-center justify-between font-mono text-[11px] text-muted mb-1">
                  <span className="uppercase tracking-widest">{r.name}</span>
                  <span>{r.pct}%</span>
                </div>
                <div className="h-1.5 bg-white/5 overflow-hidden">
                  <div
                    className={
                      "h-full " +
                      (r.tone === "violet"
                        ? "bg-violet shadow-[0_0_10px_#B026FF]"
                        : r.tone === "cyan"
                          ? "bg-cyan shadow-[0_0_10px_#00FFD1]"
                          : "bg-magenta shadow-[0_0_10px_#FF2E9A]")
                    }
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
              </div>
            ))}
            {!overview &&
              (error ? (
                <p className="font-mono text-[11px] text-muted">
                  skill mix unavailable — backend unreachable
                </p>
              ) : (
                <>
                  <LoadingStatus label="Loading network composition…" />
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </>
              ))}
          </div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                    className="py-3 text-left font-mono text-xs font-normal text-muted"
                  >
                    {t.id}
                  </th>
                  <td className="py-3 max-w-md truncate">{t.intent}</td>
                  <td className="py-3 font-mono text-xs">{t.agents}</td>
                  <td className="py-3 font-mono text-xs text-cyan">
                    {t.spent.toFixed(3)} USDC
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
        </div>
      </Card>
    </div>
  );
}
