"use client";

import { Button } from "@/components/ui/button";
import { ERROR_COPY } from "@/lib/error-recovery";
import { focusRing } from "@/lib/ui";
import { useErrorRecovery } from "@/lib/use-error-recovery";

/**
 * The site's error screen, for any page under the root layout.
 *
 * A page that failed because its code changed under it (a deploy landed while
 * it was open) reloads by itself and shows only a quiet loading line; see
 * lib/use-error-recovery.ts. Anything else gets a calm screen with a Reload
 * button and a way home. The home link is a plain anchor: after a failure a
 * full page load is the dependable way out.
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { kind, phase, headingRef, reload } = useErrorRecovery(error);

  return (
    // <main id="main"> keeps the root layout's skip link functional here.
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center sm:px-6"
    >
      {phase === "reloading" ? (
        <p role="status" className="font-mono text-xs text-muted">
          {ERROR_COPY.reloading}
        </p>
      ) : (
        <div className="w-full max-w-md">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight text-text focus:outline-none sm:text-3xl"
          >
            {ERROR_COPY.heading}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {ERROR_COPY.message[kind]}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Button onClick={reload}>Reload</Button>
            <a
              href="/"
              className={`font-mono text-xs uppercase tracking-[0.18em] text-cyan underline decoration-cyan/40 underline-offset-4 transition-colors hover:decoration-cyan ${focusRing}`}
            >
              Go to the home page
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
