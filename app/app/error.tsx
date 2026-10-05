"use client";

import { useEffect } from "react";
import { classifyError } from "@/lib/error-recovery";
import { reportClientError } from "@/lib/report-error";
import { Button } from "@/components/ui/button";

/**
 * Console-scoped error boundary: catches render errors inside /app pages so
 * the sidebar/topbar shell survives a page-level crash.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      kind: classifyError(error),
      route: window.location.pathname,
      recovery: "shown",
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="clip-cyber w-full max-w-md border border-magenta/40 bg-surface/60 px-6 py-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-magenta">
          {"// subsystem fault"}
        </p>
        <h2 className="mt-4 font-display text-xl tracking-[0.2em] text-text neon-text sm:text-2xl">
          SUBSYSTEM FAULT
        </h2>
        <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
          This console module hit an unexpected error. The rest of the network
          is unaffected — retry the operation.
        </p>
        <div className="mt-8">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
