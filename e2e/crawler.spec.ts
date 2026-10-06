/**
 * The public pages as Google's renderer sees them.
 *
 * The incident this guards: Google listed orizons.xyz as "system fault", with
 * the old last-resort error screen's words as the snippet. When Googlebot
 * rendered the home page, an error escaped the root layout, and
 * app/global-error.tsx replaced the whole document, <title> included; Google
 * took the screen's heading for the title and indexed the error as the page.
 *
 * The emulation: Googlebot Smartphone's user agent, a phone-width viewport
 * that grows to the page's full height once it has loaded (the renderer never
 * scrolls), no service worker, no stored state, no permissions. The
 * renderer also runs on virtual time, so a timer the page sets fires as soon
 * as the page is otherwise idle: every visit here fast-forwards the page's
 * clock past webpack's 120-second chunk timeout, the timer that turns a
 * script the renderer could not fetch into a ChunkLoadError.
 */
import { test, expect, type Page } from "@playwright/test";
import { AUTO_RELOAD_KEY } from "../lib/error-recovery";
import { DEMO_PUBLISHED_PORT } from "./demo-server";
import { mockApi } from "./mocks";
import {
  FAULTS_GLOBAL,
  injectedFaultMessage,
  type FaultPoint,
} from "../lib/fault-injection";

/** Googlebot Smartphone's layout width, in CSS pixels. */
const CRAWL_WIDTH = 412;

const GOOGLEBOT_SMARTPHONE =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

test.use({
  userAgent: GOOGLEBOT_SMARTPHONE,
  viewport: { width: CRAWL_WIDTH, height: 1200 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
});

/** A public page, and what it says it is. */
type PublicPage = { path: string; title: string | RegExp; h1: RegExp };

const PUBLIC_PAGES: PublicPage[] = [
  {
    path: "/",
    title: "Orizon Agents — Orchestration for autonomous digital labor",
    h1: /^The orchestration layer for autonomous digital labor\.$/,
  },
  {
    path: "/evidence",
    title: "Evidence index: every claim linked to its proof — Orizon Agents",
    h1: /evidence index/i,
  },
  {
    path: "/demo",
    title: "Demo: Orizon Agents, end to end — Orizon Agents",
    h1: /^Orizon Agents, end to end$/,
  },
  {
    path: "/guide",
    title: "Guides — Orizon Agents",
    h1: /^Operator guides$/,
  },
  {
    path: "/litepaper",
    // The fixture book's title and version, whichever book is served.
    title: /Litepaper.*, v[\d.]+ — Orizon Agents$/,
    h1: /Litepaper/,
  },
];

/** Set by playwright.crawl.config.ts: the suite runs against `next start`. */
const PRODUCTION = process.env.CRAWL_PRODUCTION === "1";

const HOME = PUBLIC_PAGES[0];

/** The guide itself, whose code blocks carry copy buttons. */
const GUIDE_PAGE: PublicPage = {
  path: "/guide/list-your-agent",
  title: "List your agent on Orizon — Orizon Agents",
  h1: /^List your agent on Orizon$/,
};

/** /demo with its video published, from the second server's fixture. */
const PUBLISHED_DEMO: PublicPage = {
  ...PUBLIC_PAGES[2],
  path: `http://localhost:${DEMO_PUBLISHED_PORT}/demo`,
};

/** The development build's chunks for the two telemetry components. */
const TELEMETRY_CHUNK =
  /\/_next\/static\/chunks\/[^?]*vercel_(analytics|speed-insights)[^/?]*\.js/;
/** The home page's own chunk, in a development or a production build. */
const PAGE_CHUNK = /\/_next\/static\/chunks\/app\/page(-[0-9a-f]+)?\.js/;
/** The root layout's own chunk. */
const LAYOUT_CHUNK = /\/_next\/static\/chunks\/app\/layout(-[0-9a-f]+)?\.js/;
/** The /evidence route's own chunk. */
const EVIDENCE_CHUNK =
  /\/_next\/static\/chunks\/app\/\(marketing\)\/evidence\/page[^/]*\.js/;

/** The scripts they inject: Vercel's CDN in development, /_vercel/ live. */
const TELEMETRY_SCRIPT =
  /va\.vercel-scripts\.com\/|\/_vercel\/(insights|speed-insights)\//;

/** Past webpack's chunk-load timeout (120s): any chunk still pending fails. */
const VIRTUAL_TIME_MS = 125_000;

/** Every error the page throws that nothing caught, by message. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Opens `path` as the renderer would: it loads the page, grows the viewport
 * to the page's full height (the renderer never scrolls, so this is how
 * content further down comes into view), and runs the page's clock on past
 * every pending timeout, as the renderer's virtual time does.
 */
async function render(page: Page, path: string) {
  await page.clock.install();
  await mockApi(page);
  const response = await page.goto(path);
  expect(response?.status(), `${path} answers 200`).toBe(200);
  await page.waitForLoadState("networkidle");
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.setViewportSize({ width: CRAWL_WIDTH, height });
  await page.clock.runFor(VIRTUAL_TIME_MS);
}

/** The page is itself: its own title and heading, and no error screen. */
async function expectRealPage(page: Page, { path, title, h1 }: PublicPage) {
  await expect(page, `${path}'s own title`).toHaveTitle(title);
  await expect(page.locator("main h1")).toHaveText(h1);
  await expect(page.locator("[data-error-boundary]")).toHaveCount(0);
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]'),
  ).toHaveCount(0);
}

