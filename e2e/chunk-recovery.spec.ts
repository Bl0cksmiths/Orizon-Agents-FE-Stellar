/**
 * A page whose code is gone reloads itself; it never shows a crash screen.
 *
 * The production fault this guards: a visitor has a page open, a new deploy
 * lands, and the next navigation asks for a chunk of the old build, which
 * answers 404. webpack throws a ChunkLoadError into the nearest error
 * boundary, and the visitor used to get the "SYSTEM FAULT" screen. Now the
 * boundary reloads the page once (lib/use-error-recovery.ts), the reload
 * fetches the current build, and the page simply appears.
 *
 * Two chunks are lost at the network: the code viewer, which the trace page
 * loads lazily (next/dynamic) only when its files tab opens — the kind of
 * chunk a page asks for long after it loaded — and the /evidence route's own
 * chunk on a client navigation. (Next 14.2 recovers some lost route chunks
 * itself, by falling back to a full navigation when the loss surfaces while
 * it is still reading the RSC payload; a loss that surfaces during render
 * reaches the boundary.) A recorder in every document notes whether the error
 * screen's heading was ever put on screen, so "no crash screen" is checked
 * for the whole run, not just its end.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { WCAG_TAGS, disputeScan } from "./dispute-axe";
import {
  mockApi,
  mockArtifactResponse,
  mockDisputeApi,
  mockDisputeTaskId,
  mockSettlementView,
  mockTraceStream,
} from "./mocks";
import { AUTO_RELOAD_KEY } from "../lib/error-recovery";

const CODE_VIEWER_CHUNK = /\/_next\/static\/chunks\/[^?]*code-viewer[^/?]*\.js/;
const TRACE = `/app/trace?task=${mockDisputeTaskId}`;
const EVIDENCE_CHUNK =
  /\/_next\/static\/chunks\/app\/\(marketing\)\/evidence\/page[^/]*\.js/;
const ERROR_HEADING = "This page didn't load";

/** Counts the documents loaded for `path`, and records any error screen. */
async function watch(page: Page, path: string) {
  const seen = { documents: 0, errorScreens: 0 };
  page.on("request", (r) => {
    if (r.isNavigationRequest() && new URL(r.url()).pathname === path) {
      seen.documents += 1;
    }
  });
  await page.exposeFunction("__errorScreenSeen", () => {
    seen.errorScreens += 1;
  });
  await page.addInitScript((heading) => {
    const look = () => {
      const shown = [...document.querySelectorAll("h1")].some(
        (h) => h.textContent === heading,
      );
      if (shown)
        (
          window as unknown as { __errorScreenSeen: () => void }
        ).__errorScreenSeen();
    };
    new MutationObserver(look).observe(document, {
      childList: true,
      subtree: true,
    });
  }, ERROR_HEADING);
  return seen;
}

/** Removes the development server's error badge, which production never
 * shows, so axe judges only the page. */
async function hideDevOverlay(page: Page) {
  await page.evaluate(() =>
    document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()),
  );
}

