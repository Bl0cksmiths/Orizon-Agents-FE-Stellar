"use client";
/**
 * The line a console panel shows while its first read is out, sized to sit
 * inside the panel's skeleton so nothing moves when it changes or goes.
 *
 * The backend sleeps on Render's free plan and takes about a minute to wake.
 * A skeleton alone cannot tell a visitor whether the page is working or
 * stuck, and for a minute that reads as broken. So, once a read has taken
 * longer than a warm one ever does, the panel says what is happening, how
 * long it usually takes, and how far in it is:
 *
 *   loading agents…                                    (first 1.5 s)
 *   Waking the network… usually under a minute · 12s   [=====-------]
 *   Still waking — this is taking longer than usual · 74s
 *
 * Accessibility: one polite live region, whose sentence changes only when
 * the phase does, so a screen reader hears "waking" once rather than a
 * count every second. The ticking seconds are visual only; the progress bar
 * carries the same figure as a value a reader can query.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Before this, a read is just loading: a warm cached answer lands in tens of
 * milliseconds and a warm backend in about three seconds at worst. */
export const WAKE_HINT_AFTER_MS = 1_500;
/** What "usually under a minute" means: a Render free-plan cold start. */
export const TYPICAL_WAKE_MS = 60_000;
/** The bar never claims to be done before the data is. */
const MAX_PROGRESS = 95;

export type WakePhase = "loading" | "waking" | "slow";

/** The phase a read is in after `elapsedMs`. */
export function wakePhase(elapsedMs: number): WakePhase {
  if (elapsedMs < WAKE_HINT_AFTER_MS) return "loading";
  if (elapsedMs < TYPICAL_WAKE_MS) return "waking";
  return "slow";
}

/** How far through a typical wake `elapsedMs` is, as a whole percentage. */
export function wakeProgress(elapsedMs: number): number {
  return Math.min(
    MAX_PROGRESS,
    Math.max(0, Math.round((elapsedMs / TYPICAL_WAKE_MS) * 100)),
  );
}

/** Milliseconds since `active` last turned true, ticking once a second
 * while it stays true; 0 while it is false. */
export function useElapsed(active: boolean): number {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      setStartedAt(null);
      return;
    }
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    // The first tick lands on the hint threshold so the phase changes on
    // time; after that, on each whole second since the start, so the count
    // and the bar move together.
    let timer = setTimeout(function tick() {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, 1_000 - ((current - start) % 1_000));
    }, WAKE_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return active && startedAt !== null ? Math.max(0, now - startedAt) : 0;
}

const SENTENCES: Record<WakePhase, (what: string) => string> = {
  loading: (what) => `Loading ${what}…`,
  waking: () => "Waking the network… usually under a minute",
  slow: () =>
    "Still waking — this is taking longer than usual. It keeps trying on its own.",
};

export function WakeStatus({
  active,
  what,
  className,
}: {
  /** True while the panel's first read is out (or retrying a wake). */
  active: boolean;
  /** What is loading, for the first phase: "agents", "network metrics". */
  what: string;
  className?: string;
}) {
  const elapsed = useElapsed(active);
  if (!active) return null;
  const phase = wakePhase(elapsed);
  const seconds = Math.floor(elapsed / 1_000);
  const progress = wakeProgress(elapsed);

  return (
    <div
      data-wake-status={phase}
      // Fixed height whatever the phase, so the switch from the plain line
      // to the line-and-bar never shifts the skeleton around it.
      className={cn(
        "flex h-9 min-w-0 flex-col justify-center gap-1.5 font-mono text-[11px] text-muted",
        className,
      )}
    >
      <p className="flex min-w-0 items-baseline gap-2">
        <span role="status" className="min-w-0 truncate">
          {SENTENCES[phase](what)}
        </span>
        {phase !== "loading" && (
          <span aria-hidden="true" className="shrink-0 tabular-nums">
            · {seconds}s
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Waking the network"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${seconds} seconds in, of about a minute`}
        // Present from the start, invisible until it means something, so
        // its arrival changes no layout.
        aria-hidden={phase === "loading" ? true : undefined}
        className={cn(
          "h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/5",
          phase === "loading" && "invisible",
        )}
      >
        <div
          className="h-full bg-violet/60 transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
