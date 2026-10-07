"use client";

import { useEffect } from "react";
import { faultPoint } from "@/lib/fault-injection";

/**
 * Wakes the backend while the visitor reads the landing page.
 *
 * The API sleeps on Render's free tier and takes 30-60s to boot, so the first
 * request from the console used to eat that entire wait in a loading state.
 * Mounting this on the marketing page spends the reading time instead: by the
 * time anyone clicks through to /app the service is usually already up.
 *
 * Deliberately fire-and-forget — `/api/health` is cheap and exempt from the
 * rate limiter, a failure means the console will simply do what it did before,
 * and the request is never awaited so it cannot delay hydration or paint.
 */
const WARMED_KEY = "orizon:backend-warmed";

export function BackendWarmup() {
  faultPoint("backend-warmup");
  useEffect(() => {
    // One wake per tab session — re-firing on every marketing navigation would
    // add load without shortening any wait.
    try {
      if (sessionStorage.getItem(WARMED_KEY)) return;
      sessionStorage.setItem(WARMED_KEY, "1");
    } catch {
      // Private-mode storage denial shouldn't cost us the warm-up.
    }

    const controller = new AbortController();
    fetch("/api/health", {
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => {
      /* the console surfaces backend failures; this is best-effort only */
    });

    return () => controller.abort();
  }, []);

  return null;
}
