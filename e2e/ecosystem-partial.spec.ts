/**
 * A partial adoption report (`complete: false`) on the Ecosystem page: marked
 * as lower bounds, with its coverage, above the targets — and a complete
 * report, or one from a backend predating the field, unmarked.
 *
 * Run isolated:  E2E_PORT=3861 npx playwright test e2e/ecosystem-partial.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { disputeScan } from "./dispute-axe";
import { mockAdoptionWithOperator, mockApi } from "./mocks";

const partial = {
  ...mockAdoptionWithOperator,
  degraded: true,
  complete: false,
  coverage: {
    agents_listed: 1_204,
    agents_accounted: 1_187,
    settlement_ledgers_scanned: 61_400,
    settlement_ledgers_in_window: 120_960,
    external_charges: 42,
    external_charges_unattributed: 5,
  },
};

const marker = (page: Page) =>
  page.getByRole("region", { name: /partial report/i });

test.describe("the ecosystem page's partial marker", () => {
  test("marks a partial report's figures as lower bounds, above the targets", async ({
    page,
  }) => {
    await mockApi(page, { adoption: partial });
    await page.goto("/app/ecosystem");
    await expect(marker(page)).toContainText(
      "Partial — figures are lower bounds, refreshing.",
    );
    await expect(marker(page)).toContainText(
      "Agents accounted for: 1,187 of 1,204 listed.",
    );
    await expect(marker(page)).toContainText(
      "Settlement history read: 61,400 of 120,960 ledgers.",
    );
    const markerBox = await marker(page).boundingBox();
    const targets = await page
      .getByRole("heading", { name: "SOW §6.3 targets" })
      .boundingBox();
    expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(targets!.y);
    await expect(page.getByText(/^A lower bound/)).toHaveCount(3);
    expect(await disputeScan(page)).toEqual([]);
  });

  for (const [name, adoption] of [
    ["a complete report", { ...mockAdoptionWithOperator, complete: true }],
    ["a backend predating the field", mockAdoptionWithOperator],
  ] as const) {
    test(`shows no marker for ${name}`, async ({ page }) => {
      await mockApi(page, { adoption });
      await page.goto("/app/ecosystem");
      await expect(
        page.getByRole("heading", { name: "SOW §6.3 targets" }),
      ).toBeVisible();
      await expect(marker(page)).toHaveCount(0);
      await expect(page.getByText(/lower bound/i)).toHaveCount(0);
    });
  }

  test("the marker stays inside a 360px frame", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockApi(page, { adoption: partial });
    await page.goto("/app/ecosystem");
    await expect(marker(page)).toBeVisible();
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scroll).toBeLessThanOrEqual(360);
  });
});
