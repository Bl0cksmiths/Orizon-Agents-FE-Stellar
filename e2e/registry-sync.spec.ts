/**
 * The console never shows a mid-refill registry count as final. After a
 * restart the backend's registry refills from the chain for about 45 s; a
 * backend that answers partial and then complete must leave the Overview
 * tiles and the sidebar on "syncing registry…" — with the last complete
 * figure once the session has one, dashes before — and never on the partial
 * figure. (The hero's side of this runs against a real `next start`:
 * scripts/hero-isr-check.mjs.)
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  mockAgents,
  mockApi,
  mockOverviewV2,
  mockOverviewV2Syncing,
} from "./mocks";

/** Every text the registered tile, the external tile and the sidebar line
 * show, sampled from first paint on, so a partial figure that flashed for
 * one poll is caught as surely as one that stayed. */
async function recordFigures(page: Page) {
  await page.addInitScript(() => {
    const seen = new Set<string>();
    (window as unknown as { __figures: Set<string> }).__figures = seen;
    const sample = () => {
      for (const el of document.querySelectorAll(
        "main [data-stat-tile], aside .clip-cyber",
      )) {
        seen.add((el.textContent ?? "").replace(/\s+/g, " ").trim());
      }
    };
    new MutationObserver(sample).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

const figuresSeen = (page: Page) =>
  page.evaluate(() =>
    Array.from((window as unknown as { __figures: Set<string> }).__figures),
  );

/** Answers each overview read with the next of `answers`, the last one
 * repeating; `step()` moves on. */
function overviewSequence(...answers: object[]) {
  let i = 0;
  return {
    handler: (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(answers[Math.min(i, answers.length - 1)]),
      }),
    step: () => {
      i += 1;
    },
  };
}

/** No sampled text carries mockOverviewV2Syncing's figures: its sidebar
 * line, its registered tile with its caption, its external tile, its trust. */
function expectNoPartial(seen: string[]) {
  expect(seen.length).toBeGreaterThan(0);
  for (const text of seen) {
    expect(text).not.toContain("3 agents registered");
    expect(text).not.toContain("Registered agents31 on-chain · 2 seeded");
    expect(text).not.toContain("External agents1from 1 operator wallet");
    expect(text).not.toContain("4.90");
  }
}

const tile = (page: Page, label: string) =>
  page.locator("main [data-stat-tile]").filter({ hasText: label });

test.describe("registry sync — the console", () => {
  test("a cold console waits on dashes, then states the complete figures", async ({
    page,
  }) => {
    await recordFigures(page);
    await mockApi(page);
    const overview = overviewSequence(mockOverviewV2Syncing, mockOverviewV2);
    await page.route("**/api/metrics/overview", overview.handler);
    await page.goto("/app");

    const registered = tile(page, "Registered agents");
    await expect(registered).toContainText("syncing registry…");
    await expect(registered.locator("[data-spinner]")).toBeVisible();
    await expect(registered).toContainText("not available");
    await expect(tile(page, "External agents")).toContainText(
      "syncing registry…",
    );
    await expect(page.locator("aside")).toContainText(
      "— agents registered · — external",
    );
    await expect(page.locator("aside [data-registry-syncing]")).toBeVisible();

    overview.step();
    await expect(registered).toContainText("2513 on-chain · 12 seeded", {
      timeout: 15_000,
    });
    await expect(registered).not.toContainText("syncing registry…");
    await expect(page.locator("main [data-registry-syncing]")).toHaveCount(0);

    // The partial figures never showed, not even for one poll.
    expectNoPartial(await figuresSeen(page));
  });

  test("a restart mid-session keeps the last complete figures beside a spinner", async ({
    page,
  }) => {
    await recordFigures(page);
    await mockApi(page);
    const overview = overviewSequence(
      mockOverviewV2,
      mockOverviewV2Syncing,
      mockOverviewV2,
    );
    await page.route("**/api/metrics/overview", overview.handler);
    await page.goto("/app");

    const registered = tile(page, "Registered agents");
    await expect(registered).toContainText("25");
    await expect(page.locator("aside")).toContainText(
      "25 agents registered · 11 external",
    );

    // The backend restarts: the next polls answer mid-refill.
    overview.step();
    await expect(registered).toContainText("syncing registry…", {
      timeout: 15_000,
    });
    await expect(registered).toContainText("25");
    await expect(tile(page, "External agents")).toContainText("11");
    // The sidebar reads once and again on focus, so it has not re-read yet;
    // either way it still states the complete count.
    await expect(page.locator("aside")).toContainText(
      "25 agents registered · 11 external",
    );

    overview.step();
    await expect(registered).not.toContainText("syncing registry…", {
      timeout: 15_000,
    });
    await expect(registered).toContainText("25");

    expectNoPartial(await figuresSeen(page));
  });

  test("a backend with no signal: only a count that holds is stated", async ({
    page,
  }) => {
    // Today's live backend: the legacy overview here, and an agents read with
    // no X-Registry-Synced header. The interim rule needs two reads, at
    // least 10s apart, to agree.
    await recordFigures(page);
    await mockApi(page);
    let reads = 0;
    const partial = mockAgents.slice(0, 1);
    await page.route("**/api/agents", (route) => {
      reads += 1;
      // The first read is mid-refill; every read after it is complete.
      const body = reads === 1 ? partial : mockAgents;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.goto("/app");

    const registered = tile(page, "Registered agents");
    await expect(registered).toContainText("syncing registry…");
    await expect(registered).toContainText(
      `${mockAgents.length}${mockAgents.filter((a) => a.source === "onchain").length} on-chain`,
      { timeout: 40_000 },
    );
    expect(reads).toBeGreaterThanOrEqual(3);
    const p = partial[0].source === "onchain" ? [1, 0] : [0, 1];
    for (const text of await figuresSeen(page)) {
      expect(text).not.toContain("1 agent registered");
      expect(text).not.toContain(
        `Registered agents1${p[0]} on-chain · ${p[1]} seeded`,
      );
    }
  });

  test("the agents header settles it at once", async ({ page }) => {
    await mockApi(page);
    await page.route("**/api/agents", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Registry-Synced": "true",
          "X-Registry-Count": String(mockAgents.length),
        },
        body: JSON.stringify(mockAgents),
      }),
    );
    await page.goto("/app");
    await expect(page.locator("aside")).toContainText(
      `${mockAgents.length} agents registered`,
      { timeout: 8_000 },
    );
    await expect(page.locator("[data-registry-syncing]")).toHaveCount(0);
  });
});
