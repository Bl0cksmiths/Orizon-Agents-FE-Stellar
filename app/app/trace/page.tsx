"use client";
import {
  Suspense,
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArtifactViewer } from "@/components/ui/artifact-viewer";
import { DisputeSection } from "@/components/disputes/dispute-section";
import { ErrorNote } from "@/components/ui/error-note";
import { KVRow } from "@/components/ui/kv-row";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { getArtifact, openTraceStream } from "@/lib/api";
import type { ArtifactResponse, TraceLine } from "@/lib/types";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

const levelColor: Record<TraceLine["level"], string> = {
  input: "text-cyan",
  exec: "text-violet",
  proof: "text-magenta",
  cost: "text-emerald-300",
  out: "text-text",
  error: "text-magenta",
  artifact: "text-cyan",
};

type Tab = "trace" | "artifact";

// Rendered order of the tablist — arrow-key navigation walks this.
const TAB_ORDER: Tab[] = ["trace", "artifact"];

// Memoized row: every SSE tick appends a line — previously the whole list
// re-rendered per tick. Line objects are stable references, so memo skips
// all already-rendered rows.
const TraceRow = memo(function TraceRow({ line }: { line: TraceLine }) {
  return (
    <div className="flex gap-2 sm:gap-3">
      {/* Fixed gutters ate ~120px of the ~276px a 380px viewport leaves inside
          the log box, squeezing messages into a 2-3 word ribbon — and
          globals.css sets overflow-x:hidden, so the overflow was clipped
          rather than scrollable. The timestamp is the droppable one. */}
      <span className="hidden sm:inline w-16 shrink-0 text-muted">
        {line.t}
      </span>
      <span
        className={cn(
          "w-14 shrink-0 uppercase tracking-widest text-[10px]",
          levelColor[line.level],
        )}
      >
        {line.level}
      </span>
      <span className="flex-1 min-w-0 break-words text-text/90 leading-5">
        {line.msg}
      </span>
    </div>
  );
});

