/**
 * Orchestrator v2 in the trace: the planning stages marked as stages, and
 * each step's tier and model beside it — and an older run's trace unchanged.
 *
 * Run isolated:  E2E_PORT=3861 npx playwright test e2e/trace-stages.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { disputeScan } from "./dispute-axe";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockDisputeTrace,
  mockSettledNoArtifact,
  mockSettlementView,
  mockTraceStream,
} from "./mocks";
import { mockTraceV2 } from "./plan-v2-fixtures";

/** The trace log's rows, in order. */
const rows = (page: Page) =>
  page.locator("div.bg-\\[\\#060010\\] > div").filter({ hasText: /\S/ });

async function open(page: Page, lines = mockTraceV2) {
  await mockApi(page, { artifact: mockSettledNoArtifact });
  await mockTraceStream(page, mockDisputeTaskId, lines);
  await mockDisputeApi(page, {
    settlement: mockSettlementView({
      settledAtS: Math.floor(Date.now() / 1000) - 60 * 60,
    }),
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("sealed", { exact: true })).toBeVisible();
}

test.describe("the trace under orchestrator v2", () => {
  test("marks the planning stages by the backend's wording", async ({
    page,
  }) => {
    await open(page);
    const stage = (msg: string) => rows(page).filter({ hasText: msg });
    // By the mark's words, not the line's: "checked" is in the line itself.
    const mark = (word: string) =>
      new RegExp(`planning stage:\\W*${word}`, "i");
    await expect(stage("Request checked by jev")).toContainText(mark("check"));
    await expect(stage("Prompt improved by")).toContainText(mark("brief"));
    await expect(stage("re-checked by jev")).toContainText(mark("recheck"));
    await expect(stage("Planned by Claude Opus 5.5")).toContainText(
      mark("plan"),
    );
    await expect(page.getByText(/planning stage/i)).toHaveCount(4);
  });

  test("leaves a step line, which names its own model, unmarked", async ({
    page,
  }) => {
    await open(page);
    const step = rows(page).filter({
      hasText: "seo.brief on Claude Haiku 4.5",
    });
    await expect(step).toContainText("(tier: low)");
    await expect(step).not.toContainText(/planning stage/i);
    await expect(step.getByText("Claude Haiku 4.5")).toHaveCount(1);
    // Contrast judged with the card's decor flattened (e2e/dispute-axe.ts).
    expect(await disputeScan(page)).toEqual([]);
  });

  test("an older run's trace carries no marks", async ({ page }) => {
    await open(page, mockDisputeTrace);
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByText(/planning stage/i)).toHaveCount(0);
    await expect(page.getByText(/\btier\b/i)).toHaveCount(0);
  });

  test("nothing in the log widens the page at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scroll).toBeLessThanOrEqual(360);
  });
});
