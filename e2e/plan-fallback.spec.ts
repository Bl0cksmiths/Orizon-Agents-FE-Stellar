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
import { mockApi, mockPlanExcluded, mockWallet } from "./mocks";
import {
  mockPlanPlannerAnswered,
  mockPlanPlannerFallback,
  mockPlanPlannerFallbackUnread,
} from "./plan-fixtures";
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

/** The unverified-reputation banner, located as e2e/plan-floor.spec.ts does. */
const estimateBanner = (page: Page) =>
  page
    .locator('[role="status"], [role="alert"]')
    .filter({ hasText: /estimat/i });

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

  // False is the planner's own plan; absent is a backend predating the flag.
  // Neither is a fallback, and a notice on every plan is one buyers learn to
  // scroll past.
  const plannedPlans: { name: string; plan: DecomposeResponse }[] = [
    { name: "the planner built the plan", plan: mockPlanPlannerAnswered },
    { name: "the backend predates the flag", plan: mockPlanExcluded },
  ];
  for (const { name, plan } of plannedPlans) {
    test(`no fallback notice when ${name}`, async ({ page }) => {
      await page.setViewportSize(LAPTOP);
      await decomposeWith(page, plan, { wallet: true });
      await expect(
        page.getByRole("button", { name: /authorize/i }),
      ).toBeVisible();
      await expect(fallbackNotice(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /ask the planner again/i }),
      ).toHaveCount(0);
    });
  }

  test("Authorize is described by the fallback notice", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await decomposeWith(page, mockPlanPlannerFallback, { wallet: true });

    const authorize = page.getByRole("button", { name: /authorize/i });
    await expect(authorize).toBeVisible();

    // Tab reaches this button without passing through a polite status that
    // was announced once, when the plan rendered. The description is what
    // puts the fact in front of a keyboard buyer at the moment of paying, so
    // it has to resolve to the notice itself.
    const noticeId = await fallbackNotice(page).getAttribute("id");
    expect(noticeId, "the notice carries no id to be named by").toBeTruthy();
    await expect(authorize).toHaveAttribute("aria-describedby", noticeId ?? "");
    await expect(authorize).toHaveAccessibleDescription(/fallback/i);
    // The retry sits beside the notice, not in it: a button label read out as
    // part of Authorize's description would be noise at the worst moment.
    await expect(authorize).not.toHaveAccessibleDescription(/ask the planner/i);
  });

  test("with a failed read as well, Authorize is described by both notices", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await decomposeWith(page, mockPlanPlannerFallbackUnread, { wallet: true });

    const authorize = page.getByRole("button", { name: /authorize/i });
    await expect(authorize).toBeVisible();
    await expect(fallbackNotice(page)).toHaveCount(1);
    await expect(estimateBanner(page)).toHaveCount(1);

    // Composed, never overwritten: one notice must not push the other out of
    // the description, and both are named in the order they are read.
    const noticeId = await fallbackNotice(page).getAttribute("id");
    const bannerId = await estimateBanner(page).getAttribute("id");
    const describedBy = await authorize.getAttribute("aria-describedby");
    expect(describedBy?.split(/\s+/)).toEqual([noticeId, bannerId]);
    await expect(authorize).toHaveAccessibleDescription(
      /fallback[\s\S]*estimat/i,
    );
  });
});
