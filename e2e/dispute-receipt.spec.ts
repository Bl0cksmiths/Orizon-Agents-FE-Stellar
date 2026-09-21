/**
 * A dispute's status and refund receipt on the trace / receipt view
 * (story 4.06, BLO-34).
 *
 * EVIDENCE NOTE. Every test here runs against a MOCKED backend: the disputes
 * read is answered from a script in `e2e/mocks.ts`, and the refund and rating
 * hashes are fixtures that exist on no ledger. The screenshots this spec
 * attaches to the Playwright report are test evidence of how the receipt draws
 * each state — they are NOT the SOW §6.1 recording and must never be presented
 * as it. That recording is made against the deployed backend, with a refund
 * and a dispute rating that really landed on testnet.
 *
 * Each test drives the real trace page at `?task=` exactly as the story 4.05
 * spec does: the trace stream replays a finished run, the connected wallet is
 * `mockWallet`'s, and the one read the receipt is drawn from is answered by
 * `mockDisputeReads`, which a test can move on — the platform adjudicating and
 * paying while the buyer watches — and which counts every read the page makes.
 */
import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { Dispute } from "../lib/types";
import {
  mockApi,
  mockDisputeReads,
  mockDisputeTaskId,
  mockReceiptDispute,
  mockRatingTx,
  mockRefundTx,
  mockRejectionReason,
  mockSettlementSteps,
  mockSettlementView,
  mockTraceStream,
  mockWallet,
  type MockDisputeReads,
} from "./mocks";

const HOUR_S = 60 * 60;

const [, codeStep] = mockSettlementSteps;

/** Now, in epoch seconds, on the clock the mock server shares with the page. */
const nowS = () => Math.floor(Date.now() / 1000);

/**
 * Stellar Expert's TESTNET page for one transaction: what "a transaction that
 * resolves on Stellar Expert (testnet)" means for a link, spelled out here
 * rather than borrowed from the component under test.
 */
const testnetTx = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

/** How an epoch-seconds instant is written on a `<time datetime>`. */
const isoOf = (epochS: number) => new Date(epochS * 1000).toISOString();

type ReceiptSetup = {
  /** What the disputes read answers with when the page loads. */
  disputes: readonly Dispute[];
  /** The workflow's settlement instant; an hour ago unless given. */
  settledAtS?: number;
  /** Who paid. The connected wallet is always `mockWalletAddress`. */
  payer?: string;
  /** The server's clock; see `MockDisputeApiOptions.clock`. */
  clock?: () => number | Promise<number>;
};

/**
 * Opens the trace page on the settled workflow with a wallet connected, and
 * waits for the receipt — which is only asked for once the stream seals.
 * Returns the scripted read, so a test can move the answer on and count.
 */
async function openReceipt(
  page: Page,
  { disputes, settledAtS = nowS() - HOUR_S, payer, clock }: ReceiptSetup,
): Promise<MockDisputeReads> {
  await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  const reads = await mockDisputeReads(page, {
    settlement: mockSettlementView({ settledAtS, payer }),
    disputes,
    clock,
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("workflow settled")).toBeVisible();
  await expect(receipt(page)).toBeVisible();
  return reads;
}

const receipt = (page: Page): Locator =>
  page.getByRole("region", { name: "Receipt" });

/** The receipt's row for one step, found by the agent it paid. */
const stepRow = (page: Page, agent: string): Locator =>
  receipt(page).getByRole("listitem").filter({ hasText: agent });

/**
 * Attaches a picture of one receipt state to this test's report. An
 * attachment and never a committed file: it shows a MOCKED backend, and a PNG
 * in the tree is one careless upload away from passing as the live recording.
 */
async function attachShot(
  testInfo: TestInfo,
  name: string,
  target: Locator,
): Promise<void> {
  await testInfo.attach(name, {
    body: await target.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
}

test.describe("dispute status and refund receipt", () => {
  test("an open dispute says it is under review, when it was raised, and what happens next", async ({
    page,
  }, testInfo) => {
    const openedAtS = nowS() - 40 * 60;
    await openReceipt(page, {
      disputes: [mockReceiptDispute(codeStep, { status: "open", openedAtS })],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    // When it was raised, machine-readable on the <time> the buyer reads.
    await expect(row).toContainText(/raised/i);
    await expect(
      row.locator(`time[datetime="${isoOf(openedAtS)}"]`),
    ).toBeVisible();
    // Not silence: the buyer is told who acts next.
    await expect(row).toContainText(/the platform (is )?review/i);
    await attachShot(testInfo, "receipt — open", row);
  });

  test("a credited dispute shows the amount actually paid and links its refund on Stellar Expert testnet", async ({
    page,
  }, testInfo) => {
    // Deliberately NOT the step's `creditable_usdc` (0.027): were the two
    // equal, a receipt printing the promise would pass as one printing what
    // the refund moved.
    const paidUsdc = 0.0265;
    expect(paidUsdc).not.toBe(codeStep.creditable_usdc);
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
          credited_usdc: paidUsdc,
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Refunded");
    await expect(row).toContainText("0.0265 USDC");
    // The link resolves on the testnet explorer, to exactly this refund.
    const refund = row.getByRole("link", { name: /refund/i });
    await expect(refund).toHaveAttribute("href", testnetTx(mockRefundTx));
    await attachShot(testInfo, "receipt — credited", row);
  });

  test("a credited dispute also links the dispute rating written against the agent", async ({
    page,
  }) => {
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
        }),
      ],
    });

    // The consequence to the agent, as its own artifact beside the credit:
    // a second link, to a second transaction, on the same testnet explorer.
    const row = stepRow(page, codeStep.agent_id);
    const rating = row.getByRole("link", { name: /rating/i });
    await expect(rating).toHaveAttribute("href", testnetTx(mockRatingTx));
    await expect(row.getByRole("link", { name: /refund/i })).toHaveAttribute(
      "href",
      testnetTx(mockRefundTx),
    );
  });

  test("a rejected dispute says so and gives the platform's reason", async ({
    page,
  }, testInfo) => {
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "rejected",
          openedAtS: nowS() - 40 * 60,
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Rejected");
    // A rejection with no explanation is worse than no dispute system.
    await expect(row).toContainText(mockRejectionReason);
    // Nothing was paid, so nothing may be linked as if it had been.
    await expect(row.getByRole("link")).toHaveCount(0);
    await attachShot(testInfo, "receipt — rejected", row);
  });
});
