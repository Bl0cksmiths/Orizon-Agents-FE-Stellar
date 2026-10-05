/**
 * The console against a backend that is asleep, slow, failing or stale — the
 * states a visitor meets on Render's free plan — each answered within a
 * second of navigation with data or a clear state, never a blank page or a
 * bare spinner.
 *
 * The browser sees the console's cache (lib/api-proxy.ts), so the mocks
 * answer as it does: a cold backend is a 503 `backend_waking` with a
 * Retry-After, a stale copy is a 200 dated by `X-Orizon-Read-At`.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  mockAdoptionWithOperator,
  mockAgents,
  mockApi,
  mockOverviewV2,
  mockReputationBatch,
} from "./mocks";

/** What the console's cache answers while the backend is waking. */
const WAKING = {
  status: 503,
  contentType: "application/json",
  headers: { "retry-after": "1" },
  body: JSON.stringify({
    detail: "the backend is waking up — this usually takes under a minute",
    error: {
      code: "backend_waking",
      message: "the backend is waking up — this usually takes under a minute",
    },
  }),
};

/**
 * Answers every read of a path as waking until `ms` after the first one, then
 * with `body` — a cold start measured in time, as it is on Render, so a
 * second reader of the same path (the sidebar reads the registry too) cannot
 * shorten it by using up a count.
 */
function wakesFor(ms: number, body: unknown) {
  let firstAt: number | null = null;
  return (route: Route) => {
    firstAt ??= Date.now();
    return Date.now() - firstAt < ms
      ? route.fulfill(WAKING)
      : route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(body),
        });
  };
}

const byPath = (path: string) => (url: URL) => url.pathname === path;

/** Alerts that say something — Next's route announcer is an empty one. */
const alerts = (page: Page) => page.getByRole("alert").filter({ hasText: /./ });

/** The page is up and saying something within a second of navigation. */
async function clearWithinASecond(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-wake-status]").first()).toBeVisible({
    timeout: 1_000,
  });
}

test.describe("a backend that is asleep", () => {
  test("the registry says it is waking, with progress, then shows the agents", async ({
    page,
  }) => {
    await mockApi(page);
    await page.route(byPath("/api/agents"), wakesFor(4_000, mockAgents));
    await clearWithinASecond(page, "/app/agents");

    const status = page.locator("[data-wake-status]").getByRole("status");
    await expect(status).toHaveText(
      "Waking the network… usually under a minute",
    );
    await expect(
      page.getByRole("progressbar", { name: "Waking the network" }),
    ).toBeVisible();
    // A wait, not a fault: nothing is announced as an error.
    await expect(alerts(page)).toHaveCount(0);

    await expect(page.getByRole("rowheader")).toHaveCount(mockAgents.length, {
      timeout: 15_000,
    });
    await expect(page.locator("[data-wake-status]")).toHaveCount(0);
  });

  test("the overview's figures wait on one line, then arrive", async ({
    page,
  }) => {
    await mockApi(page, { overview: mockOverviewV2 });
    await page.route(
      byPath("/api/metrics/overview"),
      wakesFor(2_500, mockOverviewV2),
    );
    await clearWithinASecond(page, "/app");
    await expect(alerts(page)).toHaveCount(0);
    await expect(
      page.locator("main [data-stat-tile]").filter({
        hasText: "Registered agents",
      }),
    ).toContainText(String(mockOverviewV2.agents.registered), {
      timeout: 15_000,
    });
    await expect(page.getByText("streaming")).toBeVisible();
  });

  test("the leaderboard waits instead of reporting the registry missing", async ({
    page,
  }) => {
    await mockApi(page);
    await page.route(byPath("/api/agents"), (route) => route.fulfill(WAKING));
    await page.route(byPath("/api/stellar/reputation"), (route) =>
      route.fulfill(WAKING),
    );
    await clearWithinASecond(page, "/app/reputation");
    await page.waitForTimeout(2_500);
    await expect(page.getByText(/agent registry unavailable/i)).toHaveCount(0);
    await expect(alerts(page)).toHaveCount(0);
  });
});

