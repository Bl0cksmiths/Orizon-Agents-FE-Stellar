"use client";
/**
 * Asks again, on its own, after a read failed on an outage (lib/store-outage):
 * the backend's record store unreachable, or a 5xx a moment cures.
 *
 *   const { gaveUp, resetBudget } = useOutageRetry(outage, retryQuietly);
 *
 * - One retry per outage seen: the timer is armed when a new `outage` object
 *   arrives — each failed read classifies its own — and fires `retry` once.
 *   The next one is armed only by the failure that retry produces, so there
 *   is never more than one read in the air on this hook's account, and never
 *   a loop that does not wait.
 * - Spaced as the fetch hook spaces its own retries (`retryDelayMs`):
 *   `OUTAGE_RETRY_BASE_MS` doubling to a ceiling, and never sooner than the
 *   backend's Retry-After.
 * - Bounded: after `OUTAGE_MAX_RETRIES` it stops and says so (`gaveUp`); a
 *   store down for longer than a few minutes is not cured by asking more.
 *   `resetBudget()` — a reader pressing Retry — starts a fresh budget, and an
 *   outage that ends (`outage` back to null) restores it.
 * - Paused while the tab is hidden: nobody is reading, and a background tab
 *   must not knock on a struggling backend. Coming back fires at once if the
 *   retry fell due meanwhile, else when it does.
 * - Torn down on unmount, and whenever `enabled` goes false — a caller with a
 *   poll of its own already reading on a cadence turns this off rather than
 *   double the reads.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreOutage } from "./store-outage";
import { retryDelayMs } from "./use-fetch";

/** The first retry's wait when the backend named none; doubles after. */
export const OUTAGE_RETRY_BASE_MS = 3_000;
/**
 * Automatic retries per outage: 3 s, 6 s, 12 s, 24 s and then the fetch
 * hook's 30 s ceiling — about two and three-quarter minutes in all.
 */
export const OUTAGE_MAX_RETRIES = 8;

/** The wait before automatic retry `attempt` (0-based) of `outage`. */
export function outageRetryMs(attempt: number, outage: StoreOutage): number {
  return retryDelayMs(attempt, OUTAGE_RETRY_BASE_MS, outage);
}

export type OutageRetry = {
  /** Automatic retries spent on the outage now showing. */
  attempts: number;
  /** The budget is spent: nothing more is asked until the reader asks. */
  gaveUp: boolean;
  /** A fresh budget, for a reader who has just asked again themselves. */
  resetBudget: () => void;
};

export function useOutageRetry(
  outage: StoreOutage | null,
  retry: () => void,
  enabled = true,
): OutageRetry {
  const [attempts, setAttempts] = useState(0);
  // Read by the timer effect, which must not re-arm on its own count.
  const attemptsRef = useRef(0);
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });

  // An outage that ended leaves the whole budget for the next one.
  useEffect(() => {
    if (outage !== null) return;
    attemptsRef.current = 0;
    setAttempts(0);
  }, [outage]);

  useEffect(() => {
    if (outage === null || !enabled) return;
    if (attemptsRef.current >= OUTAGE_MAX_RETRIES) return;
    const dueAtMs = Date.now() + outageRetryMs(attemptsRef.current, outage);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hidden = () => document.visibilityState === "hidden";
    const fire = () => {
      timer = undefined;
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      retryRef.current();
    };
    const arm = () => {
      if (hidden() || timer !== undefined) return;
      timer = setTimeout(fire, Math.max(0, dueAtMs - Date.now()));
    };
    const onVisibilityChange = () => {
      if (hidden()) {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [outage, enabled]);

  const resetBudget = useCallback(() => {
    attemptsRef.current = 0;
    setAttempts(0);
  }, []);

  return {
    attempts,
    gaveUp: outage !== null && attempts >= OUTAGE_MAX_RETRIES,
    resetBudget,
  };
}
