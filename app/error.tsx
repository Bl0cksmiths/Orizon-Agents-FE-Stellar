"use client";

import { useEffect } from "react";
import { classifyError } from "@/lib/error-recovery";
import { reportClientError } from "@/lib/report-error";
import { Button } from "@/components/ui/button";

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
    // <main id="main"> keeps the root layout's skip link functional here.
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-magenta">
        {"// system fault"}
      </p>
      <h1 className="mt-4 font-display text-2xl tracking-[0.2em] text-text neon-text sm:text-3xl">
        SYSTEM FAULT
      </h1>
      <p className="mt-4 max-w-sm font-mono text-xs leading-relaxed text-muted">
        An unexpected error interrupted this process. The rest of the network is
        unaffected — retry the operation.
      </p>
      <div className="mt-8">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