test.describe("a backend that is slow", () => {
  test("the overview shows its skeleton and status at once, then the figures", async ({
    page,
  }) => {
    await mockApi(page, { overview: mockOverviewV2 });
    await page.route(byPath("/api/metrics/overview"), async (route) => {
      await new Promise((r) => setTimeout(r, 3_000));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(mockOverviewV2),
      });
    });
    await clearWithinASecond(page, "/app");
    // Past a warm read's time the line says why it is taking a while.
    await expect(
      page.locator("[data-wake-status]").first().getByRole("status"),
    ).toHaveText("Waking the network… usually under a minute");
    await expect(page.locator("main [data-stat-tile]")).toHaveCount(4);
    await expect(
      page.locator("main [data-stat-tile]").filter({
        hasText: "External agents",
      }),
    ).toContainText(String(mockOverviewV2.agents.external), {
      timeout: 10_000,
    });
  });
});

test.describe("a backend that is failing", () => {
  test("a failed task list fails its own panel and leaves the figures up", async ({
    page,
  }) => {
    await mockApi(page, { overview: mockOverviewV2 });
    await page.route(byPath("/api/tasks"), (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "internal", message: "task store unavailable" },
        }),
      }),
    );
    await page.goto("/app");
    const alert = alerts(page);
    await expect(alert).toHaveCount(1, { timeout: 5_000 });
    await expect(alert).toContainText("couldn't load recent tasks");
    await expect(alert.getByRole("button", { name: "retry" })).toBeVisible();
    // The figures are not part of that failure.
    await expect(
      page.locator("main [data-stat-tile]").filter({
        hasText: "Registered agents",
      }),
    ).toContainText(String(mockOverviewV2.agents.registered));
    await expect(page.getByText("streaming")).toBeVisible();
  });

  test("a registry that cannot be read says so, with a retry", async ({
    page,
  }) => {
    await mockApi(page);
    await page.route(byPath("/api/agents"), (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not Found" }),
      }),
    );
    await page.goto("/app/agents");
    const alert = alerts(page).filter({
      hasText: /couldn't load the agent registry/,
    });
    await expect(alert).toBeVisible({ timeout: 1_000 });
    await expect(alert.getByRole("button", { name: "retry" })).toBeVisible();
  });
});

test.describe("a stale copy", () => {
  test("old figures that arrived fine say how old they are", async ({
    page,
  }) => {
    await mockApi(page, { overview: mockOverviewV2 });
    const tenMinutesAgo = Date.now() - 10 * 60_000;
    await page.route(byPath("/api/metrics/overview"), (route) =>
      route.fulfill({
        contentType: "application/json",
        headers: {
          "x-orizon-read-at": String(tenMinutesAgo),
          "x-orizon-cache": "stale",
        },
        body: JSON.stringify({
          ...mockOverviewV2,
          generated_at: tenMinutesAgo / 1_000,
        }),
      }),
    );
    await page.goto("/app");
    await expect(page.locator("[data-data-age]")).toContainText("10m ago", {
      timeout: 1_000,
    });
    await expect(alerts(page)).toHaveCount(0);
  });

  test("the ecosystem page opens on its last snapshot while adoption is read", async ({
    page,
  }) => {
    await page.addInitScript((snapshot) => {
      window.localStorage.setItem(
        "orizon:adoption-snapshot:v1",
        JSON.stringify(snapshot),
      );
    }, mockAdoptionWithOperator);
    await mockApi(page, { reputation: mockReputationBatch });
    // The adoption read never answers: minutes, on the real backend.
    await page.route(byPath("/api/ecosystem/adoption"), () => {});
    await page.goto("/app/ecosystem");
    await expect(
      page.getByText("Showing the last snapshot this browser saved"),
    ).toBeVisible({ timeout: 1_000 });
    await expect(
      page.getByRole("heading", { name: "SOW §6.3 targets" }),
    ).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
  });
});
