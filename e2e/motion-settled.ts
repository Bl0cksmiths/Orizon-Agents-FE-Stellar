import { expect, type Locator } from "@playwright/test";

/**
 * Waits until every framer-motion entrance inside `scope` has finished.
 *
 * framer-motion animates `opacity` through an inline style, and an axe scan
 * that lands mid-fade measures text painted at partial opacity — a contrast
 * "violation" that exists for a few frames and never on the settled page. It
 * shows up only under load (CI, parallel workers), which is what made the plan
 * card's scans flaky: the card fades in over 0.4 s and its step rows stagger
 * in after it. Elements left translucent on purpose do it through classes,
 * not inline styles, so they never hold this up.
 */
export async function motionSettled(scope: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        scope.evaluate((root) => {
          const faded = (el: Element) => {
            const { opacity } = (el as HTMLElement).style;
            return opacity !== "" && opacity !== "1";
          };
          return (
            Array.from(root.querySelectorAll('[style*="opacity"]')).filter(
              faded,
            ).length + (faded(root) ? 1 : 0)
          );
        }),
      { message: "an entrance animation is still fading in", timeout: 5_000 },
    )
    .toBe(0);
}
