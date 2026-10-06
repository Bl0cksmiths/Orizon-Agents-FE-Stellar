/**
 * The trace page's attestation card, read from the task's own `seal` state:
 * each state in words, a failed seal never mistaken for a lost payment, and a
 * backend from before the field keeping the trace's own reading.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockDisputeTrace,
  mockSettledNoArtifact,
  mockSettlementView,
  mockTraceStream,
} from "./mocks";

/** The receipt beneath the trace reads its disputes; answer it as settled. */
const disputes = (page: Page) =>
  mockDisputeApi(page, {
    settlement: mockSettlementView({
      settledAtS: Math.floor(Date.now() / 1000) - 60 * 60,
    }),
  });

test.describe("the trace's seal", () => {
  for (const [seal, label] of [
    ["sealed", "Sealed on Stellar"],
    ["failed", "Seal failed — your payment stands"],
    ["unconfirmed", "Seal not confirmed yet"],
  ] as const) {
    test(`says a ${seal} seal as "${label}"`, async ({ page }) => {
      await mockApi(page, { task: { seal }, artifact: mockSettledNoArtifact });
      await mockTraceStream(page, mockDisputeTaskId);
      await disputes(page);
      await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
      await expect(
        page.getByRole("status").filter({ hasText: label }),
      ).toBeVisible();
    });
  }

  test("checks a pending seal again until the backend settles it", async ({
    page,
  }) => {
    let seal = "pending";
    await mockApi(page, { artifact: mockSettledNoArtifact });
    await page.route(
      (url) => url.pathname === `/api/tasks/${mockDisputeTaskId}`,
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            id: mockDisputeTaskId,
            intent: "e2e",
            agents: 1,
            spent: 0.01,
            status: "complete",
            started: "just now",
            seal,
          }),
        }),
    );
    await mockTraceStream(page, mockDisputeTaskId);
    // The stream ended while the seal was pending, so the run is followed
    // the rest of the way over its recorded history.
    await page.route(
      (url) => url.pathname === `/api/trace/${mockDisputeTaskId}`,
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(mockDisputeTrace),
        }),
    );
    await disputes(page);
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Sealing… checking the ledger" }),
    ).toBeVisible();
    seal = "sealed";
    await expect(
      page.getByRole("status").filter({ hasText: "Sealed on Stellar" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("keeps the trace's own wording for a backend from before the field", async ({
    page,
  }) => {
    await mockApi(page, { artifact: mockSettledNoArtifact });
    await mockTraceStream(page, mockDisputeTaskId);
    await disputes(page);
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    await expect(page.getByText("Attestation", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        /Sealed on Stellar|Sealing…|Seal not confirmed|Seal failed/,
      ),
    ).toHaveCount(0);
  });

  test("says a delivery-only seal without a payment", async ({ page }) => {
    await mockApi(page, {
      task: { seal: "sealed", seal_kind: "delivery_only" },
      artifact: mockSettledNoArtifact,
    });
    await mockTraceStream(page, mockDisputeTaskId);
    await disputes(page);
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    await expect(
      page.getByRole("status").filter({
        hasText: "Attested on Stellar — delivered, no payment made",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Seal failed — your payment stands"),
    ).toHaveCount(0);
  });
});
