import { test, expect } from "@playwright/test";
import { mockApi, mockPlan } from "./mocks";

test.describe("orchestrator", () => {
  test("/app/orchestrator decomposes an intent into a mocked 3-step plan", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/app/orchestrator");

    // Type an intent and submit decompose.
    await page
      .getByRole("textbox", { name: /intent/i })
      .fill("code a calculator web app");
    await page.getByRole("button", { name: /decompos/i }).click();

    // The mocked POST /api/orchestrator/decompose plan renders 3 step rows.
    const steps = page.locator("ol").getByRole("listitem");
    await expect(steps).toHaveCount(mockPlan.steps.length);
    for (const step of mockPlan.steps) {
      await expect(steps.filter({ hasText: step.agent_id })).toBeVisible();
    }

    // The mocked total appears, and never as "USDC". The cap a buyer signs is
    // denominated in whatever the escrow's SAC wraps — native XLM on testnet
    // — and this mock serves no network metadata, so the honest rendering is
    // the bare figure rather than a guessed unit.
    await expect(
      page.getByText(mockPlan.total_usdc.toFixed(3), { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("main").getByText(/\bUSDC\b/)).toHaveCount(0);

    // story 3.02 — the reputation-floor block explains the plan's shape and
    // the affected steps carry inline marks, never a silent reshuffle.
    //
    // Story 3.04 collapsed that block behind a disclosure, so the reasons are
    // no longer on screen at load; the count is. That is the point of the
    // change — a plan with several floor actions used to push the steps and
    // the Authorize control down the card — so this asserts the new contract
    // rather than reaching past it: the disclosure is present and closed, it
    // says how many actions there were, and the reasons appear on opening.
    //
    // Scoped to the summary because "reputation floor" now legitimately
    // appears twice, once as this heading and once in the panel's own
    // explanation of what the floor decides.
    const floorDisclosure = page.locator("details");
    await expect(
      floorDisclosure.locator("summary").getByText(/reputation floor/i),
    ).toBeVisible();
    await expect(floorDisclosure).not.toHaveAttribute("open", /.*/);

    await floorDisclosure.locator("summary").click();
    for (const notice of mockPlan.notices) {
      await expect(page.getByText(notice.reason)).toBeVisible();
    }
    await expect(steps.filter({ hasText: "⇄ for vision.ocr" })).toBeVisible();
    await expect(steps.filter({ hasText: "▾ below floor" })).toBeVisible();
  });

  // The backend's refusals, as its envelope handler sends them. A buyer used
  // to read "POST /orchestrator/decompose → 503 — no routable agents"; each
  // now says what happened and that nothing was charged.
  const refusals = [
    { status: 503, code: "no_routable_agents", says: /no agent is available/i },
    { status: 504, code: "decompose_timeout", says: /took too long/i },
  ];
  for (const { status, code, says } of refusals) {
    test(`a ${status} ${code} reads as plain copy, not a machine string`, async ({
      page,
    }) => {
      await mockApi(page);
      // After `mockApi`, so it answers ahead of the catch-all.
      await page.route("**/api/orchestrator/decompose", (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            detail: code,
            error: { code, message: code.replace(/_/g, " "), request_id: "r1" },
          }),
        }),
      );
      await page.goto("/app/orchestrator");
      await page
        .getByRole("textbox", { name: /intent/i })
        .fill("write me a haiku");
      await page.getByRole("button", { name: /decompos/i }).click();

      // Scoped to `main`: `next dev` mounts an empty alert portal outside it.
      const alert = page.getByRole("main").getByRole("alert");
      await expect(alert).toContainText(says);
      await expect(alert).toContainText(/nothing was charged/i);
      await expect(alert).not.toContainText(/POST|\/orchestrator|→|_/);
      await expect(alert).not.toContainText(String(status));
      await expect(
        page.getByRole("heading", { name: /execution plan/i }),
      ).toHaveCount(0);
    });
  }
});
