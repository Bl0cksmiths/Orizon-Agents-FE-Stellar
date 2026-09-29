import { test, expect } from "@playwright/test";
import { mockApi, mockOverview, mockTasks } from "./mocks";
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

    // Metric cards resolve against the mocked GET /api/metrics/overview.
    // agents_online renders localized ("2,481") in a metric card (and again
    // in the sidebar footer, hence first()); tasks_per_sec renders "1.234".
    await expect(
      page
        .getByText(mockOverview.agents_online.toLocaleString("en-US"))
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText(mockOverview.tasks_per_sec.toFixed(3)).first(),
    ).toBeVisible();

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
