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

const HOME = PUBLIC_PAGES[0];

/** The development build's chunks for the two telemetry components. */
const TELEMETRY_CHUNK =
  /\/_next\/static\/chunks\/[^?]*vercel_(analytics|speed-insights)[^/?]*\.js/;
/** The scripts they inject: Vercel's CDN in development, /_vercel/ live. */
const TELEMETRY_SCRIPT =
  /va\.vercel-scripts\.com\/|\/_vercel\/(insights|speed-insights)\//;

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
});
