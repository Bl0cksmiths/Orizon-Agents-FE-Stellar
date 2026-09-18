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
import AxeBuilder from "@axe-core/playwright";
import { mockApi, mockPlanExcluded, mockWallet } from "./mocks";
import {
  mockDecomposeSequence,
  mockPlanPlannerAnswered,
  mockPlanPlannerFallback,
  mockPlanPlannerFallbackUnread,
} from "./plan-fixtures";
import type { DecomposeResponse } from "../lib/types";

type Viewport = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

/** A laptop browser window's content box, as in e2e/plan-floor.spec.ts. */
const LAPTOP: Viewport = { width: 1440, height: 900 };

/** The narrow end of the phones that reach this console. */
const PHONE: Viewport = { width: 390, height: 844 };

/**
 * Horizontal containment, the direction that cannot be recovered by
 * scrolling: the console hides sideways overflow. Fails naming the element
 * and the edge it crossed.
 */
function expectWithinWidth(box: Box, frame: Viewport, what: string) {
  expect(box.x, `${what} is cut off at the left edge`).toBeGreaterThanOrEqual(
    0,
  );
  expect(
    box.x + box.width,
    `${what} runs past the ${frame.width}px frame`,
  ).toBeLessThanOrEqual(frame.width);
}

/**
 * The notice, by live-region role plus the one word it cannot mean anything
 * without. The role is part of the contract, not a wording constraint: a
 * notice with none is never announced to a screen-reader buyer at all.
 */
const fallbackNotice = (page: Page) =>
  page.locator('[role="status"]').filter({ hasText: /fallback/i });

/** The plan's step rows — the first ordered list in the card. */
const steps = (page: Page) => page.locator("ol").first().getByRole("listitem");

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

  /** The two card states the notice appears in: alone, and stacked with the
   *  reputation banner — the most crowded the pay panel's approach gets. */
  const fallbackStates: { name: string; plan: DecomposeResponse }[] = [
    { name: "the fallback notice", plan: mockPlanPlannerFallback },
    {
      name: "the fallback notice and the reputation banner",
      plan: mockPlanPlannerFallbackUnread,
    },
  ];

  // A violet frame, a badge and a glyph carrying meaning, a live region, a
  // button described by one or two of them, and a second button beside the
  // notice — each exactly what axe exists to check.
  for (const { name, plan } of fallbackStates) {
    test(`with ${name}, the card has no WCAG A/AA violations`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await decomposeWith(page, plan, { wallet: true });
      await expect(fallbackNotice(page)).toHaveCount(1);
      // Settled, so axe measures the painted colours rather than a frame of
      // the entry fade.
      await stableBox(fallbackNotice(page));

      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(
        violations.map(
          (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
        ),
      ).toEqual([]);
    });
  }

  for (const { name, plan } of fallbackStates) {
    test(`at 390px, ${name} fit without sideways scroll or clipping`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await decomposeWith(page, plan, { wallet: true });

      const notice = fallbackNotice(page);
      await expect(notice).toHaveCount(1);
      // The clipped frame the notice and its retry share.
      const frame = notice.locator("..");
      const frameBox = await stableBox(frame);
      expectWithinWidth(frameBox, PHONE, "the fallback notice");

      // Measured against the frame rather than the viewport: `clip-cyber-sm`
      // cuts off whatever overflows it, so a button past the frame's edge is
      // gone even while the page has room for it.
      const retryBox = await stableBox(
        frame.getByRole("button", { name: /ask the planner again/i }),
      );
      expect(
        retryBox.x + retryBox.width,
        "the retry runs past the notice frame",
      ).toBeLessThanOrEqual(frameBox.x + frameBox.width + 0.5);
      // Nothing inside overflows the frame either — a badge or heading that
      // could not wrap would be clipped, not scrolled to.
      expect(
        await frame.evaluate((el) => el.scrollWidth - el.clientWidth),
        "the notice's content overflows its frame",
      ).toBeLessThanOrEqual(0);

      if (plan.reputation_degraded) {
        expectWithinWidth(
          await stableBox(estimateBanner(page)),
          PHONE,
          "the reputation banner",
        );
      }

      // Still above the pay controls once they wrap at phone width, and the
      // controls still inside the row that holds them.
      const controls = page
        .locator("div")
        .filter({ has: page.getByText(/authorizing up to/i) })
        .filter({ has: page.getByRole("button", { name: /authorize/i }) })
        .last();
      const row = await stableBox(controls);
      const noticeBox = await stableBox(notice);
      for (const name of [/simulate/i, /fiat/i, /authorize/i]) {
        const button = await stableBox(controls.getByRole("button", { name }));
        expect(
          button.x + button.width,
          `the ${name.source} button runs past its row`,
        ).toBeLessThanOrEqual(row.x + row.width + 0.5);
        expect(
          noticeBox.y + noticeBox.height,
          `the notice must clear the ${name.source} button`,
        ).toBeLessThanOrEqual(button.y);
      }

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(
        1,
      );
    });
  }

  test("asking the planner again re-runs the same intent and replaces the fallback", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await mockApi(page);
    // After `mockApi`, so it answers decompose ahead of the catch-all: the
    // fallback first, then the planner's own plan once it answers.
    const asked = await mockDecomposeSequence(page, [
      mockPlanPlannerFallback,
      mockPlanPlannerAnswered,
    ]);
    await page.goto("/app/orchestrator");

    const intentBox = page.getByRole("textbox", { name: /intent/i });
    await intentBox.fill(mockPlanPlannerFallback.intent);
    await page.getByRole("button", { name: /decompos/i }).click();
    await expect(fallbackNotice(page)).toHaveCount(1);
    await expect(steps(page)).toHaveCount(mockPlanPlannerFallback.steps.length);

    // The buyer starts typing something else before retrying. The retry is
    // about the plan on the card, so it must ask the planner what that plan
    // answered — not whatever the box says now.
    await intentBox.fill("a different intent, not yet submitted");
    await page.getByRole("button", { name: /ask the planner again/i }).click();

    await expect(page.getByText(mockPlanPlannerAnswered.plan_id)).toBeVisible();
    await expect(fallbackNotice(page)).toHaveCount(0);
    await expect(steps(page)).toHaveCount(mockPlanPlannerAnswered.steps.length);
    expect(asked).toEqual([
      mockPlanPlannerFallback.intent,
      mockPlanPlannerFallback.intent,
    ]);
  });
});