/** No scroll entrance is still waiting at opacity 0 (components/ui/
 * reveal-on-scroll.tsx): the renderer sees every section. */
async function expectEverySectionShown(page: Page) {
  await expect
    .poll(() =>
      page
        .locator(".reveal")
        .evaluateAll(
          (els) =>
            els.filter((el) => getComputedStyle(el).opacity !== "1").length,
        ),
    )
    .toBe(0);
}

test.describe("Googlebot renders each public page as itself", () => {
  for (const spec of PUBLIC_PAGES) {
    test(`${spec.path} keeps its title and heading, with no error`, async ({
      page,
    }) => {
      const errors = collectPageErrors(page);
      await render(page, spec.path);
      await expectRealPage(page, spec);
      await expectEverySectionShown(page);
      expect(errors).toEqual([]);
    });
  }

  test("/demo with its video published keeps its title and heading, with no error", async ({
    page,
  }) => {
    test.skip(PRODUCTION, "the production run serves the unpublished demo");
    const errors = collectPageErrors(page);
    await render(page, PUBLISHED_DEMO.path);
    await expectRealPage(page, PUBLISHED_DEMO);
    await expect(page.locator('[data-demo-player="facade"]')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
});

/** Makes the named parts throw in this page's renders (lib/fault-injection.ts). */
async function breakParts(page: Page, parts: FaultPoint[]) {
  await page.addInitScript(
    ({ key, parts }) => {
      (window as unknown as Record<string, unknown>)[key] = parts;
    },
    { key: FAULTS_GLOBAL, parts },
  );
}

test.describe("a part that fails stays local, and the page stays itself", () => {
  test("the wallet provider throwing leaves the page whole", async ({
    page,
  }) => {
    await breakParts(page, ["wallet"]);
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    // Where the page offers a wallet, it says the wallet is unavailable.
    await expect(page.getByText("Wallet unavailable").first()).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Connect Wallet" }),
    ).toHaveCount(0);
  });

  test("the analytics and speed insights code failing to load leaves the page whole", async ({
    page,
  }) => {
    // Their components load in chunks of their own (components/telemetry.tsx),
    // named after their packages in a development build.
    test.skip(PRODUCTION, "a production build names its chunks by hash");
    const lost: string[] = [];
    await page.route(TELEMETRY_CHUNK, async (route) => {
      lost.push(route.request().url());
      await route.fulfill({ status: 404, body: "Not Found" });
    });
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    expect(lost.some((u) => u.includes("vercel_analytics"))).toBe(true);
    expect(lost.some((u) => u.includes("vercel_speed-insights"))).toBe(true);
  });

  test("the analytics scripts throwing leaves the page whole", async ({
    page,
  }) => {
    let served = 0;
    await page.route(TELEMETRY_SCRIPT, async (route) => {
      served += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: 'throw new Error("analytics script broke");',
      });
    });
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    expect(served).toBeGreaterThan(0);
  });

  test("the nav throwing leaves a plain nav, and the page whole", async ({
    page,
  }) => {
    await breakParts(page, ["nav"]);
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    const banner = page.getByRole("banner");
    await expect(banner).toHaveAttribute("data-nav", "static");
    await expect(
      banner.getByRole("link", { name: "Orizon Agents — home" }),
    ).toHaveAttribute("href", "/");
    await expect(
      banner.getByRole("link", { name: /launch app/i }),
    ).toHaveAttribute("href", "/app");
  });

  test("the nav's wallet control throwing leaves the nav, and the page whole", async ({
    page,
  }) => {
    await breakParts(page, ["connect-wallet"]);
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    const banner = page.getByRole("banner");
    await expect(banner).toHaveAttribute("data-nav", "interactive");
    await expect(banner.getByText("Wallet unavailable").first()).toBeAttached();
    await expect(
      banner.getByRole("button", { name: "Open menu" }),
    ).toBeVisible();
  });

  test("the scroll entrances throwing leave every section shown", async ({
    page,
  }) => {
    await breakParts(page, ["reveal"]);
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    // The sections wait at opacity 0 for the observer that failed; its
    // stand-in shows them all at rest.
    expect(await page.locator(".reveal").count()).toBeGreaterThan(0);
    await expectEverySectionShown(page);
  });

  test("the use cases throwing leave them listed, and the page whole", async ({
    page,
  }) => {
    await breakParts(page, ["use-cases"]);
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    const section = page.locator("#use-cases");
    await expect(section).toHaveAttribute("data-use-cases", "static");
    for (const title of [
      "Startup Builder",
      "Autonomous Marketing",
      "Research Automation",
      "Smart Contract Analysis",
    ]) {
      await expect(section.getByRole("heading", { name: title })).toBeVisible();
    }
    await expectEverySectionShown(page);
  });

  test("the backend warm-up throwing leaves the page whole", async ({
    page,
  }) => {
    const logged: string[] = [];
    page.on("console", (m) => logged.push(m.text()));
    await breakParts(page, ["backend-warmup"]);
    await render(page, HOME.path);
    await expectRealPage(page, HOME);
    // It drew nothing to look for, so the proof it failed is its report.
    expect(logged.join("\n")).toContain(injectedFaultMessage("backend-warmup"));
  });

  test("the demo player throwing leaves a plain player for each part", async ({
    page,
  }) => {
    test.skip(PRODUCTION, "the production run serves the unpublished demo");
    await breakParts(page, ["demo-player"]);
    await render(page, PUBLISHED_DEMO.path);
    await expectRealPage(page, PUBLISHED_DEMO);
    // Each part keeps its poster, its YouTube link and its chapters, as
    // plain links to the video.
    await expect(page.locator('[data-demo-player="static"]')).toHaveCount(2);
    for (const n of [1, 2]) {
      await expect(
        page.getByRole("link", { name: `Watch part ${n} on YouTube` }),
      ).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/watch\?v=/);
    }
    await expect(
      page.locator('ol a[href*="youtube.com/watch"][href*="&t="]').first(),
    ).toBeVisible();
  });

  test("the copy buttons throwing leave the guide and its code", async ({
    page,
  }) => {
    await breakParts(page, ["copy-button"]);
    await render(page, GUIDE_PAGE.path);
    await expectRealPage(page, GUIDE_PAGE);
    expect(await page.locator("main pre code").count()).toBeGreaterThan(0);
    await expect(page.locator("main pre code").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Copy / })).toHaveCount(0);
  });
});

