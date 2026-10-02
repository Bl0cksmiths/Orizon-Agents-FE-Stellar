/**
 * One item the page cannot use, and everything else it can.
 *
 * The registry and the reputation batch used to be validated as a whole, so
 * one agent with a status this build had no tone for — or one entry with a
 * source it did not know — replaced every row with an error frame, or every
 * score with "unavailable". The backend had answered; the page said it was
 * offline. These specs pin the per-item version: the usable items render, an
 * unknown value renders neutrally, and what could not be shown is counted.
 */
import { test, expect, type Page } from "@playwright/test";
import { mockAgents, mockApi } from "./mocks";
import {
  agentsWithDefects,
  batchWithDefects,
  mockRawAgents,
  mockRawReputation,
  unknownStatusAgent,
} from "./agents-guard-fixtures";
import { registryRow } from "./registry-rows";

function row(page: Page, agentId: string) {
  return registryRow(page, agentId);
}

/** The batch has landed once its floor is stated above the table. */
async function batchLoaded(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Selection floor" }),
  ).toBeVisible();
}

test.describe("a registry with one item the page cannot use", () => {
  test("lists every usable agent and counts the one it could not show", async ({
    page,
  }) => {
    await mockApi(page);
    await mockRawAgents(page, agentsWithDefects);
    await page.goto("/app/agents");

    // Every well-formed agent, the unknown-status one included; only the
    // agent with no price is left out.
    await expect(page.getByRole("rowheader")).toHaveCount(
      mockAgents.length + 1,
    );
    await expect(row(page, "no_price_bot")).toHaveCount(0);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "1 agent in the registry could not be shown" }),
    ).toBeVisible();

    // The backend answered, so nothing may say it is offline or unreachable.
    await expect(page.getByText(/backend offline|unreachable/i)).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(
      0,
    );
  });

  test("shows an unknown status as sent, neutrally, and never as routable", async ({
    page,
  }) => {
    await mockApi(page);
    await mockRawAgents(page, agentsWithDefects);
    await page.goto("/app/agents");
    await batchLoaded(page);

    const suspended = row(page, unknownStatusAgent.id);
    const status = suspended.getByText(unknownStatusAgent.status, {
      exact: true,
    });
    await expect(status).toBeVisible();
    await expect(status).not.toHaveClass(/cyan|violet|magenta/);

    // Its floor and binding would both pass; the status is what the page
    // cannot vouch for, so "routable" leaves it out.
    await page.getByRole("button", { name: /^routable$/i }).click();
    await expect(row(page, unknownStatusAgent.id)).toHaveCount(0);
    await expect(row(page, "agt_11c0")).toBeVisible();
  });

  test("keeps every other score when one entry is unusable", async ({
    page,
  }) => {
    await mockApi(page);
    await mockRawReputation(page, batchWithDefects);
    await page.goto("/app/agents");
    await expect(page.getByRole("rowheader")).toHaveCount(mockAgents.length);
    await batchLoaded(page);

    // The corrupt entry's agent has no score, said as "no score" — the read
    // did not fail — and every other row keeps its chip.
    await expect(
      row(page, "weather_bot").getByText("no score", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("unavailable", { exact: true })).toHaveCount(0);
    for (const id of ["agt_11c0", "unbound_bot", "rated_down_bot"]) {
      await expect(
        row(page, id).getByText(/^(on-chain reputation|prior estimate) \d/),
      ).toHaveCount(1);
    }
    await expect(
      page.getByText(/1 reputation entry could not be used/),
    ).toBeVisible();
    // The unknown source was not a defect: nothing says the batch failed.
    await expect(page.getByText(/reputation unavailable/i)).toHaveCount(0);
  });
});
