"use client";
/**
 * Shared state machine for user-triggered async actions (button-driven
 * fetches / mutations). Replaces the hand-rolled {data, busy, err} +
 * try/catch/finally blocks scattered across the PDAX panels.
 *
 * - `run(...args)` invokes the latest `fn`, tracking `pending` and storing
 *   the resolved value in `data`. It resolves to the value on success and
 *   `undefined` on failure (the error is captured in `error`).
 * - Errors are normalized with `toMessage` so users never see the literal
 *   "Error: " prefix that `String(e)` produces.
 * - `data` is retained across failures and re-runs; call `reset()` first
 *   when the UI should drop stale results while a new run is in flight.
 * - `cause` is what the last failed run rejected with, as thrown — for a
 *   caller that must tell failures apart by more than their sentence (an
 *   outage to retry, lib/store-outage). Unlike `error` it is NOT cleared
 *   when a run starts, so the failure a retry is answering stays known while
 *   that retry is out; a success or `reset()` clears it.
 * - Overlapping runs: only the latest `run()` commits state — a slower older
 *   run's settle is discarded (its returned promise still resolves to its own
 *   value). Settles that land after unmount never set state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { botCheckMessage } from "./bot-check-message";

/** Normalize a thrown value into a user-facing message. A refusal by the
 * BotID guard (lib/bot-check-message.ts) reads as its plain sentence, not as
 * "POST /orchestrator/decompose → 403 — …". */
export function toMessage(e: unknown): string {
  return botCheckMessage(e) ?? (e instanceof Error ? e.message : String(e));
}

export type UseAsyncActionResult<Args extends unknown[], T> = {
  run: (...args: Args) => Promise<T | undefined>;
  data: T | null;
  error: string | null;
  /** The last failed run's rejection, as thrown; null after a success. */
  cause: unknown;
  pending: boolean;
  reset: () => void;
};

export function useAsyncAction<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
): UseAsyncActionResult<Args, T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  // Always call the latest `fn` without forcing callers to memoize it.
  // Synced in an effect — not during render — so render stays side-effect
  // free (concurrent renders may be thrown away).
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  // Monotonic id of the latest run(): an earlier run that settles after a
  // newer one started must not commit its result/error over the newer run's.
  const runIdRef = useRef(0);
  // Cleared on unmount so a late settle never sets state on a dead component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args): Promise<T | undefined> => {
    const id = ++runIdRef.current;
    const current = () => mountedRef.current && runIdRef.current === id;
    setError(null);
    setPending(true);
    try {
      const result = await fnRef.current(...args);
      if (current()) {
        setData(result);
        setCause(null);
      }
      return result;
    } catch (e) {
      if (current()) {
        setError(toMessage(e));
        setCause(e);
      }
      return undefined;
    } finally {
      if (current()) setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setCause(null);
  }, []);

  return { run, data, error, cause, pending, reset };
}
