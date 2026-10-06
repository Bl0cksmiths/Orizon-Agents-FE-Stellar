/**
 * Orchestrator v2 on the Orchestrator page: the request check's notices, the
 * "We understood this as…" brief and its edit, and the tier and model on
 * every step — against a mocked backend, and against an older backend that
 * sends none of it.
 *
 * In keeping with e2e/plan-fallback.spec.ts these assert behaviour, roles and
 * geometry, and match copy only on the words a claim cannot be made without.
 *
 * Run isolated:  E2E_PORT=3861 npx playwright test e2e/plan-understanding.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { disputeScan } from "./dispute-axe";
import { motionSettled } from "./motion-settled";
import { mockApi, mockPlan, mockWallet } from "./mocks";
import { overflowingDescendants } from "./plan-fixtures";
import {
  mockDecomposeAnswers,
  mockPlanV2,
  mockPlanV2Long,
  mockPlanV2Respecced,
  mockSpec,
  ok,
  refusal,
  type DecomposeAnswer,
} from "./plan-v2-fixtures";

const LAPTOP = { width: 1440, height: 900 };

const intentBox = (page: Page) =>
  page.getByRole("textbox", { name: /intent/i });
const decomposeButton = (page: Page) =>
  page.getByRole("button", { name: /decompos/i });
const planCard = (page: Page) =>
  page
    .locator("div.glow-card")
    .filter({ has: page.getByRole("heading", { name: /execution plan/i }) });
const brief = (page: Page) =>
  page.getByRole("region", { name: /we understood this as/i });
const steps = (page: Page) => planCard(page).locator("ol > li");
/** The check's notice: its alert region, by id — Next's route announcer is
 *  an empty alert of its own on every page. */
const notice = (page: Page) =>
  page.locator('#intent-check-notice[role="alert"]');

/** axe with the card's decor flattened, so contrast is judged rather than
 *  left "incomplete" under the gradient (see e2e/dispute-axe.ts). */
async function axe(page: Page) {
  expect(await disputeScan(page)).toEqual([]);
}

/** Opens the page with the answers queued, and submits `intent`. */
async function ask(
  page: Page,
  answers: readonly DecomposeAnswer[],
  intent = mockPlan.intent,
) {
  await mockApi(page);
  const asked = await mockDecomposeAnswers(page, answers);
  await page.goto("/app/orchestrator");
  await intentBox(page).fill(intent);
  await decomposeButton(page).click();
  return asked;
}

test.describe("orchestrator v2 — the plan card", () => {
  test("shows the brief, the provenance, and each step's tier and model", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await mockWallet(page);
    await ask(page, [ok(mockPlanV2)]);
    await expect(brief(page)).toBeVisible();
    await expect(brief(page)).toContainText(mockSpec.summary);
    await expect(brief(page)).toContainText(mockSpec.goal);
    await expect(brief(page)).toContainText("No external libraries");

    const provenance = page.getByRole("list", {
      name: /how this plan was made/i,
    });
    await expect(provenance).toContainText(/checked by jev 1\.13\.0/i);
    await expect(provenance).toContainText("Claude Sonnet 5.5");
    await expect(provenance).toContainText("Claude Opus 5.5");
    await expect(provenance).toContainText(/moderate tier/i);

    await expect(steps(page)).toHaveCount(3);
    await expect(steps(page).nth(0)).toContainText(/low tier/i);
    await expect(steps(page).nth(0)).toContainText("runs on Claude Haiku 4.5");
    await expect(steps(page).nth(1)).toContainText(/moderate tier/i);
    await expect(steps(page).nth(1)).toContainText("runs on Claude Sonnet 5.5");
    await expect(steps(page).nth(2)).toContainText(/complex tier/i);
    await expect(steps(page).nth(2)).not.toContainText("runs on");

    // The brief is read before the steps it frames.
    const briefBox = await brief(page).boundingBox();
    const stepBox = await steps(page).first().boundingBox();
    expect(briefBox!.y + briefBox!.height).toBeLessThanOrEqual(stepBox!.y);

    await motionSettled(planCard(page));
    await axe(page);
  });

  test("an edited brief re-plans the same intent with spec, and nothing else", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    const asked = await ask(page, [ok(mockPlanV2), ok(mockPlanV2Respecced)]);
    await expect(brief(page)).toBeVisible();
    // The intent box changing after the plan must not change what is asked.
    await intentBox(page).fill("something else entirely");

    await brief(page)
      .getByRole("button", { name: /edit the brief/i })
      .click();
    const goal = brief(page).getByLabel(/^goal/i);
    await expect(goal).toBeFocused();
    await brief(page)
      .getByLabel(/^deliverable/i)
      .fill("A zip with separate HTML, CSS and JS files");
    await motionSettled(planCard(page));
    await axe(page);
    await brief(page)
      .getByRole("button", { name: /re-plan/i })
      .click();

    await expect(
      page.getByText("plan plan_e2e_v2_respec", { exact: false }),
    ).toBeVisible();
    expect(asked).toHaveLength(2);
    expect(asked[0]).toEqual({ intent: mockPlan.intent });
    expect(asked[1]).toEqual({
      intent: mockPlan.intent,
      spec: {
        ...mockSpec,
        deliverable: "A zip with separate HTML, CSS and JS files",
      },
    });
    await expect(brief(page)).toContainText(
      "A zip with separate HTML, CSS and JS files",
    );
  });

  test("an unchanged brief is not sent again", async ({ page }) => {
    const asked = await ask(page, [ok(mockPlanV2)]);
    await brief(page)
      .getByRole("button", { name: /edit the brief/i })
      .click();
    await brief(page)
      .getByRole("button", { name: /re-plan/i })
      .click();
    await expect(brief(page).getByRole("status")).toContainText(
      /nothing changed/i,
    );
    expect(asked).toHaveLength(1);
  });

  test("a plan from an older backend is today's card", async ({ page }) => {
    await ask(page, [ok(mockPlan)]);
    await expect(planCard(page)).toBeVisible();
    await expect(steps(page)).toHaveCount(3);
    await expect(brief(page)).toHaveCount(0);
    await expect(
      page.getByRole("list", { name: /how this plan was made/i }),
    ).toHaveCount(0);
    await expect(planCard(page)).not.toContainText(/ tier\b/i);
    await expect(planCard(page)).not.toContainText("runs on");
  });

  for (const width of [360, 1920]) {
    test(`nothing widens the card at ${width}px, editing included`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await ask(page, [ok(mockPlanV2Long)]);
      await expect(brief(page)).toBeVisible();
      await motionSettled(planCard(page));
      expect(await overflowingDescendants(planCard(page))).toEqual([]);
      await brief(page)
        .getByRole("button", { name: /edit the brief/i })
        .click();
      expect(await overflowingDescendants(planCard(page))).toEqual([]);
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scroll).toBeLessThanOrEqual(width);
    });
  }

  test("the plan card does not shift once it has painted", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await ask(page, [ok(mockPlanV2)]);
    await expect(brief(page)).toBeVisible();
    await motionSettled(planCard(page));
    // Everything the card shows arrives with the plan, in one answer: no part
    // of it loads later and pushes the steps down under the buyer's eye.
    const before = await steps(page).first().boundingBox();
    await page.waitForTimeout(600);
    const after = await steps(page).first().boundingBox();
    expect(after).toEqual(before);
  });
});

