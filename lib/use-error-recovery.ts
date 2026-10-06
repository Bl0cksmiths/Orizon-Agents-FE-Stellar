"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  claimAutoReload,
  classifyError,
  type ErrorKind,
} from "./error-recovery";
import { reportClientError } from "./report-error";

/** How long the "loading the latest version" state may last before the error
 * screen replaces it: a reload that has not taken the page away by then was
 * blocked or is not coming. */
export const RELOAD_FALLBACK_MS = 10_000;

export type RecoveryPhase =
  /** An automatic reload is under way; no error screen. */
  | "reloading"
  /** The error screen is showing. */
  | "failed";

export type RecoveryDeps = {
  reload: () => void;
  report: typeof reportClientError;
  getStorage: () => Storage;
  now: () => number;
  route: () => string;
};

const browserDeps: RecoveryDeps = {
  reload: () => window.location.reload(),
  report: reportClientError,
  getStorage: () => window.sessionStorage,
  now: Date.now,
  route: () => window.location.pathname,
};

/**
 * What an error boundary does with the error it caught.
 *
 * A chunk error (lib/error-recovery.ts) reloads the page once by itself, and
 * the boundary shows a quiet "loading" state instead of an error screen. Any
 * other error, or a chunk error the reload did not fix, shows the screen, and
 * its heading takes focus so assistive technology announces what happened.
 * Every error is reported once, with what was done about it.
 */
export function useErrorRecovery(
  error: Error & { digest?: string },
  deps: RecoveryDeps = browserDeps,
) {
  const kind: ErrorKind = useMemo(() => classifyError(error), [error]);
  const [phase, setPhase] = useState<RecoveryPhase>(
    kind === "chunk" ? "reloading" : "failed",
  );
  // Which error was handled and how, so a re-render, or React re-running the
  // effect in development, never reloads or reports it twice.
  const handled = useRef<{ error: Error; autoReload: boolean } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (handled.current?.error !== error) {
      const autoReload =
        kind === "chunk" && claimAutoReload(deps.getStorage, deps.now());
      handled.current = { error, autoReload };
      deps.report(error, {
        kind,
        route: deps.route(),
        recovery: autoReload ? "auto-reload" : "shown",
      });
      if (autoReload) deps.reload();
    }
    if (!handled.current.autoReload) {
      setPhase("failed");
      return;
    }
    setPhase("reloading");
    const fallback = setTimeout(() => setPhase("failed"), RELOAD_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [error, kind, deps]);

  useEffect(() => {
    if (phase === "failed") headingRef.current?.focus();
  }, [phase]);

  return { kind, phase, headingRef, reload: deps.reload };
}
