/**
 * Accessibility gate.
 *
 * Runs axe-core against the public marketing page and the console routes a
 * visitor actually lands on, asserting no WCAG 2.0/2.1 A or AA violations.
 * The point is regression protection: the a11y fixes in this repo (focus
 * rings, the inert mobile drawer, landmark structure, tab semantics) were
 * found by hand once, and without a gate they can quietly come back.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockApi } from "./mocks";

const ROUTES = [
  "/",
  "/app",
  "/app/agents",
  "/app/register",
  "/app/bind",
  "/app/operator",
  "/app/reputation",
  "/app/orchestrator",
  "/app/trace",
  "/app/events",
  "/app/send",
  "/app/flow",
  "/app/pdax",
  "/app/wallet",
];

test.describe("accessibility", () => {
  for (const route of ROUTES) {
    test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
      await mockApi(page);
      await page.goto(route);

      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      // Mapped to readable lines so a failure names the rule and the count
      // instead of dumping the whole axe result object.
      const summary = violations.map(
        (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
      );
      expect(summary).toEqual([]);
    });
  }
});
