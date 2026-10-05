"use client";
/**
 * "as of 12:04 · 5m ago" — for figures that arrived fine but are old.
 *
 * The console's cache (lib/api-proxy.ts) never answers an outage with an
 * error while it holds a copy: it answers 200 with the copy and its backend
 * read time. Nothing has failed, so `StaleBadge` (which marks a failed
 * refresh) stays quiet — and without this, minutes-old figures would read as
 * live. Fresh data renders nothing; data older than `staleAfterMs` says how
 * old it is.
 *
 * Not a live region: the age changes on its own, and announcing it would
 * interrupt a screen reader for no new information. The full sentence is in
 * the element's text for whoever reads the page.
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatAge } from "@/components/ui/stale-badge";
import { cn } from "@/lib/utils";

/** Older than this, figures say how old they are. Comfortably past the
 * cache's 15 s freshness plus a background refresh. */
export const OLD_DATA_AFTER_MS = 60_000;

export function DataAge({
  at,
  what,
  staleAfterMs = OLD_DATA_AFTER_MS,
  className,
}: {
  /** When the figures were read from the network (epoch ms), or null. */
  at: number | null | undefined;
  /** What is dated, for the sentence: "network metrics". */
  what: string;
  staleAfterMs?: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [at]);

  if (at == null || now - at < staleAfterMs) return null;
  const time = new Date(at).toLocaleTimeString();
  return (
    <span
      data-data-age=""
      title={`Showing ${what} as read at ${time}; the network has not sent newer figures since.`}
      className={cn("inline-flex max-w-full", className)}
    >
      <Badge tone="muted" className="max-w-full">
        <span aria-hidden="true">
          as of {time} · {formatAge(now - at)}
        </span>
        <span className="sr-only">
          Showing {what} as read at {time}; the network has not sent newer
          figures since.
        </span>
      </Badge>
    </span>
  );
}
