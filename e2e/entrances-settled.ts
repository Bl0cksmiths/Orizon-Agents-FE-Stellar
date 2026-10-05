import type { Page } from "@playwright/test";

/**
 * Waits until every CSS entrance in flight on the page has run out.
 *
 * The public pages animate in with CSS (`.enter` plays on first paint,
 * `.reveal` on scrolling into view; app/globals.css), so they fade from the
 * very first frame, before any script. An axe scan that lands mid-fade
 * measures text at partial opacity: a contrast "violation" that lasts a few
 * frames and never exists on the settled page. Endless decoration (the agent
 * ticker, the logo's shimmer) never finishes, so it is not waited for.
 *
 * The framer-motion entrances of the console are e2e/motion-settled.ts.
 */
export async function entrancesSettled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