test.describe("orchestrator v2 — the request check's notices", () => {
  test("a blocked request says why, plans nothing, and passes axe", async ({
    page,
  }) => {
    await ask(page, [
      refusal(422, "intent_blocked", {
        reason: "It asks for help getting into someone else's account.",
      }),
    ]);
    const alert = notice(page);
    await expect(alert).toContainText(/can.t plan this request/i);
    await expect(alert).toContainText(
      "It asks for help getting into someone else's account.",
    );
    await expect(alert).toContainText(/nothing was charged/i);
    await expect(alert).not.toContainText(/intent_blocked|→|422/);
    await expect(planCard(page)).toHaveCount(0);
    await axe(page);
  });

  test("a request that needs detail asks its question at the intent box", async ({
    page,
  }) => {
    const asked = await ask(
      page,
      [
        refusal(422, "intent_needs_detail", {
          question: "What should the calculator be able to do?",
        }),
        ok(mockPlanV2),
      ],
      "calc",
    );
    const alert = notice(page);
    await expect(alert).toContainText(
      "What should the calculator be able to do?",
    );
    // The answer goes in the box, so the box is where focus lands, and the
    // question is what the box is described by until it is answered.
    await expect(intentBox(page)).toBeFocused();
    await expect(intentBox(page)).toHaveAccessibleDescription(
      /what should the calculator be able to do/i,
    );
    await axe(page);

    await intentBox(page).fill("a calculator web app that adds and divides");
    await decomposeButton(page).click();
    await expect(brief(page)).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
    await expect(intentBox(page)).not.toHaveAttribute("aria-describedby", /.+/);
    expect(asked.map((a) => a.intent)).toEqual([
      "calc",
      "a calculator web app that adds and divides",
    ]);
  });

  test("an unavailable check counts down its Retry-After, then retries the same request", async ({
    page,
  }) => {
    const asked = await ask(page, [
      refusal(503, "intent_unavailable", {}, { "Retry-After": "2" }),
      ok(mockPlanV2),
    ]);
    await expect(notice(page)).toContainText(/nothing was charged/i);
    const retry = page.getByRole("button", { name: /try again/i });
    await expect(retry).toBeDisabled();
    await expect(page.getByText(/available in \d+ s/)).toBeVisible();
    await axe(page);
    await expect(retry).toBeEnabled({ timeout: 5_000 });
    await intentBox(page).fill("not what was asked");
    await retry.click();
    await expect(brief(page)).toBeVisible();
    expect(asked.map((a) => a.intent)).toEqual([
      mockPlan.intent,
      mockPlan.intent,
    ]);
  });

  test("paused planning says when it resumes, and the ready-made examples still plan", async ({
    page,
  }) => {
    const asked = await ask(page, [
      refusal(503, "planning_paused", {}, { "Retry-After": "7200" }),
      ok(mockPlanV2),
    ]);
    const alert = notice(page);
    await expect(alert).toContainText(/paused/i);
    await expect(alert).toContainText(/resumes/i);
    await expect(alert.locator("time")).toHaveCount(1);
    await expect(alert).toContainText(/examples/i);
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(
      0,
    );
    await axe(page);

    await page.getByRole("button", { name: /tetris game in html/i }).click();
    await decomposeButton(page).click();
    await expect(planCard(page)).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
    expect(asked[1]).toEqual({ intent: "tetris game in html" });
  });

  test("at 360px every notice stays inside the frame", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await ask(page, [
      refusal(503, "intent_unavailable", {}, { "Retry-After": "30" }),
    ]);
    await expect(notice(page)).toBeVisible();
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scroll).toBeLessThanOrEqual(360);
  });
});
