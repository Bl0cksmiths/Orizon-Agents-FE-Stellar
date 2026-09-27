/**
 * Week-3 evidence capture. NOT a test of the product: it drives the same
 * mocked harness the dispute specs use and writes one PNG per state for the
 * tranche submission. Every hash it paints is a fixture from `e2e/mocks.ts`.
 *
 * It is kept here as the record of how the PNGs beside it were made; it is not
 * part of the suite. To re-run it, copy it into `e2e/` of a checkout of the
 * commit named in `local-README.md` and run:
 *
 *   E2E_PORT=3211 npx playwright test e2e/local-capture.spec.ts --workers=1
 *
 * It connects no wallet to anything real, signs nothing and submits nothing:
 * every route it touches is answered by `e2e/mocks.ts`.
 */
import fs from "node:fs";
import path from "node:path";

import { test, expect, type Locator, type Page } from "@playwright/test";

import type { Dispute } from "../lib/types";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeReads,
  mockDisputeTaskId,
  mockReceiptDispute,
  mockSettlementSteps,
  mockSettlementView,
  mockTraceStream,
  mockWallet,
} from "./mocks";

const OUT =
  "/home/dan/Websites-2026/orizon-agents-FE-Stellar/Week-3-Tranche-Submission/screenshots";

const HOUR_S = 60 * 60;
const [briefStep, codeStep] = mockSettlementSteps;
const nowS = () => Math.floor(Date.now() / 1000);

test.use({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });

const receipt = (page: Page): Locator =>
  page.getByRole("region", { name: "Receipt" });

const stepRow = (page: Page, agent: string): Locator =>
  receipt(page).getByRole("listitem").filter({ hasText: agent });

async function shot(name: string, target: Locator): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  await target.screenshot({ path: file, animations: "disabled" });
  const box = await target.boundingBox();
  const bytes = fs.statSync(file).size;
  console.log(
    `CAPTURED ${name} ${bytes} bytes, css box ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}`,
  );
}

/** Logs the target's visible text, so the manifest quotes what shipped. */
async function say(name: string, target: Locator): Promise<void> {
  const text = (await target.innerText()).replace(/\n+/g, " | ");
  console.log(`TEXT ${name} :: ${text}`);
}

/** The settlement view with a wallet connected and the dispute routes live. */
async function openTrace(page: Page, disputes: readonly Dispute[] = []) {
  await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, {
    settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    disputes,
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("workflow settled")).toBeVisible();
  await expect(receipt(page)).toBeVisible();
}

/** The receipt read alone, answering with a fixed set of disputes. */
async function openReceipt(page: Page, disputes: readonly Dispute[]) {
  await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeReads(page, {
    settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    disputes,
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("workflow settled")).toBeVisible();
  await expect(receipt(page)).toBeVisible();
}

test("01 settlement view, dispute window open", async ({ page }) => {
  await openTrace(page);
  await expect(
    receipt(page).getByText("Dispute window open", { exact: true }),
  ).toBeVisible();
  await expect(
    receipt(page).getByRole("button", { name: /dispute/i }),
  ).toHaveCount(2);
  await say("01", receipt(page));
  await shot("local-01-dispute-action-open-window.png", receipt(page));
});

test("02 dispute dialog for one step", async ({ page }) => {
  await openTrace(page);
  await stepRow(page, codeStep.agent_id)
    .getByRole("button", { name: /dispute/i })
    .click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();
  await form
    .getByRole("textbox", { name: /your reason/i })
    .fill("the calculator app does not compute anything");
  const submit = form.getByRole("button", { name: /sign and submit/i });
  await expect(submit).toBeEnabled();
  await say("02", form);
  await shot("local-02-dispute-dialog.png", form);
  // Nothing is signed or submitted: the dialog is closed, not sent.
  await form.getByRole("button", { name: "Close", exact: true }).last().click();
});

test("03 receipt, dispute open", async ({ page }) => {
  await openReceipt(page, [
    mockReceiptDispute(codeStep, {
      status: "open",
      openedAtS: nowS() - 40 * 60,
    }),
  ]);
  const row = stepRow(page, codeStep.agent_id);
  await expect(row).toContainText("Under review");
  await say("03", row);
  await shot("local-03-receipt-open-dispute.png", row);
});

test("04 receipt, credited with confirmed refund and rating", async ({
  page,
}) => {
  await openReceipt(page, [
    mockReceiptDispute(codeStep, {
      status: "credited",
      openedAtS: nowS() - 40 * 60,
    }),
  ]);
  const row = stepRow(page, codeStep.agent_id);
  await expect(row).toContainText("Refunded");
  await expect(row.getByRole("link", { name: /refund/i })).toBeVisible();
  await expect(row.getByRole("link", { name: /rating/i })).toBeVisible();
  await say("04", row);
  await shot("local-04-receipt-credited.png", row);
});

test("05 receipt, credit recorded with no confirmed transfer", async ({
  page,
}) => {
  await openReceipt(page, [
    mockReceiptDispute(codeStep, {
      status: "credited",
      openedAtS: nowS() - 40 * 60,
      refund_tx: null,
    }),
  ]);
  const row = stepRow(page, codeStep.agent_id);
  await expect(row).toContainText("Refund in progress");
  await expect(row).not.toContainText("Refunded");
  await expect(row).toContainText("No transaction on record");
  await say("05", row);
  await shot("local-05-receipt-crediting-unconfirmed.png", row);
});

test("06 receipt, rejected", async ({ page }) => {
  await openReceipt(page, [
    mockReceiptDispute(codeStep, {
      status: "rejected",
      openedAtS: nowS() - 40 * 60,
    }),
  ]);
  const row = stepRow(page, codeStep.agent_id);
  await expect(row).toContainText("Rejected");
  await say("06", row);
  await shot("local-06-receipt-rejected.png", row);
});
