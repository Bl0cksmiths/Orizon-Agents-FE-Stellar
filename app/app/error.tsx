"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ERROR_COPY } from "@/lib/error-recovery";
import { focusRing } from "@/lib/ui";
import { useErrorRecovery } from "@/lib/use-error-recovery";

/**
 * The console's error screen: catches a failed /app page so the sidebar and
 * topbar survive it, and keeps the visitor in the console — Reload, or back to
 * the overview. A deploy-skew chunk error reloads by itself
 * (lib/use-error-recovery.ts). The overview link is a plain anchor: after a
 * failure a full page load is the dependable way out.
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { kind, phase, headingRef, reload } = useErrorRecovery(error);

  if (phase === "reloading") {
    return (
      <p
        role="status"
        data-error-boundary="console"
        className="py-16 text-center font-mono text-xs text-muted"
      >
        {ERROR_COPY.reloading}
      </p>
    );
  }

  return (
    <div
      data-error-boundary="console"
      className="flex min-h-[60vh] items-center justify-center"
    >
      <Card className="w-full max-w-md px-5 py-8 text-center sm:px-8 sm:py-10">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-text focus:outline-none"
        >
          {ERROR_COPY.heading}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {ERROR_COPY.message[kind]}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-5 sm:flex-row">
          <Button onClick={reload}>Reload</Button>
          <a
            href="/app"
            className={`font-mono text-xs uppercase tracking-[0.18em] text-cyan underline decoration-cyan/40 underline-offset-4 transition-colors hover:decoration-cyan ${focusRing}`}
          >
            Back to the overview
          </a>
        </div>
      </Card>
    </div>
  );
}
