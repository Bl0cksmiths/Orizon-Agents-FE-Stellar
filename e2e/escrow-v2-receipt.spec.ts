/**
 * The trace page's receipt under escrow v2 (story 5.01): per-step payouts,
 * the returned remainder, each settlement state, and the reclaim a failed
 * settlement leaves — drawn from a MOCKED backend, and every state judged by
 * the same axe scan as the dispute receipt.
 *
 * What these pin above all is what the page must NOT say: a failed or
 * unconfirmed settlement never reads as complete and paid, and no money
 * figure appears that the backend did not report as moved.
 */
import { test, expect, type Page } from "@playwright/test";
import type { SettlementStepView, TaskDisputes } from "../lib/types";
import { disputeScan } from "./dispute-axe";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockSettlementSteps,
  mockSettlementView,
  mockTaskReadToken,
  mockTraceStream,
  mockWallet,
  mockWalletAddress,
} from "./mocks";

const HOUR_S = 60 * 60;
const nowS = () => Math.floor(Date.now() / 1000);
const receipt = (page: Page) => page.getByRole("region", { name: "Receipt" });

/** The fixture's steps as a v2 settle records them: code.gen paid its
 *  price, seo.brief a seeded platform agent nobody could pay, vision.ocr
 *  undelivered. */
const V2_STEPS: SettlementStepView[] = [
  {
    ...mockSettlementSteps[0],
    agent_id: "agt_05x7",
    price_usdc: 0,
    creditable_usdc: 0,
    paid_usdc: 0,
    unpaid_reason: "no_onchain_owner",
  },
  {
    ...mockSettlementSteps[1],
    paid_usdc: 0.054,
    receipt_id_hex: "ab".repeat(16),
  },
  { ...mockSettlementSteps[2], paid_usdc: 0 },
];

async function openTrace(
  page: Page,
  opts: {
    settlement: ReturnType<typeof mockSettlementView> | null;
    state: TaskDisputes["settlement_state"];
    held?: boolean;
  },
) {
  await mockTaskReadToken(page);
  if (opts.held) {
    // The tab that signed the run's authorization, expired a minute ago.
    await page.addInitScript(
      ({ taskId, payer, expiresAt }) => {
        window.sessionStorage.setItem(
          "orizon.held-authorizations",
          JSON.stringify([
            [
              taskId,
              {
                authIdHex: "0123456789abcdef0123456789abcdef",
                payer,
                expiresAt,
              },
            ],
          ]),
        );
      },
      {
        taskId: mockDisputeTaskId,
        payer: mockWalletAddress,
        expiresAt: nowS() - 60,
      },
    );
  }
  await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, {
    settlement: opts.settlement,
    settlementState: opts.state,
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(receipt(page)).toBeVisible();
}

test.describe("escrow v2 receipt", () => {
  test("shows each step's payout, a platform step as not billed, and the rest returned", async ({
    page,
  }) => {
    const settlement = {
      ...mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      steps: V2_STEPS,
      settled_usdc: 0.054,
    };
    await openTrace(page, { settlement, state: "settled" });

    const code = receipt(page)
      .getByRole("listitem")
      .filter({ hasText: "code.gen" });
    await expect(code).toContainText("paid 0.054 USDC to the operator");
    await expect(
      code.getByRole("link", { name: "view step 2 payout on stellar.expert" }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${settlement.charge_tx}`,
    );

    const seo = receipt(page)
      .getByRole("listitem")
      .filter({ hasText: "seo.brief" });
    await expect(seo).toContainText("delivered · not billed (platform agent)");
    await expect(seo).not.toContainText(/\bpaid \d/);

    await expect(receipt(page)).toContainText(
      "the rest, to the payer · amount not reported",
    );
    expect(await disputeScan(page)).toEqual([]);
  });

  test("says a failed settlement is exactly that, with no money figure", async ({
    page,
  }) => {
    await openTrace(page, { settlement: null, state: "failed" });
    await expect(receipt(page)).toContainText("settlement failed");
    await expect(receipt(page).getByRole("status")).toContainText(
      "The settlement did not go through, so no agent was paid.",
    );
    await expect(receipt(page)).not.toContainText(/✓|\d+\.\d+ (USDC|XLM)/);
    // Nothing on record to dispute, and no reclaim from a tab that did not sign.
    await expect(
      page.getByRole("button", { name: /dispute|reclaim/i }),
    ).toHaveCount(0);
    expect(await disputeScan(page)).toEqual([]);
  });

  test("says an unconfirmed settlement may still land, and shows nothing as paid", async ({
    page,
  }) => {
    await openTrace(page, { settlement: null, state: "unconfirmed" });
    await expect(receipt(page)).toContainText("settlement unconfirmed");
    await expect(receipt(page)).toContainText("it may still land");
    await expect(receipt(page)).not.toContainText(
      /\bpaid \d|✓|\d+\.\d+ (USDC|XLM)/,
    );
    expect(await disputeScan(page)).toEqual([]);
  });

  test("offers the paying tab the reclaim a failed settlement leaves", async ({
    page,
  }) => {
    await openTrace(page, { settlement: null, state: "failed", held: true });
    const reclaim = page.getByRole("region", { name: "Reclaim your funds" });
    await expect(reclaim).toBeVisible();
    await expect(
      reclaim.getByRole("button", { name: "Reclaim held funds ▸" }),
    ).toBeVisible();
    expect(await disputeScan(page)).toEqual([]);
  });

  test("keeps the receipt inside a phone's width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const settlement = {
      ...mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      steps: V2_STEPS,
      settled_usdc: 0.054,
    };
    await openTrace(page, { settlement, state: "settled" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
