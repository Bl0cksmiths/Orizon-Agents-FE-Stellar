/**
 * The trace page on a bound external agent's artifact.
 *
 * The first live escrow v2 run (tsk_7e1c369cebaf41b3, calculatorai,
 * 2026-09-30) settled, and its trace then said "artifact fetch failed —
 * malformed response from /tasks/tsk_7e1c369cebaf41b3/artifact". The backend
 * rebuilds an operator's artifact from an allowlist and drops `language` from
 * every file (`_parse_files`, app/agents/workers/external_contract.py); the
 * guard demanded one. `mockExternalArtifactResponse` is that shape.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { WCAG_TAGS } from "./dispute-axe";
import {
  mockApi,
  mockDisputeApi,
  mockDisputeTaskId,
  mockExternalArtifact,
  mockExternalArtifactResponse,
  mockSettlementView,
  mockTraceStream,
} from "./mocks";

async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return result.violations.map(
    (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
  );
}

test("the trace shows an external agent's artifact whose files carry no language", async ({
  page,
}) => {
  await mockApi(page, { artifact: mockExternalArtifactResponse });
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, {
    settlement: mockSettlementView({
      settledAtS: Math.floor(Date.now() / 1000) - 60 * 60,
    }),
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);

  // The artifact arrived and was accepted: the page moved onto its tab.
  await expect(page.getByRole("tab", { name: /artifact/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("tabpanel", { name: "preview" }).locator("iframe"),
  ).toHaveAttribute("title", mockExternalArtifact.title);
  await expect(page.getByText(/artifact fetch failed/)).toHaveCount(0);
  await expect(page.getByText(/malformed response/)).toHaveCount(0);
  expect(await violations(page)).toEqual([]);

  // The file reads as plain text, and says so — no "report.html · " with
  // nothing after it, and no highlighting claiming a grammar.
  await page.getByRole("tab", { name: "files" }).click();
  const file = mockExternalArtifact.files[0];
  await expect(
    page.getByText(`${file.path} · plain text`, { exact: true }),
  ).toBeVisible();
  const code = page.getByRole("region", { name: `${file.path}, plain text` });
  await expect(code).toContainText("1000 × 3 = <strong>3000</strong>");
  await expect(code.locator(".token")).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
});