/** Opens a finished workflow on its artifact tab, the backend mocked. */
async function openArtifact(page: Page) {
  await mockApi(page, { artifact: mockArtifactResponse });
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, {
    settlement: mockSettlementView({
      settledAtS: Math.floor(Date.now() / 1000) - 60 * 60,
    }),
  });
  await page.goto(TRACE);
  await expect(page.getByRole("tab", { name: /artifact/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

/** Answers 404 for `chunk`, the first `times` it is asked for. */
async function lose(page: Page, chunk: RegExp, times = Infinity) {
  let lost = 0;
  await page.route(chunk, async (route) => {
    if (lost < times) {
      lost += 1;
      await route.fulfill({ status: 404, body: "Not Found" });
    } else {
      await route.continue();
    }
  });
}

/**
 * Runs `act`, then waits for the automatic reload it should cause: the next
 * document's `load`, and the guard stamp that reload left in the tab's
 * session. Waiting on the reload itself, not on a count of requests, keeps
 * the next step off the old document while it is still being torn down.
 * Without an automatic reload no `load` comes, and this fails.
 */
async function expectAutomaticReload(page: Page, act: () => Promise<void>) {
  const loaded = page.waitForEvent("load", { timeout: 30_000 });
  await act();
  await loaded;
  const stamp = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    AUTO_RELOAD_KEY,
  );
  expect(stamp, "the reload's guard stamp").not.toBeNull();
}

test.describe("a chunk lost to a deploy", () => {
  test("reloads a console page whose lazy chunk is gone, once, and the page works with no error screen", async ({
    page,
  }) => {
    const seen = await watch(page, "/app/trace");
    await openArtifact(page);
    seen.documents = 0;

    await lose(page, CODE_VIEWER_CHUNK, 1);
    await expectAutomaticReload(page, () =>
      page.getByRole("tab", { name: "files" }).click(),
    );
    expect(seen.documents).toBe(1);

    // The reloaded page reopens the workflow; its code viewer now loads.
    await expect(page.getByRole("tab", { name: /artifact/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "files" }).click();
    await expect(page.locator("pre code .token").first()).toBeVisible();
    expect(seen.errorScreens).toBe(0);
  });

  test("reloads a public page once, and the page appears with no error screen", async ({
    page,
  }) => {
    const seen = await watch(page, "/evidence");
    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await lose(page, EVIDENCE_CHUNK, 1);
    await expectAutomaticReload(page, () =>
      page.evaluate(() => {
        const link = document.querySelector<HTMLAnchorElement>(
          'a[href="/evidence"]',
        );
        if (!link) throw new Error("no link to /evidence on /guide");
        link.click();
      }),
    );
    expect(seen.documents).toBe(1);

    await expect(page).toHaveURL(/\/evidence$/);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main h1")).not.toHaveText(ERROR_HEADING);
    expect(seen.errorScreens).toBe(0);
  });
});

/**
 * The reload guard: a chunk lost again within a minute of the automatic
 * reload means the reload did not fix it, so the calm screen is shown and the
 * page is not reloaded again. The visit starts as if that reload had just
 * happened.
 */
async function justReloaded(page: Page) {
  await page.evaluate(
    (key) => sessionStorage.setItem(key, String(Date.now())),
    AUTO_RELOAD_KEY,
  );
}

test.describe("a chunk lost again right after the automatic reload", () => {
  test("the console screen offers Reload and the way back, without reloading again, and passes axe", async ({
    page,
  }) => {
    const seen = await watch(page, "/app/trace");
    await openArtifact(page);
    seen.documents = 0;
    await justReloaded(page);

    await lose(page, CODE_VIEWER_CHUNK);
    await page.getByRole("tab", { name: "files" }).click();

    const heading = page.getByRole("heading", {
      level: 1,
      name: ERROR_HEADING,
    });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    await expect(heading).toBeFocused();
    await expect(
      page.getByText("Orizon was updated while this page was open."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to the overview" }),
    ).toHaveAttribute("href", "/app");
    // The console shell survived around it.
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByText(/fault/i)).toHaveCount(0);

    // No reload: the guard held.
    await page.waitForTimeout(3_000);
    expect(seen.documents).toBe(0);

    await hideDevOverlay(page);
    expect(await disputeScan(page)).toEqual([]);
  });

  test("the public screen offers Reload and the way home, without reloading again, and passes axe", async ({
    page,
  }) => {
    const seen = await watch(page, "/evidence");
    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await justReloaded(page);

    await lose(page, EVIDENCE_CHUNK);
    await page.evaluate(() => {
      document.querySelector<HTMLAnchorElement>('a[href="/evidence"]')?.click();
    });

    const heading = page.getByRole("heading", {
      level: 1,
      name: ERROR_HEADING,
    });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    await expect(heading).toBeFocused();
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to the home page" }),
    ).toHaveAttribute("href", "/");
    await page.waitForTimeout(3_000);
    expect(seen.documents).toBe(0);

    await hideDevOverlay(page);
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(
      violations.map(
        (v) => `${v.id} [${v.impact}] ${v.nodes.length} — ${v.help}`,
      ),
    ).toEqual([]);
  });

  test("the public screen fits a phone without sideways scrolling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await justReloaded(page);
    await lose(page, EVIDENCE_CHUNK);
    await page.evaluate(() => {
      document.querySelector<HTMLAnchorElement>('a[href="/evidence"]')?.click();
    });
    await expect(
      page.getByRole("heading", { level: 1, name: ERROR_HEADING }),
    ).toBeVisible({ timeout: 30_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
