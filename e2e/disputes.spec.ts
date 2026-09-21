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
  DISPUTE_WINDOW_S,
  mockApi,
  mockDispute,
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

const dialog = (page: Page): Locator => page.getByRole("dialog");

/** Opens the dispute form for one step. */
async function openDialog(page: Page, agent: string): Promise<Locator> {
  await stepRow(page, agent)
    .getByRole("button", { name: /dispute/i })
    .click();
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

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

  test("the reason is required: submit stays disabled until it is filled", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });
    const form = await openDialog(page, codeStep.agent_id);

    const reason = form.getByRole("textbox", { name: /your reason/i });
    const submit = form.getByRole("button", { name: /sign and submit/i });
    await expect(reason).toHaveValue("");
    await expect(submit).toBeDisabled();

    // Whitespace is not a reason.
    await reason.fill("   ");
    await expect(submit).toBeDisabled();

    await reason.fill("the calculator app does not compute anything");
    await expect(submit).toBeEnabled();

    await reason.fill("");
    await expect(submit).toBeDisabled();
  });

  // The fraction is printed as the dialog prints it — to at most two decimal
  // places — so a third is "33.33%", never a recomputed "33%" or a raw
  // 33.333…: the half-credit case alone would pass either way.
  for (const { fraction, percent, credit } of [
    { fraction: 0.5, percent: "50%", credit: "0.027 USDC" },
    { fraction: 1 / 3, percent: "33.33%", credit: "0.018 USDC" },
  ]) {
    test(`the credit terms (${percent}) are stated in the form before anything is submitted`, async ({
      page,
    }) => {
      const opened: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/disputes") {
          opened.push(request.method());
        }
      });
      await openTrace(page, {
        settlement: mockSettlementView({
          settledAtS: nowS() - HOUR_S,
          creditedFraction: fraction,
        }),
      });
      const form = await openDialog(page, codeStep.agent_id);

      // The fraction as served, the one who pays it, and the one who
      // decides — all on screen while the reason is empty and submit is off.
      await expect(form).toContainText(
        `An upheld dispute credits ${percent} of this step's charge back to the wallet that paid.`,
      );
      await expect(form).toContainText(
        "The platform pays the credit. Nothing is clawed back from the agent.",
      );
      await expect(form).toContainText(
        "The platform reviews the dispute and decides. There is no on-chain arbitration.",
      );
      // And what that comes to for this step, as the backend computed it.
      await expect(form).toContainText(credit);
      await expect(
        form.getByRole("button", { name: /sign and submit/i }),
      ).toBeDisabled();
      expect(opened).toEqual([]);
    });
  }

  test("a closed window says it closed and when, and offers no action anywhere", async ({
    page,
  }) => {
    const settledAtS = nowS() - DISPUTE_WINDOW_S - HOUR_S;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS }),
    });

    await expect(receipt(page)).toBeVisible();
    await expect(
      receipt(page).getByText("Dispute window closed", { exact: true }),
    ).toBeVisible();
    // "When" is the window's own closing instant — machine-readable on the
    // <time> the buyer sees, and spoken in the sentence a screen reader gets.
    const closesAtIso = new Date(
      (settledAtS + DISPUTE_WINDOW_S) * 1000,
    ).toISOString();
    const closedAt = receipt(page).locator(`time[datetime="${closesAtIso}"]`);
    await expect(closedAt).toBeVisible();
    const closedAtText = (await closedAt.textContent()) ?? "";
    expect(closedAtText).not.toBe("");
    await expect(
      receipt(page)
        .getByRole("status")
        .filter({ hasText: /dispute window/ }),
    ).toHaveText(`The dispute window closed on ${closedAtText}.`);
    await expect(disputeButtons(page)).toHaveCount(0);
  });

  test("an already disputed step shows its dispute and status, not a second action", async ({
    page,
  }) => {
    const settledAtS = nowS() - HOUR_S;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS }),
      disputes: [
        mockDispute(codeStep, {
          openedAtS: settledAtS + 600,
          reason: "the calculator app does not compute anything",
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row).toContainText(
      "the calculator app does not compute anything",
    );
    await expect(row.getByRole("button", { name: /dispute/i })).toHaveCount(0);
    // The other settled step is still the buyer's to dispute.
    await expect(
      stepRow(page, briefStep.agent_id).getByRole("button", {
        name: /dispute/i,
      }),
    ).toBeVisible();
  });
});
