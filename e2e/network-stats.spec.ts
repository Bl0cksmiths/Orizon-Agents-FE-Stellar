/**
 * The network figures, end to end: the console Overview against the measured
 * overview (BE PR #103), against its degraded form, and the console and home
 * page against the legacy one — whose invented figures, the 2,481 above all,
 * must never reach a screen.
 */
import { expect, test, type Page } from "@playwright/test";
import { disputeScan } from "./dispute-axe";
import {
  LEGACY_FIGURES,
  mockApi,
  mockOverviewV2,
  mockOverviewV2Degraded,
} from "./mocks";
import { motionSettled } from "./motion-settled";

const tile = (page: Page, label: string) =>
  page.locator("main [data-stat-tile]").filter({ hasText: label });

test.describe("network figures — the measured overview", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { overview: mockOverviewV2 });
    await page.goto("/app");
    await expect(page.locator("main [data-stat-tile]")).toHaveCount(4);
  });

  test("the tiles state the mocked registered and external counts", async ({
    page,
  }) => {
    await expect(tile(page, "Registered agents")).toContainText(
      "2513 on-chain · 12 seeded",
    );
    await expect(tile(page, "External agents")).toContainText("11");
    const wallets = tile(page, "External agents").getByRole("link", {
      name: "from 7 operator wallets",
    });
    await expect(wallets).toHaveAttribute("href", "/app/ecosystem");
    await expect(tile(page, "Settled workflows")).toContainText(
      "3all time, all payers (team runs included) · testnet",
    );
    await expect(tile(page, "Avg trust (on-chain)")).toContainText(
      "3.49/ 5across 12 rated agents",
    );
    await expect(page.locator("aside")).toContainText(
      "25 agents registered · 11 external",
    );
  });

  test("the chart draws the settled series with real dates", async ({
    page,
  }) => {
    await expect(
      page.getByRole("img", { name: /^Settled workflows per day/ }),
    ).toHaveAttribute(
      "aria-label",
      "Settled workflows per day, Sep 19 to Oct 2: 3 settled workflows in total, at most 2 on Sep 30.",
    );
    await expect(page.locator("g[data-day]")).toHaveCount(14);
    // The x axis: the first and the last day.
    await expect(page.locator("figure > div[aria-hidden]")).toHaveText(
      "Sep 19Oct 2",
    );
    // The y axis: the peak and the baseline.
    await expect(
      page.locator("figure > div > div[aria-hidden] > span"),
    ).toHaveText(["2", "0"]);
  });

  test("the composition card splits the registry by source", async ({
    page,
  }) => {
    const slices = page.locator("[data-slice]");
    await expect(slices).toHaveText([
      "Seeded catalog12 · 48%",
      "On-chain · external operators11 · 44%",
      "On-chain · team or unverified owner2 · 8%",
    ]);
    await expect(
      page.getByText("6 of 13 on-chain agents have a bound endpoint"),
    ).toBeVisible();
    await expect(page.locator("[data-skill]")).toHaveText([
      "research · 2 agents",
      "seo · 2 agents",
    ]);
  });

  test("the overview passes axe, contrast included", async ({ page }) => {
    await expect(page.locator("g[data-day]")).toHaveCount(14);
    await motionSettled(page.locator("main"));
    expect(await disputeScan(page)).toEqual([]);
  });
});

test("network figures — a degraded overview shows reasons, never zeros", async ({
  page,
}) => {
  await mockApi(page, { overview: mockOverviewV2Degraded });
  await page.goto("/app");

  await expect(tile(page, "External agents")).toContainText(
    "—not availableCouldn't verify agent owners right now",
  );
  await expect(tile(page, "Settled workflows")).toContainText(
    "Couldn't read settlements right now",
  );
  await expect(tile(page, "Avg trust (on-chain)")).toContainText(
    "Couldn't read on-chain reputation right now",
  );
  await expect(
    page.getByText(
      "Settled-workflow history unavailable — Couldn't read settlements right now.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/couldn't read part of the network just now/),
  ).toBeVisible();
  await expect(page.locator("[data-slice]")).toHaveText([
    "Seeded catalog12 · 48%",
    "On-chain13 · 52%",
  ]);
  await expect(page.locator("aside")).toContainText(
    "25 agents registered · — external",
  );
  for (const label of ["External agents", "Settled workflows"]) {
    await expect(tile(page, label)).not.toContainText(/\d/);
  }
});

test.describe("network figures — no invented figure anywhere", () => {
  test("the console never shows the legacy overview's figures", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app");
    await expect(page.locator("main [data-stat-tile]")).toHaveCount(4);
    await expect(page.locator("body")).not.toContainText("2,481");
    await expect(page.locator("body")).not.toContainText(LEGACY_FIGURES);
    await expect(page.locator("body")).not.toContainText(/agents online/i);
  });

  test("the home page shows no invented network stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const body = page.locator("body");
    await expect(body).not.toContainText("2,481");
    await expect(body).not.toContainText(/1\.2k|99\.3%|Tasks\/s/);
    // The stat row is either the server's measured read or absent; it never
    // carries a figure without its source line.
    const row = page.locator("[data-hero-stats]");
    if ((await row.count()) > 0) {
      await expect(row).toContainText("Read from the Stellar testnet registry");
    }
  });
});
