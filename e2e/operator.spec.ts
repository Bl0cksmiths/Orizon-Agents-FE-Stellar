/**
 * The operator dashboard (story 2.06).
 *
 * The assertions that earn their keep are the exclusions. A dashboard whose
 * premise is "your agents" fails in exactly two ways, and both look fine on a
 * screenshot: it shows an agent the wallet does not own, or it renders an
 * unresolved lookup as a verdict. So the specs below check that the seeded
 * catalog agent is absent, that a disconnected wallet is told why it sees
 * nothing rather than being shown an empty list, and that an agent without an
 * endpoint is marked as such.
 */
import { test, expect } from "@playwright/test";
import {
  mockAgents,
  mockApi,
  mockApiOutage,
  mockWallet,
  mockWalletAddress,
} from "./mocks";

const SEEDED = mockAgents.find((a) => a.owner === null)!;
const OWNED = mockAgents.filter((a) => a.owner === mockWalletAddress);

test.describe("operator dashboard", () => {
  test("lists only the agents the connected wallet owns", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");

    for (const agent of OWNED) {
      await expect(
        page.getByRole("heading", { name: agent.name, exact: true }),
      ).toBeVisible();
    }
    // The seeded catalog agent has no owner, so it belongs to the marketplace
    // and never to an operator. Its presence here would be the whole page
    // being wrong while looking right.
    await expect(
      page.getByRole("heading", { name: SEEDED.name, exact: true }),
    ).toHaveCount(0);
  });

  test("counts owned agents rather than the whole registry", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");

    const tile = page
      .locator("div", { hasText: /^agents owned$/ })
      .locator("xpath=..");
    await expect(tile).toContainText(String(OWNED.length));
  });

  test("marks an owned agent that has no endpoint bound", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");

    // Every mocked agent resolves to `binding_not_found`, which is the honest
    // never-bound state — the badge has to appear, and it has to say so in
    // words rather than by colour alone.
    await expect(page.getByText("unbound").first()).toBeVisible();
  });

  test("tells a disconnected wallet why the page is empty", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/operator");

    await expect(
      page.getByRole("heading", { name: "Connect a wallet" }),
    ).toBeVisible();
    // An empty list would be indistinguishable from "you own nothing", which
    // is a different and much more alarming statement.
    await expect(
      page.getByRole("heading", { name: "This wallet owns no agents" }),
    ).toHaveCount(0);
  });

  test("announces a registry failure instead of an empty dashboard", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApiOutage(page);
    await page.goto("/app/operator");

    // This route is deliberately absent from the shared failure-states sweep:
    // that sweep mocks no wallet, and a wallet-less operator page correctly
    // shows "connect a wallet" rather than an error. The failure worth
    // catching is the one below — connected, and the registry read is down.
    // Rendering that as "this wallet owns no agents" would tell an operator
    // their agents had been deregistered.
    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "This wallet owns no agents" }),
    ).toHaveCount(0);
  });

  test("opens per-agent settings without leaving the dashboard", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");

    const toggle = page
      .getByRole("button", { name: `settings for ${OWNED[0].id}` })
      .first();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