/** Answers 404 for every request matching `chunk`; returns the count. */
async function loseChunk(page: Page, chunk: RegExp) {
  const lost = { count: 0 };
  await page.route(chunk, async (route) => {
    lost.count += 1;
    await route.fulfill({ status: 404, body: "Not Found" });
  });
  return lost;
}

test.describe("a page whose own code never arrives", () => {
  // Deploy skew as the renderer meets it: the HTML names chunks the site no
  // longer serves (or the renderer chose not to fetch), and virtual time
  // turns the wait into a ChunkLoadError at once.
  test("keeps its content, with plain stand-ins for its interactive parts", async ({
    page,
  }) => {
    const lost = await loseChunk(page, PAGE_CHUNK);
    await render(page, HOME.path);
    expect(lost.count).toBeGreaterThan(0);
    await expectRealPage(page, HOME);
    // Whatever the lost chunk held (in a development build, every client
    // part of the page; in a production one, those only this page uses) is
    // replaced by its stand-in, and every section still reads.
    await expect(page.getByRole("banner")).toBeVisible();
    for (const title of ["Startup Builder", "Smart Contract Analysis"]) {
      await expect(page.locator("#use-cases").getByText(title)).toBeVisible();
    }
    await expectEverySectionShown(page);
  });
});

/**
 * Makes the page's automatic reload look already spent, so the error screen
 * shows instead of reloading: the stamp reads as "a moment ago" at `at`.
 */
