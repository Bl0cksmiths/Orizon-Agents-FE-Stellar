"use client";
import { useEffect, useState } from "react";

import { formatRemaining } from "@/lib/disputes";
import type { DisputePanelView } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The settled view's window, lifted from the frozen type so the two cannot drift. */
export type DisputeWindow = Extract<
  DisputePanelView,
  { kind: "settled" }
>["window"];

// The zone is spelled out because the buyer reads this as a deadline: "2:05
// PM" is a different moment for them and for whoever they forward it to.
const LOCAL_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** An instant in the viewer's own locale and time zone, zone named. */
export function formatLocalTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, LOCAL_TIME).format(ms);
}

const TICK_MS = 1_000;

/**
 * `remainingMs`, counting down between renders.
 *
 * The view is a snapshot: whether the page re-derives it every second is the
 * page's business, and a countdown that only moves when its parent happens to
 * re-render looks broken. So the figure ticks here from the last value it was
 * handed, and every new value re-anchors it — the server-corrected clock
 * upstream stays the authority, this only fills the gaps between its answers.
 *
 * It never decides the window has closed. At zero it holds at zero until the
 * view says `open: false`; flipping the state is disputeView()'s call.
 */
function useCountdown(remainingMs: number, running: boolean): number {
  const [base, setBase] = useState(remainingMs);
  const [elapsed, setElapsed] = useState(0);

  // Re-anchor during render rather than in an effect, so a fresh value is
  // never painted with the previous anchor's elapsed time subtracted from it.
  if (base !== remainingMs) {
    setBase(remainingMs);
    setElapsed(0);
  }

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startedAt), TICK_MS);
    return () => clearInterval(id);
  }, [base, running]);

  return Math.max(0, base - elapsed);
}

/**
 * Whether the dispute window is open, and until when.
 *
 * Screen readers: the ticking countdown sits in an `aria-live="off"` span, so
 * it is readable on demand but never announced — which also holds if the page
 * ever wraps this panel in a live region, since the nearest `aria-live` wins.
 * What IS announced is the one-sentence summary above it: a polite status
 * that names the absolute closing time, so its text changes exactly once, when
 * the window closes. The visible label and time it duplicates are hidden from
 * assistive tech so the same sentence is not read twice.
 */
export function WindowState({
  window: win,
  settledAtMs,
  className,
}: {
  window: DisputeWindow;
  /** Epoch ms, server clock — where the window started, for the gauge. */
  settledAtMs: number;
  className?: string;
}) {
  const remainingMs = useCountdown(win.remainingMs, win.open);
  const closesAt = formatLocalTime(win.closesAtMs);
  const closesAtIso = new Date(win.closesAtMs).toISOString();

  // Share of the window still to run, for the gauge only. A malformed window
  // (closing at or before settlement) draws empty rather than dividing by it.
  const span = win.closesAtMs - settledAtMs;
  const leftPct =
    span > 0 ? Math.min(100, Math.max(0, (remainingMs / span) * 100)) : 0;

  return (
    <div
      className={cn(
        "clip-cyber-sm border px-4 py-3",
        win.open ? "border-cyan/30 bg-cyan/5" : "border-border/60 bg-bg/40",
        className,
      )}
    >
      {/* Kept as the first child in both states so React reuses the node:
          its text changing in place is what makes the close announced. */}
      <p role="status" className="sr-only">
        {win.open
          ? `Dispute window open until ${closesAt}.`
          : `The dispute window closed on ${closesAt}.`}
      </p>

      {win.open ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-cyan"
            >
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan shadow-[0_0_8px_#00FFD1] motion-reduce:animate-none" />
              Dispute window open
            </span>
            <span
              aria-live="off"
              className="font-mono text-sm tabular-nums text-text"
            >
              {formatRemaining(remainingMs)}
            </span>
          </div>
          <div aria-hidden="true" className="mt-3 h-1 bg-white/5">
            <div
              className="h-full bg-cyan/70 shadow-[0_0_8px_#00FFD1]"
              style={{ width: `${leftPct}%` }}
            />
          </div>
          <p
            aria-hidden="true"
            className="mt-2 font-mono text-[11px] text-muted"
          >
            closes <time dateTime={closesAtIso}>{closesAt}</time>
          </p>
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-border" />
            Dispute window closed
          </span>
          <p
            aria-hidden="true"
            className="mt-2 font-mono text-[11px] text-muted"
          >
            closed <time dateTime={closesAtIso}>{closesAt}</time>
          </p>
        </>
      )}
    </div>
  );
}
