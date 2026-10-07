"use client";

import dynamic from "next/dynamic";

/**
 * Vercel Web Analytics and Speed Insights, each in a chunk of its own that
 * loads after the page has hydrated. They draw nothing and report only, so
 * the page never waits for them, and out of the root layout's own chunk a
 * failure to fetch one is theirs alone: the root layout wraps each in a
 * local boundary (components/isolate.tsx), so a lost chunk costs a visit's
 * analytics, never the page.
 */
export const Analytics = dynamic(
  () => import("@vercel/analytics/next").then((m) => m.Analytics),
  { ssr: false },
);

export const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights),
  { ssr: false },
);
