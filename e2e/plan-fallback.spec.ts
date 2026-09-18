/**
 * The planner-fallback notice on the plan card.
 *
 * When the LLM planner fails or answers with nothing usable, the backend
 * serves a minimal plan from agents that cleared the routing checks and sets
 * `planner_fallback`. The card has to say so before the buyer pays, point the
 * Authorize control at it, and offer to ask the planner again.
 *
 * In keeping with e2e/plan-floor.spec.ts, these assert structure, geometry and
 * behaviour — where the notice sits, what describes the button, what a retry
 * sends — and match copy only on the one anchor word a claim cannot be made
 * without, so the wording can still improve under them.
 *
 * Run isolated, always:  E2E_PORT=3271 npx playwright test e2e/plan-fallback.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { mockApi, mockWallet } from "./mocks";
import { mockPlanPlannerFallback } from "./plan-fixtures";
import type { DecomposeResponse } from "../lib/types";

type Viewport = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

/** A laptop browser window's content box, as in e2e/plan-floor.spec.ts. */
const LAPTOP: Viewport = { width: 1440, height: 900 };

/**
 * The notice, by live-region role plus the one word it cannot mean anything
 * without. The role is part of the contract, not a wording constraint: a
 * notice with none is never announced to a screen-reader buyer at all.
 */
const fallbackNotice = (page: Page) =>
  page.locator('[role="status"]').filter({ hasText: /fallback/i });

/**
 * A bounding box read only once it has stopped moving. The card slides in
 * under framer-motion, so a box read on arrival measures the animation and
 * not the layout.
 */
async function stableBox(target: Locator): Promise<Box> {
  let previous = "";
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox();
        const current = box === null ? "" : JSON.stringify(box);
        const settled = current !== "" && current === previous;
        previous = current;
        return settled;
      },
      { timeout: 15_000, message: "element never settled into a stable box" },
    )
    .toBe(true);
  const box = await target.boundingBox();
  if (box === null) throw new Error("expected a laid-out element");
  return box;
}

/** Drives a real decompose against a chosen plan. */
async function decomposeWith(
  page: Page,
  plan: DecomposeResponse,
  options: { wallet?: boolean } = {},
): Promise<void> {
  if (options.wallet) await mockWallet(page);
  await mockApi(page, { plan });
  await page.goto("/app/orchestrator");
  await page.getByRole("textbox", { name: /intent/i }).fill(plan.intent);
  await page.getByRole("button", { name: /decompos/i }).click();
  await expect(
    page.getByRole("heading", { name: /execution plan/i }),
  ).toBeVisible();
}

test.describe("plan card — a plan built without the planner", () => {
  test("the fallback notice is painted above Authorize and Simulate", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    // Connected, so the Authorize control exists: the notice is about the
    // moment money is committed.
    await decomposeWith(page, mockPlanPlannerFallback, { wallet: true });

    const notice = fallbackNotice(page);
    await expect(notice).toHaveCount(1);
    const noticeBox = await stableBox(notice);

    // Geometry, not DOM order: a notice first in the markup but painted below
    // the buttons is one the buyer reads after paying. No overlap either.
    for (const name of [/authorize/i, /simulate/i]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      const buttonBox = await stableBox(button);
      expect(
        noticeBox.y + noticeBox.height,
        `the notice must clear the top edge of the ${name.source} button`,
      ).toBeLessThanOrEqual(buttonBox.y);
    }
  });
});
