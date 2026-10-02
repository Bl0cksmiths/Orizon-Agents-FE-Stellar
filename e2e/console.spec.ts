import { test, expect } from "@playwright/test";
import {
  LEGACY_FIGURES,
  mockAgents,
  mockApi,
  mockReputationBatch,
  mockTasks,
} from "./mocks";
import { mockNetwork } from "./plan-fixtures";

test.describe("console overview", () => {
  test("/app renders sidebar nav, mocked metrics, and recent tasks", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app");

    // Sidebar navigation renders its workspace items.
    const sidebar = page.locator("aside");
    for (const label of ["Overview", "Agents", "Orchestrator", "Trace"]) {
      await expect(
        sidebar.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }

    // The mocked overview is the legacy shape, so every figure is derived
    // from the registry, the adoption read and the reputation batch. With no
    // sync signal the registry counts only once two reads 10s apart agree
    // (lib/registry-sync.ts), so the first figures take a poll or two.
    const tile = (label: string) =>
      page.locator("main [data-stat-tile]").filter({ hasText: label });
    const onchain = mockAgents.filter((a) => a.source === "onchain").length;
    const seeded = mockAgents.filter((a) => a.source === "seeded").length;
    await expect(tile("Registered agents")).toContainText(
      `${mockAgents.length}${onchain} on-chain · ${seeded} seeded`,
      { timeout: 30_000 },
    );
    await expect(tile("External agents")).toContainText(
      "0from 0 operator wallets",
    );
    const rated = Object.values(mockReputationBatch.reputations).filter(
      (r) => r.source === "onchain",
    );
    const avg =
      rated.reduce((sum, r) => sum + r.smoothed_bps, 0) / rated.length / 2000;
    await expect(tile("Avg trust (on-chain)")).toContainText(
      `${avg.toFixed(2)}/ 5across ${rated.length} rated agents`,
    );
    await expect(sidebar).toContainText(
      `${mockAgents.length} agents registered · 0 external`,
      { timeout: 15_000 },
    );
    // None of the legacy overview's invented figures reaches the screen.
    await expect(page.locator("body")).not.toContainText(LEGACY_FIGURES);
    await expect(page.locator("body")).not.toContainText("2,481");

    // Recent-tasks table shows a mocked task id.
    await expect(page.getByText(mockTasks[0].id)).toBeVisible();
  });

  // F-022: a task's spend is in the escrow's asset — native XLM on testnet —
  // and with the asset unknown it carries no unit, never a guessed "USDC".
  test("/app prints each task's spend in the network's asset", async ({
    page,
  }) => {
    await mockApi(page);
    await mockNetwork(page);
    await page.goto("/app");
    const row = page.getByRole("row", { name: new RegExp(mockTasks[0].id) });
    await expect(row).toContainText(`${mockTasks[0].spent.toFixed(3)} XLM`);
    await expect(page.getByRole("main")).not.toContainText("USDC");
  });

  test("/app prints spend with no unit while the asset is unknown", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app");
    const row = page.getByRole("row", { name: new RegExp(mockTasks[0].id) });
    await expect(row).toContainText(mockTasks[0].spent.toFixed(3));
    await expect(page.getByRole("main")).not.toContainText(/USDC|XLM/);
  });
});
