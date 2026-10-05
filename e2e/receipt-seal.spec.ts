/**
 * The receipt's word on the run's attestation seal (`seal` and `proof_tx` on
 * GET /api/tasks/{id}/disputes): each state as status text, the seal's own
 * transaction linked, a failed seal never mistaken for a lost payment, a
 * pending one followed until it settles, and nothing added for a backend
 * that predates the field.
 */
import { expect, test, type Page } from "@playwright/test";
import type { TaskDisputes } from "../lib/types";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockSettlementView,
  mockTraceStream,
  mockTaskReadToken,
} from "./mocks";

const receipt = (page: Page) => page.getByRole("region", { name: "Receipt" });
const nowS = () => Math.floor(Date.now() / 1000);
const SEAL_TX = "5e".repeat(32);

async function openReceipt(
  page: Page,
  seal: { seal?: TaskDisputes["seal"]; proofTx?: TaskDisputes["proof_tx"] },
) {
  await mockTaskReadToken(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, {
    settlement: mockSettlementView({ settledAtS: nowS() - 3_600 }),
    ...seal,
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(receipt(page)).toBeVisible();
}

test.describe("the receipt's seal", () => {
  for (const [seal, label] of [
    ["sealed", "Sealed on Stellar"],
    ["failed", "Seal failed — your payment stands"],
    ["unconfirmed", "Seal not confirmed yet"],
    ["pending", "Sealing… checking the ledger"],
  ] as const) {
    test(`says a ${seal} seal as "${label}"`, async ({ page }) => {
      await openReceipt(page, { seal, proofTx: SEAL_TX });
      await expect(
        receipt(page).getByRole("status").filter({ hasText: label }),
      ).toBeVisible();
    });
  }

  test("links the seal's own transaction", async ({ page }) => {
    await openReceipt(page, { seal: "sealed", proofTx: SEAL_TX });
    await expect(
      receipt(page).locator(`a[href$="/tx/${SEAL_TX}"]`),
    ).toBeVisible();
  });

  test("a failed seal tells the buyer the payment stands", async ({ page }) => {
    await openReceipt(page, { seal: "failed", proofTx: null });
    await expect(receipt(page)).toContainText(
      "The payment for this run is unaffected and stands as settled.",
    );
  });

  test("adds nothing for a backend that does not report the seal", async ({
    page,
  }) => {
    await openReceipt(page, {});
    await expect(receipt(page)).not.toContainText(
      /Sealed on Stellar|Sealing…|Seal not confirmed|Seal failed|No attestation seal/,
    );
  });
});
