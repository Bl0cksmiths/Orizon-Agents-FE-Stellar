/**
 * Disputing a settled step from the trace / receipt view (story 4.05).
 *
 * Every test drives the real trace page at `?task=` with the backend mocked
 * at the network: the trace stream replays a finished run, and the dispute
 * routes answer from `mockDisputeApi`, which remembers what was opened so a
 * later read shows it. A connected wallet is `mockWallet`'s — a restored
 * Freighter session plus a stand-in for its content script — so the signing
 * step is exercised rather than skipped, exactly as the bind specs do it.
 *
 * These run against a MOCKED backend. What they capture is test evidence of
 * the UI's behaviour, not the SOW §6.1 recording, which must be made against
 * the deployed backend.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockSettlementSteps,
  mockSettlementView,
  mockTraceStream,
  mockWallet,
  type MockDisputeApiOptions,
} from "./mocks";

const HOUR_S = 60 * 60;

const [briefStep, codeStep, failedStep] = mockSettlementSteps;

/** Now, in epoch seconds, on the clock the mock server shares with the page. */
const nowS = () => Math.floor(Date.now() / 1000);

/**
 * Opens the trace page on the settled workflow and waits for the run to
 * finish replaying — the receipt is only asked for once the stream seals.
 */
async function openTrace(
  page: Page,
  api: MockDisputeApiOptions,
  {
    wallet = true,
    routes,
  }: {
    wallet?: boolean;
    /** Routes registered last, so they win over the dispute mock. */
    routes?: (page: Page) => Promise<void>;
  } = {},
): Promise<void> {
  if (wallet) await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, api);
  await routes?.(page);
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("workflow settled")).toBeVisible();
}

const receipt = (page: Page): Locator =>
  page.getByRole("region", { name: "Receipt" });

/** Every dispute action on the page, wherever it is drawn. */
const disputeButtons = (page: Page): Locator =>
  page.getByRole("button", { name: /dispute/i });

/** The receipt's row for one step, found by the agent it paid. */
const stepRow = (page: Page, agent: string): Locator =>
  receipt(page).getByRole("listitem").filter({ hasText: agent });

test.describe("dispute action on the trace / receipt view", () => {
  test("the payer, an hour after settling, is offered a dispute on every settled step and sees the time left", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });

    await expect(receipt(page)).toBeVisible();
    for (const step of [briefStep, codeStep]) {
      await expect(
        stepRow(page, step.agent_id).getByRole("button", { name: /dispute/i }),
      ).toBeVisible();
    }
    await expect(disputeButtons(page)).toHaveCount(2);

    // Settled an hour into a 24-hour window: just under 23 hours are left,
    // and the page says so before the buyer reaches for the action.
    await expect(
      receipt(page).getByText(/^22h 5\dm left$|^23h left$/),
    ).toBeVisible();
    await expect(
      receipt(page).getByText("Dispute window open", { exact: true }),
    ).toBeVisible();
  });

  test("a step that did not deliver offers no dispute, and says why", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });

    const row = stepRow(page, failedStep.agent_id);
    await expect(row).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row).toContainText(/not charged|did not deliver/i);
  });
});
