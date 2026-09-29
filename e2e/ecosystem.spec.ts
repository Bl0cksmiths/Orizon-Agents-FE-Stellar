/**
 * The Ecosystem page and the operator onboarding checklist (story 5.02).
 *
 * Both are read by someone checking a claim: a reviewer clicking through SOW
 * §6.3 evidence, or an outside operator on a call finding out which step they
 * are stuck on. So the specs assert what each must say — a miss as a miss, a
 * team-funded payment as team-funded, a partial read as a gap — that every
 * piece of evidence is a link, and that both hold at a phone's 360px as well
 * as on a desktop, under the contrast-honest axe scan the dispute UI uses.
 */
import { test, expect, type Page } from "@playwright/test";
import { disputeScan } from "./dispute-axe";
import { horizontalOverflow } from "./dispute-layout";
import { mockNetwork } from "./plan-fixtures";
import {
  mockAdoptionWithOperator,
  mockAgents,
  mockApi,
  mockApiOutage,
  mockExternalSettlementTx,
  mockPlatformKey,
  mockReadiness,
  mockTeamWallet,
  mockWallet,
  mockWalletAddress,
} from "./mocks";

const PHONE = { width: 360, height: 780 };
const WINDOW =
  "Settled workflows counted over the last 7 days of ledger history — older settlements are not shown here; each transaction stays verifiable on Stellar Expert.";
const OWNED = mockAgents.filter((a) => a.owner === mockWalletAddress);

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

function target(page: Page, label: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: label, exact: true }),
  });
}

