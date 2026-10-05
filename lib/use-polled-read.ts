"use client";
/**
 * One panel's polled read: its data, its own error, its own retry. Built on
 * `usePolling` for pages that refresh on a cadence (the Overview), so that
 * one failing read takes down its own panel and no other — the figures stay
 * up when the task list fails, and the reverse.
 *
 * - A transient failure keeps polling with backoff; a terminal one (a 4xx
 *   that will not fix itself, see `isTransientFetchError`) stops the loop and
 *   leaves the panel's retry as the way back.
 * - The last data stays on screen through a failure; `dataAt` dates it,
 *   from a cached answer's own backend read time when it has one.
 * - `waiting` is true while nothing has landed and the read is either still
 *   out or answered "waking" (lib/api.ts `isWakingError`): a wait, shown as
 *   one, never as an error.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isWakingError, readAtOf } from "./api-freshness";
import { isTransientFetchError } from "./use-fetch";
import { usePolling } from "./use-polling";

export type PolledRead<T> = {
  data: T | null;
  error: string | null;
  /** The last failure will not resolve on its own; polling has stopped. */
  terminal: boolean;
  /** A manual retry is running. */
  retrying: boolean;
  retry: () => void;
  /** When the data on screen was read from the backend; null with none. */
  dataAt: number | null;
  waiting: boolean;
};

const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : String(e ?? "fetch failed");

export function usePolledRead<T>(
  read: () => Promise<T>,
  intervalMs: number,
): PolledRead<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<number | null>(null);

  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  // Results that land after unmount are dropped.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await readRef.current();
      if (!alive.current) return;
      setData(next);
      setArrivedAt(Date.now());
      setError(null);
      setTerminal(false);
    } catch (e) {
      if (!alive.current) throw e;
      setError(messageOf(e));
      setTerminal(!isTransientFetchError(e));
      throw e;
    }
  }, []);

  // A terminal failure stops the loop — re-polling a 404 every few seconds
  // is noise, and the panel's retry is the way back.
  usePolling(load, intervalMs, { enabled: !terminal });

  const retry = useCallback(() => {
    setRetrying(true);
    load()
      .catch(() => {
        /* recorded by load */
      })
      .finally(() => {
        if (alive.current) setRetrying(false);
      });
  }, [load]);

  const dataAt = data === null ? null : (readAtOf(data) ?? arrivedAt);
  const waiting = data === null && (error === null || isWakingError(error));
  return { data, error, terminal, retrying, retry, dataAt, waiting };
}