async function reloadAlreadySpent(page: Page, at: number) {
  await page.addInitScript(
    ({ key, at }) => sessionStorage.setItem(key, String(at)),
    { key: AUTO_RELOAD_KEY, at },
  );
}

/** The error screen is never indexed: noindex in <head>. */
async function expectNoindex(page: Page) {
  await expect(
    page.locator('head meta[name="robots"][content="noindex"]'),
  ).toHaveCount(1);
}

test.describe("an error screen is never indexed as the page", () => {
  test("the site's error screen carries noindex, under the page's own title", async ({
    page,
  }) => {
    test.skip(
      PRODUCTION,
      "a production build loads a route whose chunk is lost in navigation in full instead",
    );
    // A route's code lost on the way to it reaches the route's error screen
    // (e2e/chunk-recovery.spec.ts); with the reload spent, it stays up.
    await page.goto("/guide");
    // Through the menu, as a visitor would: it opens only once the page has
    // hydrated, so the link below is followed by the router, not reloaded.
    const sheet = page.getByRole("dialog");
    await expect(async () => {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(sheet).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page.evaluate(
      (key) => sessionStorage.setItem(key, String(Date.now())),
      AUTO_RELOAD_KEY,
    );
    await loseChunk(page, EVIDENCE_CHUNK);
    await sheet.locator('a[href="/evidence"]').click();
    await expect(page.locator('[data-error-boundary="root"]')).toBeVisible({
      timeout: 30_000,
    });
    await expectNoindex(page);
    await expect(page).not.toHaveTitle("");
    await expect(page).not.toHaveTitle(/didn't load|fault/i);
  });

  test("the last-resort screen names the document and carries noindex", async ({
    page,
  }) => {
    test.skip(
      !PRODUCTION,
      "development shows its error overlay instead of app/global-error.tsx",
    );
    // The incident itself: the root layout's own chunk lost to the renderer.
    await reloadAlreadySpent(page, Date.now() + VIRTUAL_TIME_MS);
    await loseChunk(page, LAYOUT_CHUNK);
    await render(page, HOME.path);
    await expect(page.locator('[data-error-boundary="global"]')).toBeAttached();
    await expect(page).toHaveTitle("Orizon Agents");
    await expectNoindex(page);
  });
});