test.describe("ecosystem page", () => {
  test("states today's zeros as three misses and lists our wallets", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/ecosystem");

    await expect(page.getByText("0 of 3 targets met.")).toBeVisible();
    await expect(target(page, "Externally operated agents")).toContainText(
      "Not met: 0 of 2, short by 2.",
    );
    await expect(target(page, "Unique operator wallets")).toContainText(
      "Not met: 0 of 2, short by 2.",
    );
    await expect(
      target(page, "Workflows routed to external agents and settled"),
    ).toContainText("Not met: 0 of 3, short by 3.");
    await expect(page.locator("progress, [role=progressbar]")).toHaveCount(0);
    // This fixture is a backend that sends no window: nothing is guessed.
    await expect(page.locator("main")).not.toContainText("ledger history");

    await expect(
      page.getByRole("heading", { name: "No external operators yet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Register an agent" }),
    ).toHaveAttribute("href", "/app/register");

    const excluded = page.getByRole("table", {
      name: "Wallets we control, which are not counted",
    });
    await expect(excluded.getByRole("row")).toHaveCount(3);
    await expect(excluded).toContainText("Platform key");
    await expect(excluded).toContainText("Team wallet");
    await expect(excluded.getByRole("link", { name: /GA7A…/ })).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${mockPlatformKey}`,
    );
  });

  test("labels a team-funded payer and a partial read", async ({ page }) => {
    await mockApi(page, { adoption: mockAdoptionWithOperator });
    // Registered after mockApi so it wins: the network reports the testnet
    // SAC wrapping native XLM.
    await mockNetwork(page);
    await page.goto("/app/ecosystem");

    await expect(
      page.getByText("Couldn't verify 1 agent right now.", { exact: false }),
    ).toBeVisible();
    await expect(target(page, "Externally operated agents")).toContainText(
      "Met: 2 of 2.",
    );
    // The settled count covers a ledger window, and says so where it is
    // counted and where each agent's settlements are listed.
    await expect(
      target(page, "Workflows routed to external agents and settled"),
    ).toContainText(WINDOW);
    await expect(target(page, "Externally operated agents")).not.toContainText(
      "ledger history",
    );
    await expect(page.getByText(WINDOW, { exact: true })).toHaveCount(3);
    await expect(
      page.getByText("No settled workflows in the last 7 days.", {
        exact: true,
      }),
    ).toBeVisible();

    const table = page.getByRole("table", {
      name: "Settled workflows for ext.translate_long_identifier_v2",
    });
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).not.toContainText("team-funded");
    await expect(rows.nth(2)).toContainText(
      "team-funded: Blocksmiths developer",
    );
    // Testnet settles in native XLM, whatever the wire field is called.
    await expect(rows.nth(1)).toContainText("0.0125 XLM");
    await expect(table).not.toContainText("USDC");
    await expect(
      rows.nth(1).getByRole("link", { name: /^tx 4f1d0c9a…/ }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${mockExternalSettlementTx}`,
    );
    await expect(
      rows.nth(2).getByRole("link", { name: /GCTE…/ }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${mockTeamWallet}`,
    );
  });

  test("names every explorer link as a new tab and reads each job id in full", async ({
    page,
  }) => {
    await mockApi(page, { adoption: mockAdoptionWithOperator });
    await page.goto("/app/ecosystem");
    const table = page.getByRole("table", {
      name: "Settled workflows for ext.translate_long_identifier_v2",
    });
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(3);

    await expect(
      rows.nth(1).getByRole("link", {
        name: "tx 4f1d0c9a… on Stellar Expert (opens in a new tab)",
        exact: true,
      }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      rows.nth(2).getByRole("link", {
        name: `${mockTeamWallet.slice(0, 4)}…${mockTeamWallet.slice(-4)} — ${mockTeamWallet}, on Stellar Expert (opens in a new tab)`,
        exact: true,
      }),
    ).toHaveAttribute("target", "_blank");
    // Every link on the page that opens a new tab says so in its name.
    const away = page.locator('main a[target="_blank"]');
    const count = await away.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < count; i++) {
      await expect(away.nth(i)).toHaveAccessibleName(/\(opens in a new tab\)$/);
    }

    // The job cell is heard as the whole id; the short form is only seen.
    for (const [n, id] of [
      [1, "7c2e9b41d05a4f38a6e1b9c3d7f20a58"],
      [2, "8d3f0c52e16b5049b7f2c0d4e8031b69"],
    ] as const) {
      await expect(
        rows.nth(n).getByRole("cell", { name: id, exact: true }),
      ).toHaveCount(1);
      await expect(rows.nth(n)).toContainText(`${id.slice(0, 8)}…`);
      // In the text itself, not only in a `title` a phone never shows.
      await expect(rows.nth(n).getByRole("cell").first()).toContainText(id);
    }
  });

  test("announces a failed read instead of reporting no operators", async ({
    page,
  }) => {
    await mockApiOutage(page);
    await page.goto("/app/ecosystem");
    await expect(page.locator('[role="alert"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "No external operators yet" }),
    ).toHaveCount(0);
  });

  test("is reachable from the console nav", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app/operator");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Ecosystem", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/ecosystem$/);
    await expect(
      page.getByRole("heading", { name: "Ecosystem", level: 1 }),
    ).toBeVisible();
  });

  for (const [name, adoption] of [
    ["zero", undefined],
    ["populated", mockAdoptionWithOperator],
  ] as const) {
    test(`${name}: no WCAG A/AA violations on a desktop`, async ({ page }) => {
      await mockApi(page, adoption ? { adoption } : {});
      await page.goto("/app/ecosystem");
      await expect(
        page.getByRole("heading", { name: "Wallets we control (not counted)" }),
      ).toBeVisible();
      expect(await disputeScan(page)).toEqual([]);
    });

    test(`${name}: fits 360px with tables stacked and no violations`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await mockApi(page, adoption ? { adoption } : {});
      await page.goto("/app/ecosystem");
      await expect(
        page.getByRole("heading", { name: "Wallets we control (not counted)" }),
      ).toBeVisible();

      expect(await horizontalOverflow(page.locator("main"))).toEqual([]);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      // Stacked: each row is its own block, one above the next, rather than
      // cells side by side past the edge.
      const rows = page
        .getByRole("table", {
          name: "Wallets we control, which are not counted",
        })
        .getByRole("row");
      const first = await rows.nth(1).boundingBox();
      const second = await rows.nth(2).boundingBox();
      expect(first && second && second.y >= first.y + first.height).toBe(true);
      expect(await disputeScan(page)).toEqual([]);
    });
  }
});

test.describe("operator onboarding checklist", () => {
  test("shows each owned agent's seven steps and its next one", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");

    for (const agent of OWNED) {
      const steps = page.getByRole("list", {
        name: `Onboarding steps for ${agent.id}`,
      });
      await expect(steps.getByRole("listitem")).toHaveCount(7);
      await expect(steps.getByRole("listitem").nth(0)).toContainText("Done");
      await expect(steps.getByRole("listitem").nth(3)).toContainText(
        "Couldn't check",
      );
      await expect(steps.getByRole("listitem").nth(6)).toContainText("Failed");
      await expect(steps.locator('[aria-current="step"]')).toContainText(
        "Endpoint bound",
      );
    }
    const first = OWNED[0].id;
    const next = page
      .getByText("Next: Endpoint bound", { exact: false })
      .first()
      .locator("xpath=ancestor::div[1]");
    await expect(next).toContainText("Bind an HTTPS endpoint you control.");
    await expect(next.getByRole("link", { name: "Open Bind" })).toHaveAttribute(
      "href",
      `/app/bind?agent=${first}`,
    );
    await expect(
      page
        .getByRole("list", { name: `Onboarding steps for ${first}` })
        .getByRole("link", { name: /^tx 4f1d0c9a…/ }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${mockExternalSettlementTx}`,
    );
  });

  test("re-checks, stamps the time and announces the result", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");
    const agent = OWNED[0].id;
    const section = page.locator("section").filter({
      has: page.getByRole("list", { name: `Onboarding steps for ${agent}` }),
    });
    await expect(section.getByRole("listitem")).toHaveCount(7);
    const live = section.locator('[role="status"][aria-live="polite"]');
    await expect(live).toHaveText("");

    // A newer check in which the endpoint is now bound.
    // A glob, not the mock's pathname regex: `page.route` matches the whole
    // URL, origin included.
    await page.route("**/api/agents/*/readiness", (route) => {
      const fresh = mockReadiness(agent, 1_759_046_460);
      fresh.steps[2] = { ...fresh.steps[2], status: "done", action: null };
      return route.fulfill({ json: fresh });
    });
    const button = section.getByRole("button", {
      name: `Re-check onboarding for ${agent}`,
    });
    await button.focus();
    await page.keyboard.press("Enter");

    await expect(live).toHaveText(
      `Re-checked ${agent}: 3 of 7 steps done. Next: Endpoint reachable.`,
    );
    await expect(section.locator('[aria-current="step"]')).toContainText(
      "Endpoint reachable",
    );
    await expect(section).toContainText(
      "The backend caches this check for about 30 seconds",
    );
    await expect(section.locator("time")).toHaveAttribute(
      "datetime",
      new Date(1_759_046_460_000).toISOString(),
    );
  });

  test("has no WCAG A/AA violations on a desktop", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");
    await expect(page.getByText("Next: Endpoint bound").first()).toBeVisible();
    expect(await disputeScan(page)).toEqual([]);
  });

  test("fits 360px without sideways overflow or violations", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/operator");
    const steps = page.getByRole("list", {
      name: `Onboarding steps for ${OWNED[0].id}`,
    });
    await expect(steps.getByRole("listitem")).toHaveCount(7);
    const section = page.locator("section").filter({ has: steps });
    expect(await horizontalOverflow(section)).toEqual([]);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    expect(await disputeScan(page)).toEqual([]);
  });
});
