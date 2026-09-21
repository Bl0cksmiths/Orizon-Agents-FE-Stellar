/**
 * Accessibility gate.
 *
 * Runs axe-core against the public marketing page and the console routes a
 * visitor actually lands on, asserting no WCAG 2.0/2.1 A or AA violations.
 * The point is regression protection: the a11y fixes in this repo (focus
 * rings, the inert mobile drawer, landmark structure, tab semantics) were
 * found by hand once, and without a gate they can quietly come back.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockApi,
  mockDispute,
  mockDisputeApi,
  mockDisputeTaskId,
  mockReceiptDispute,
  mockRejectionReason,
  mockSettlementSteps,
  mockSettlementView,
  mockTraceStream,
  mockWallet,
} from "./mocks";

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

/**
 * The receipt and the dispute form (story 4.05) exist only on a settled
 * workflow opened with `?task=`. The sweep above visits /app/trace in demo
 * mode, where the receipt renders nothing, so neither state has reached axe
 * there — and they are the two a buyer acts in.
 *
 * One fixture carries every step state at once: a step still disputable, one
 * already disputed with its status badge, and one that was never charged and
 * says why.
 */
test.describe("accessibility — the trace page's receipt", () => {
  const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

  async function openReceipt(page: Page): Promise<void> {
    const settledAtS = Math.floor(Date.now() / 1000) - 60 * 60;
    await mockWallet(page);
    await mockApi(page);
    await mockTraceStream(page, mockDisputeTaskId);
    await mockDisputeApi(page, {
      settlement: mockSettlementView({ settledAtS }),
      disputes: [
        mockDispute(mockSettlementSteps[0], {
          openedAtS: settledAtS + 600,
          reason: "the outline misses half of the brief",
        }),
      ],
    });
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    await expect(page.getByRole("region", { name: "Receipt" })).toBeVisible();
  }

  async function violations(page: Page): Promise<string[]> {
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    return result.violations.map(
      (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
    );
  }

  test("the receipt panel has no WCAG A/AA violations", async ({ page }) => {
    await openReceipt(page);
    expect(await violations(page)).toEqual([]);
  });

  test("the open dispute form has no WCAG A/AA violations", async ({
    page,
  }) => {
    await openReceipt(page);
    await page
      .getByRole("region", { name: "Receipt" })
      .getByRole("button", { name: /dispute/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});

/**
 * The dispute receipt (story 4.06) in its two outcomes — the states a buyer
 * reads most closely, and the ones the evidence recording shows. The sweep
 * above holds only an open dispute, so neither outcome has reached axe there:
 * the refund and rating links, their confirmed states, and the rejection's
 * reason are all drawn only once a dispute resolves.
 */
test.describe("accessibility — the dispute receipt", () => {
  const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  const disputedStep = mockSettlementSteps[1];

  /** Opens the receipt with the one step's dispute resolved as `status`. */
  async function openResolved(
    page: Page,
    status: "credited" | "rejected",
  ): Promise<Locator> {
    const settledAtS = Math.floor(Date.now() / 1000) - 60 * 60;
    await mockWallet(page);
    await mockApi(page);
    await mockTraceStream(page, mockDisputeTaskId);
    await mockDisputeApi(page, {
      settlement: mockSettlementView({ settledAtS }),
      disputes: [
        mockReceiptDispute(disputedStep, {
          status,
          openedAtS: settledAtS + 600,
        }),
      ],
    });
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    const row = page
      .getByRole("region", { name: "Receipt" })
      .getByRole("listitem")
      .filter({ hasText: disputedStep.agent_id });
    await expect(row).toBeVisible();
    return row;
  }

  async function violations(page: Page): Promise<string[]> {
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    return result.violations.map(
      (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
    );
  }

  test("a credited receipt has no WCAG A/AA violations", async ({ page }) => {
    const row = await openResolved(page, "credited");
    // Scanned once the whole outcome is drawn, links and all — not the
    // moment the row appears.
    await expect(row.getByRole("link", { name: /refund/i })).toBeVisible();
    await expect(row.getByRole("link", { name: /rating/i })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("a rejected receipt has no WCAG A/AA violations", async ({ page }) => {
    const row = await openResolved(page, "rejected");
    // The reason is the part of this state worth scanning; wait for it.
    await expect(row).toContainText(mockRejectionReason);
    expect(await violations(page)).toEqual([]);
  });
});