function TracePageInner() {
  const params = useSearchParams();
  const taskId = params.get("task");
  const [lines, setLines] = useState<TraceLine[]>([]);
  const [done, setDone] = useState(false);
  const [tab, setTab] = useState<Tab>("trace");
  const [artifactData, setArtifactData] = useState<ArtifactResponse | null>(
    null,
  );
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  // True between a dropped connection and the first line of the replacement:
  // what is on screen is still the last thing the backend said, but it is no
  // longer live and the badge must not claim otherwise.
  const [reconnecting, setReconnecting] = useState(false);
  // The live stream could not be sustained and the run is now being followed
  // by polling the recorded history instead. Degraded, but not dead.
  const [degraded, setDegraded] = useState(false);
  // Bumping this re-runs the subscribe effect, which tears the dead stream
  // down and opens a fresh one — the manual counterpart to the automatic
  // reconnects and the polling fallback openTraceStream spends first.
  const [streamAttempt, setStreamAttempt] = useState(0);

  const [demoCursor, setDemoCursor] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(true);
  // Demo replay data loads on demand — live-task views never ship it.
  const [demoTrace, setDemoTrace] = useState<TraceLine[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ids are per-instance so a second Trace view on a page cannot cross-wire
  // its tabs to this one's panels.
  const uid = useId();
  const tabId: Record<Tab, string> = {
    trace: `${uid}-tab-trace`,
    artifact: `${uid}-tab-artifact`,
  };
  const panelId: Record<Tab, string> = {
    trace: `${uid}-panel-trace`,
    artifact: `${uid}-panel-artifact`,
  };
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // Arrow keys move between tabs, Home/End jump to the ends. Selection
  // follows focus: both panels are already rendered client-side, so there is
  // nothing slow to defer to a second keypress.
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TAB_ORDER.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? TAB_ORDER[(i + 1) % TAB_ORDER.length]
        : e.key === "ArrowLeft"
          ? TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length]
          : e.key === "Home"
            ? TAB_ORDER[0]
            : e.key === "End"
              ? TAB_ORDER[TAB_ORDER.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  useEffect(() => {
    if (taskId) return;
    let alive = true;
    import("@/lib/mock-data").then(({ traceLines }) => {
      if (alive) setDemoTrace(traceLines as TraceLine[]);
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  // Live mode: subscribe to SSE.
  useEffect(() => {
    if (!taskId) return;
    // getArtifact can resolve up to 30s later — without this guard a slow
    // response lands after unmount or applies the previous task's artifact
    // when ?task= changes.
    let alive = true;
    setLines([]);
    setDone(false);
    setArtifactData(null);
    setArtifactError(null);
    setStreamError(false);
    setReconnecting(false);
    setDegraded(false);
    const fetchArtifact = () =>
      getArtifact(taskId)
        .then((data) => {
          if (!alive) return;
          setArtifactData(data);
          setArtifactError(null);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setArtifactError(
            err instanceof Error ? err.message : "artifact fetch failed",
          );
        });
    // The backend replays the full history to every new subscriber, so a
    // reconnect supersedes what is on screen — but the swap waits for the
    // replacement to actually deliver. Clearing when the retry is merely
    // scheduled threw the run away for good if that retry then failed: the
    // backend keeps traces in memory only, so a restart 404s and nothing
    // re-fetches them, leaving an empty log for a run the user just watched.
    let pendingReplace = false;
    const close = openTraceStream(
      taskId,
      (line) => {
        const replace = pendingReplace;
        pendingReplace = false;
        if (replace) setReconnecting(false);
        setLines((prev) => (replace ? [line] : [...prev, line]));
        if (line.level === "artifact") {
          fetchArtifact();
        }
      },
      () => {
        setReconnecting(false);
        setDone(true);
        fetchArtifact();
      },
      () => {
        // Stream dropped mid-flight — do not present it as a sealed run.
        setReconnecting(false);
        setStreamError(true);
        fetchArtifact();
      },
      () => {
        // Reconnect starting: mark the rendered lines as superseded rather
        // than deleting them. The first replayed line replaces the lot, so
        // nothing doubles and nothing is lost if the reconnect never lands.
        pendingReplace = true;
        setReconnecting(true);
      },
      {
        onFallback: () => {
          // SSE is gone; the run is now followed by polling the recorded
          // history. Say so — "streaming" would be a lie, and "interrupted"
          // would be premature.
          setReconnecting(false);
          setDegraded(true);
        },
      },
    );
    return () => {
      alive = false;
      close();
    };
  }, [taskId, streamAttempt]);

  // Auto-switch tabs when an artifact arrives.
  useEffect(() => {
    if (artifactData?.artifact) setTab("artifact");
  }, [artifactData]);

  // Demo mode (no task id) replays local mock data using the timestamps
  // embedded in each line — heavy steps (code.gen, code.critic) naturally
  // produce a longer pause, snappy steps stay snappy. Total replay matches
  // what a real run would look like (~6 seconds).
  useEffect(() => {
    if (taskId) return;
    if (!demoPlaying) return;
    if (demoCursor >= demoTrace.length) return;
    const prevT =
      demoCursor === 0 ? 0 : parseFloat(demoTrace[demoCursor - 1].t);
    const nextT = parseFloat(demoTrace[demoCursor].t);
    const rawDelta = Math.round((nextT - prevT) * 1000);
    // Floor 120ms so very-fast steps still feel like motion; cap 2800ms so a
    // single gap never stalls the demo into fatigue.
    const deltaMs = Math.min(Math.max(rawDelta, 120), 2800);
    const id = setTimeout(() => setDemoCursor((c) => c + 1), deltaMs);
    return () => clearTimeout(id);
  }, [taskId, demoCursor, demoPlaying, demoTrace]);

  useEffect(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [lines.length, demoCursor]);

  const visible: TraceLine[] = taskId ? lines : demoTrace.slice(0, demoCursor);
  const total = taskId ? lines.length : demoTrace.length;

  const spent = visible
    .filter((l) => l.level === "cost")
    .reduce((acc, l) => {
      const m = l.msg.match(/([0-9]+\.[0-9]+)\s+USDC/);
      return acc + (m ? parseFloat(m[1]) : 0);
    }, 0);

  // A stream that failed — or that never delivered a line — tells us nothing
  // about what the run cost. The reduce over an empty list formats as
  // "0.000 USDC", which reads as "this run was free": the exact lie that let
  // days of 404ing backend calls pass as healthy. Spend is only a fact when
  // there are lines to total AND the stream did not drop mid-run (a dropped
  // stream may have missed cost lines that were already charged).
  const spendUnknownReason = !taskId
    ? null
    : streamError
      ? "stream failed — spend unknown"
      : visible.length === 0
        ? done
          ? "stream closed with no trace lines"
          : "no trace lines received yet"
        : null;

  const artifact = artifactData?.artifact ?? null;

  const proofMsg = visible.find((l) => l.level === "proof")?.msg ?? null;
  const proofTx = artifactData?.proof_tx ?? null;
  // "awaiting…" is a promise that something is still coming. Once the stream
  // is dead — or sealed without a proof — nothing is on its way, and saying
  // otherwise leaves the panel waiting forever on a run that already ended.
  const attestationUnavailable =
    !proofMsg && !proofTx && Boolean(taskId) && (streamError || done);
  const attestationText = proofMsg
    ? proofMsg
    : proofTx
      ? "ERC-8004 attestation sealed on-chain"
      : streamError
        ? "attestation unknown — the stream failed before one was recorded"
        : done
          ? "run sealed without an ERC-8004 attestation"
          : "awaiting ERC-8004 attestation…";

  // The subscribe effect resets lines/done/error and opens a new EventSource,
  // so a retry restarts from the backend's replayed history rather than
  // appending onto a stale half-run.
  const reconnect = () => setStreamAttempt((n) => n + 1);

  const summaryRows: Array<[string, ReactNode]> = [
    ["Task", taskId ?? "demo"],
    ["Lines", String(visible.length)],
    [
      "Spent",
      spendUnknownReason ? (
        <>
          <span className="text-magenta" aria-hidden="true">
            —
          </span>
          <span className="sr-only">unknown</span>
          <div className="mt-1 text-[10px] leading-4 text-magenta/80">
            {spendUnknownReason}
          </div>
        </>
      ) : (
        `${spent.toFixed(3)} USDC`
      ),
    ],
    [
      "State",
      taskId
        ? streamError
          ? "interrupted ✕"
          : done
            ? "sealed ✓"
            : degraded
              ? "polling…"
              : reconnecting
                ? "reconnecting…"
                : "streaming…"
        : "demo",
    ],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trace</h1>
          <p className="mt-1 text-sm text-muted">
            {taskId
              ? "Every step attributed, recorded, verifiable."
              : "Demo replay — run an intent in the Orchestrator to see a live one."}
          </p>
        </div>
        {!taskId && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDemoPlaying((p) => !p)}
            >
              {demoPlaying ? "⏸ Pause" : "▸ Play"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDemoCursor(0);
                setDemoPlaying(true);
              }}
            >
              ↻ Restart
            </Button>
          </div>
        )}
      </div>

      {/* Its own component so the dispute window's countdown re-renders the
          receipt alone, never this page and its trace log. */}
      <DisputeSection taskId={taskId} workflowDone={done} demo={!taskId} />

      {artifact && (
        <div className="flex gap-2" role="tablist" aria-label="Trace views">
          <button
            type="button"
            role="tab"
            id={tabId.trace}
            aria-selected={tab === "trace"}
            aria-controls={panelId.trace}
            // Roving tabIndex: the pair is one tab stop, arrows move inside it.
            tabIndex={tab === "trace" ? 0 : -1}
            ref={(el) => {
              tabRefs.current.trace = el;
            }}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab("trace")}
            className={cn(
              "clip-cyber-sm border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition",
              focusRing,
              tab === "trace"
                ? "border-violet bg-violet/20 text-text shadow-neon-violet"
                : "border-border text-muted hover:text-text",
            )}
          >
            ▸ trace log
          </button>
          <button
            type="button"
            role="tab"
            id={tabId.artifact}
            aria-selected={tab === "artifact"}
            aria-controls={panelId.artifact}
            tabIndex={tab === "artifact" ? 0 : -1}
            ref={(el) => {
              tabRefs.current.artifact = el;
            }}
            onKeyDown={onTabKeyDown}
            onClick={() => setTab("artifact")}
            className={cn(
              "clip-cyber-sm border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition",
              focusRing,
              tab === "artifact"
                ? "border-cyan bg-cyan/20 text-text shadow-neon-cyan"
                : "border-border text-muted hover:text-text",
            )}
          >
            ▣ artifact
          </button>
        </div>
      )}

      {artifactError && !artifact && (
        <ErrorNote className="clip-cyber-sm">
          ⚠ artifact fetch failed — {artifactError}
        </ErrorNote>
      )}

      {tab === "artifact" && artifact ? (
        // space-y-6 keeps the gap the outer stack used to give these two.
        <div
          role="tabpanel"
          id={panelId.artifact}
          aria-labelledby={tabId.artifact}
          className="space-y-6"
        >
          <ArtifactViewer artifact={artifact} />
          {(artifactData?.charge_tx || artifactData?.proof_tx) && (
            <Card>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-4">
                On-chain receipts
              </div>
              <dl className="space-y-3 text-sm font-mono">
                {artifactData?.charge_tx && (
                  <TxRow label="charge" hash={artifactData.charge_tx} />
                )}
                {artifactData?.proof_tx && (
                  <TxRow label="seal" hash={artifactData.proof_tx} />
                )}
              </dl>
            </Card>
          )}
        </div>
      ) : (
        <div
          // Panel semantics only hold while the tablist above is rendered:
          // with no artifact there is no tab to label this, and a panel
          // pointing at a button that never mounted is worse than a plain div.
          {...(artifact
            ? {
                role: "tabpanel" as const,
                id: panelId.trace,
                "aria-labelledby": tabId.trace,
              }
            : {})}
          className="grid gap-6 lg:grid-cols-[1fr_280px]"
        >
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <Badge
                  tone={streamError ? "magenta" : done ? "cyan" : "violet"}
                  dot={!done && !streamError}
                >
                  {taskId ?? "demo"}
                </Badge>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                  {taskId
                    ? streamError
                      ? "stream interrupted"
                      : done
                        ? "sealed"
                        : degraded
                          ? "polling"
                          : reconnecting
                            ? "reconnecting"
                            : "streaming"
                    : "demo replay"}
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted">
                {/* Live runs have no known step count — `total` is just
                    lines.length, so "0 / 0 steps" was a fabricated denominator
                    that made a dead stream look like a completed empty run.
                    Only the demo replay knows its length up front. */}
                {taskId
                  ? streamError && visible.length === 0
                    ? "— steps"
                    : `${visible.length} step${visible.length === 1 ? "" : "s"}`
                  : `${visible.length} / ${total} steps`}
              </span>
            </div>
            <div
              ref={containerRef}
              className="font-mono text-xs p-4 sm:p-5 h-[540px] overflow-y-auto space-y-1.5 bg-[#060010]"
            >
              {visible.map((line, i) => (
                <TraceRow key={i} line={line} />
              ))}
              {taskId && !done && !streamError && (
                <div className="flex gap-2 sm:gap-3 animate-pulse">
                  <span className="hidden sm:inline w-16 shrink-0 text-muted">
                    …
                  </span>
                  <span
                    className={cn(
                      "w-14 shrink-0 uppercase tracking-widest text-[10px]",
                      reconnecting || degraded ? "text-magenta" : "text-violet",
                    )}
                  >
                    {degraded ? "poll" : reconnecting ? "conn" : "wait"}
                  </span>
                  <span className="flex-1 min-w-0 text-muted">
                    {degraded
                      ? "live stream unavailable — following the recorded trace instead"
                      : reconnecting
                        ? "connection dropped — reconnecting; the lines above are the last received"
                        : "awaiting next step…"}
                  </span>
                </div>
              )}
              {taskId && streamError && (
                <div
                  className={cn(
                    "flex",
                    visible.length === 0 ? "h-full items-center" : "pt-4",
                  )}
                >
                  <ErrorNote
                    className="w-full leading-5"
                    onRetry={reconnect}
                    retryLabel="↻ reconnect"
                  >
                    <span className="block uppercase tracking-[0.2em] text-[10px]">
                      ⚠ stream lost
                    </span>
                    <span className="mt-1.5 block text-magenta/80">
                      the trace stream dropped, the automatic reconnects failed,
                      and reading the recorded trace directly did not recover it
                      either
                      {visible.length === 0
                        ? " — not a single line arrived"
                        : ` — the ${visible.length} line${visible.length === 1 ? "" : "s"} above ${visible.length === 1 ? "is" : "are"} the last received`}
                      . nothing further will arrive on its own — the summary and
                      attestation are incomplete until it is restored.
                    </span>
                  </ErrorNote>
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-4">
                Summary
              </div>
              <dl className="space-y-3 text-sm font-mono">
                {summaryRows.map(([k, v]) => (
                  <KVRow key={k} k={k}>
                    {v}
                  </KVRow>
                ))}
              </dl>
            </Card>
            <Card>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-4">
                Attestation
              </div>
              <div
                className={cn(
                  "font-mono text-xs break-all leading-5",
                  attestationUnavailable ? "text-magenta/90" : "text-muted",
                )}
              >
                {attestationText}
              </div>
              {proofTx && (
                <StellarExpertLink
                  kind="tx"
                  id={proofTx}
                  className="mt-3 inline-block"
                />
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function TxRow({ label, hash }: { label: string; hash: string }) {
  return (
    <KVRow k={label}>
      <div className="break-all">{hash}</div>
      <StellarExpertLink kind="tx" id={hash} className="inline-block mt-1" />
    </KVRow>
  );
}

/**
 * Shell for the Suspense boundary. `useSearchParams` suspends the whole page,
 * and a one-line "loading…" reserved none of the 540px log box — the real
 * layout slammed in underneath it. This mirrors the live structure (header,
 * log card with its status bar, summary + attestation column) so the swap is
 * a fill, not a jump.
 */
function TraceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <LoadingStatus label="Loading trace…" />
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trace</h1>
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="h-[540px] space-y-3 bg-[#060010] p-4 sm:p-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex gap-2 sm:gap-3">
                <Skeleton className="hidden sm:block h-3 w-16 shrink-0" />
                <Skeleton className="h-3 w-14 shrink-0" />
                <Skeleton
                  className={cn("h-3 flex-1", i % 3 === 2 && "max-w-[55%]")}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-4">
              Summary
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 border-b border-border/40 pb-2 last:border-0"
                >
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-4">
              Attestation
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function TracePage() {
  return (
    <Suspense fallback={<TraceSkeleton />}>
      <TracePageInner />
    </Suspense>
  );
}
