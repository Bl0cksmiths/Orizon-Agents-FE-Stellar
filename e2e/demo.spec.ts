/**
 * The public demo page, /demo (story 5.04), in both of its states.
 *
 * A reviewer lands here from a link, with no account, no wallet and no
 * history, so every visit is a brand-new browser context with no storage.
 * The default server serves the unpublished fixture manifest and a second
 * server serves the published one (see e2e/demo-server.ts); the real
 * manifest's prose never changes this spec.
 *
 * Asserted:
 *   - unpublished: the agreed notice, the verify-it-yourself links and the
 *     limitations; no player, poster or evidence, and nothing third-party;
 *   - published: YouTube stays off the page until Play (not one request to
 *     any other origin before the click), then the privacy-enhanced embed
 *     loads, holding focus and sending only our origin as its referrer;
 *     chapters seek by reloading at their time; every evidence row links to
 *     its own testnet transaction; the frame source is allowed on /demo only;
 *   - both: no sideways scroll at 360px, axe clean, readable with JavaScript
 *     off (the "Watch on YouTube" fallback is there).
 *
 * The YouTube embed and the poster are stubbed at the network edge, so the
 * suite never depends on YouTube being reachable.
 */
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { WCAG_TAGS } from "./dispute-axe";
import { DEMO_PUBLISHED_PORT } from "./demo-server";

const UNPUBLISHED = "/demo";
const PUBLISHED = `http://localhost:${DEMO_PUBLISHED_PORT}/demo`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 360, height: 780 };

const TITLE = "Fixture: Orizon Agents on Stellar testnet";
const EMBED =
  "https://www.youtube-nocookie.com/embed/fixtureVid0?autoplay=1&rel=0&cc_load_policy=1";
const NOTICE =
  "The demo video has not been recorded yet. It will show only real testnet transactions. Until then, here is how to verify each deliverable yourself.";

// A 1×1 transparent PNG, standing in for the optimised YouTube thumbnail.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const STUB_PLAYER =
  '<!doctype html><html lang="en"><head><title>Stub player</title></head><body><p>Stub player</p></body></html>';

type Visit = {
  page: Page;
  /** Every request to an origin other than the page's own, in order. */
  thirdParty: string[];
  /** Every /api call; the page needs none. */
  apiCalls: string[];
  /** Referer header sent with each embed request. */
  embedReferers: (string | undefined)[];
};

/** A private window: nothing carried over, nothing injected. */
async function stranger(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<Visit> {
  const context = await browser.newContext({
    storageState: undefined,
    ...options,
  });
  expect(await context.cookies()).toEqual([]);
  const embedReferers: (string | undefined)[] = [];
  // The optimiser would fetch the thumbnail from YouTube server-side; the
  // browser only ever asks us, so answering for it keeps the suite offline.
  await context.route("**/_next/image?**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
  );
  await context.route("https://www.youtube-nocookie.com/**", (route) => {
    embedReferers.push(route.request().headers()["referer"]);
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: STUB_PLAYER,
    });
  });
  const page = await context.newPage();
  const thirdParty: string[] = [];
  const apiCalls: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    // Under `next dev`, Vercel Analytics and Speed Insights (root layout, every
    // page) load debug scripts from Vercel's CDN; in production both are
    // served from /_vercel on our own origin. Not the demo's to assert.
    if (url.hostname === "va.vercel-scripts.com") return;
    if (url.hostname !== "localhost") thirdParty.push(req.url());
    if (url.pathname.startsWith("/api/")) apiCalls.push(req.url());
  });
  return { page, thirdParty, apiCalls, embedReferers };
}

async function expectLimitations(page: Page) {
  const section = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "Limitations" }),
  });
  await section.scrollIntoViewIfNeeded();
  const items = section.getByRole("listitem");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("Testnet only.");
  await expect(items.nth(1)).toContainText(
    "Dispute credits are platform-funded and platform-adjudicated.",
  );
  await expect(items.nth(2)).toContainText("Endpoint binding is off-chain.");
  await expect(items.nth(3)).toContainText("One platform key.");
}

/**
 * What is painted past the right edge of the screen, outside boxes meant to
 * scroll sideways (the evidence table's region). Empty is a pass. The same
 * probe the guide's spec uses.
 */
async function sidewaysOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1;
    const scrolls = (el: Element) =>
      ["auto", "scroll"].includes(getComputedStyle(el).overflowX) &&
      el !== document.documentElement &&
      el !== document.body;
    const skip = (el: Element | null): boolean => {
      for (let n = el; n; n = n.parentElement) {
        if (n.classList.contains("sr-only")) return true;
        if (scrolls(n) && n !== el) return true;
      }
      return false;
    };
    const out: string[] = [];
    const label = (el: Element, right: number) =>
      `<${el.tagName.toLowerCase()}> to ${Math.round(right)}px "${(el.textContent ?? "").trim().slice(0, 40)}"`;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (skip(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > limit) out.push(label(el, box.right));
    }
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const parent = t.parentElement;
      if (!parent || !t.textContent?.trim() || skip(parent)) continue;
      if (scrolls(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.right > limit) {
          out.push(label(parent, rect.right));
          break;
        }
      }
    }
    return out;
  });
}

async function axeProblems(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const problems = result.violations.map(
    (v) =>
      `${v.id}: ${v.nodes.map((n) => n.target.map(String).join(" ")).join(", ")}`,
  );
  // A scan that judged no contrast at all would pass blind.
  const judged =
    result.passes.find((r) => r.id === "color-contrast")?.nodes.length ?? 0;
  if (judged === 0) problems.push("color-contrast: no text was judged");
  return problems;
}

for (const [name, viewport] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test.describe(`unpublished demo in a private window (${name})`, () => {
    test("says the video is not recorded yet and shows nothing as real", async ({
      browser,
    }) => {
      const { page, thirdParty, apiCalls } = await stranger(browser, {
        viewport,
      });
      const response = await page.goto(UNPUBLISHED);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Orizon Agents, end to end",
        }),
      ).toBeVisible();
      await expect(page.getByRole("note")).toHaveText(NOTICE);

      const verify = page.locator("section", {
        has: page.getByRole("heading", {
          name: "Verify each deliverable yourself",
        }),
      });
      for (const [link, href] of [
        ["operator guide", "/guide/list-your-agent"],
        ["operator dashboard", "/app/operator"],
        ["ecosystem page", "/app/ecosystem"],
        ["Week 3 evidence bundle", /\/tree\/main\/Week-3-Tranche-Submission$/],
      ] as const) {
        await expect(
          verify.getByRole("link", { name: link }).first(),
        ).toHaveAttribute("href", href);
      }
      await expectLimitations(page);

      await expect(page.locator("iframe, img, video")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /play/i })).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "On-chain evidence" }),
      ).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Chapters" })).toHaveCount(
        0,
      );
      expect(await page.content()).not.toMatch(
        /youtube|ytimg|stellar\.expert\/explorer\/[a-z]+\/tx/,
      );
      await page.waitForLoadState("networkidle");
      expect(thirdParty).toEqual([]);
      expect(apiCalls).toEqual([]);
      expect(await page.context().cookies()).toEqual([]);
      await page.context().close();
    });

    test("never scrolls sideways and passes axe (WCAG 2.1 A/AA)", async ({
      browser,
    }) => {
      const { page } = await stranger(browser, { viewport });
      await page.goto(UNPUBLISHED);
      await expect(page.getByRole("note")).toBeVisible();
      expect(await sidewaysOverflow(page)).toEqual([]);
      expect(await axeProblems(page)).toEqual([]);
      await page.context().close();
    });
  });

  test.describe(`published demo in a private window (${name})`, () => {
    test("loads nothing from YouTube until Play, then plays the private embed", async ({
      browser,
    }) => {
      const { page, thirdParty, apiCalls, embedReferers } = await stranger(
        browser,
        { viewport },
      );
      const response = await page.goto(PUBLISHED);
      expect(response?.status()).toBe(200);
      const play = page.getByRole("button", {
        name: `Play video: ${TITLE} (4 min 12 s)`,
      });
      await expect(play).toBeVisible();
      await page.waitForLoadState("networkidle");
      // The poster came through our own optimiser; YouTube was never asked.
      expect(thirdParty).toEqual([]);
      await expect(page.locator("iframe")).toHaveCount(0);

      await play.click();
      const frame = page.locator("iframe");
      await expect(frame).toHaveAttribute("src", EMBED);
      await expect(frame).toHaveAttribute(
        "title",
        `YouTube video player: ${TITLE}`,
      );
      await expect(frame).toBeFocused();
      await expect(
        page.frameLocator("iframe").getByText("Stub player"),
      ).toBeVisible();
      expect(thirdParty).toEqual([EMBED]);
      // The site sends no Referer anywhere else; the embed needs its origin.
      expect(embedReferers).toEqual([
        `http://localhost:${DEMO_PUBLISHED_PORT}/`,
      ]);
      expect(apiCalls).toEqual([]);
      expect(await page.context().cookies()).toEqual([]);
      await page.context().close();
    });

    test("never scrolls sideways and passes axe (WCAG 2.1 A/AA)", async ({
      browser,
    }) => {
      const { page } = await stranger(browser, { viewport });
      await page.goto(PUBLISHED);
      await expect(
        page.getByRole("button", { name: /^Play video/ }),
      ).toBeVisible();
      expect(await sidewaysOverflow(page)).toEqual([]);
      expect(await axeProblems(page)).toEqual([]);
      if (name === "phone") {
        // The evidence table really is wider than the phone, inside its region.
        const region = page.getByRole("region", {
          name: "On-chain evidence table",
        });
        const [scroll, client] = await region.evaluate((el) => [
          el.scrollWidth,
          el.clientWidth,
        ]);
        expect(scroll).toBeGreaterThan(client);
      }
      await page.context().close();
    });
  });
}

test.describe("published demo: player, chapters and evidence", () => {
  test("plays from the keyboard, with focus moved into the player", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto(PUBLISHED);
    const play = page.getByRole("button", { name: /^Play video/ });
    await play.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe")).toBeFocused();
    await page.context().close();
  });

  test("a chapter reloads the player at its time", async ({ browser }) => {
    const { page, thirdParty } = await stranger(browser, { viewport: PHONE });
    await page.goto(PUBLISHED);
    await expect(
      page.getByRole("button", { name: /^Play video/ }),
    ).toBeVisible();
    const chapter = page.getByRole("link", { name: /^1:15 / });
    await expect(chapter).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=fixtureVid0&t=75s",
    );
    await chapter.click();
    await expect(page).toHaveURL(PUBLISHED);
    const frame = page.locator("iframe");
    await expect(frame).toHaveAttribute("src", `${EMBED}&start=75`);
    await expect(frame).toBeFocused();
    await expect(frame).toBeInViewport();
    await expect(chapter).toHaveAttribute("aria-current", "true");

    await page.getByRole("link", { name: /^2:20 / }).click();
    await expect(frame).toHaveAttribute("src", `${EMBED}&start=140`);
    expect(thirdParty).toEqual([`${EMBED}&start=75`, `${EMBED}&start=140`]);
    await page.context().close();
  });

  test("every evidence row links to its own testnet transaction", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto(PUBLISHED);
    const table = page.getByRole("region", { name: "On-chain evidence table" });
    const rows = table.getByRole("row");
    await expect(rows).toHaveCount(6);
    for (let i = 1; i <= 5; i++) {
      const hash = String(i).repeat(64);
      const link = rows.nth(i).getByRole("link");
      await expect(link).toHaveAttribute(
        "href",
        `https://stellar.expert/explorer/testnet/tx/${hash}`,
      );
      await expect(link).toContainText(`${hash.slice(0, 8)}…${hash.slice(-8)}`);
    }
    await expect(rows.nth(3)).toContainText("Settlement");
    await expect(rows.nth(4)).toContainText("Dispute rating");
    await expect(rows.nth(5)).toContainText("Refund credit");
    await expectLimitations(page);
    await page.context().close();
  });

  test("the frame source is allowed on /demo and nowhere else", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    const demo = await page.goto(PUBLISHED);
    expect(demo?.headers()["content-security-policy"]).toBe(
      "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; frame-src https://www.youtube-nocookie.com",
    );
    const home = await page.goto(
      `http://localhost:${DEMO_PUBLISHED_PORT}/guide`,
    );
    expect(home?.headers()["content-security-policy"]).toBe(
      "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    await page.context().close();
  });
});

test.describe("demo with JavaScript disabled", () => {
  test("published: reads in full, and Watch on YouTube is the way to the video", async ({
    browser,
  }) => {
    const { page, thirdParty } = await stranger(browser, {
      viewport: PHONE,
      javaScriptEnabled: false,
    });
    await page.goto(PUBLISHED);
    await expect(
      page.getByRole("link", { name: "Watch on YouTube" }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=fixtureVid0");
    // No dead button: before hydration the poster is a link, not a control.
    await expect(page.getByRole("button", { name: /^Play video/ })).toHaveCount(
      0,
    );
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^1:15 / })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=fixtureVid0&t=75s",
    );
    await expect(
      page.getByRole("region", { name: "On-chain evidence table" }),
    ).toBeVisible();
    await expect(
      page.getByText("one agent is excluded for being below the floor"),
    ).toBeVisible();
    await expectLimitations(page);
    expect(thirdParty).toEqual([]);
    await page.context().close();
  });

  test("unpublished: the notice and the limitations still read", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, {
      viewport: PHONE,
      javaScriptEnabled: false,
    });
    await page.goto(UNPUBLISHED);
    await expect(page.getByRole("note")).toHaveText(NOTICE);
    await expectLimitations(page);
    await page.context().close();
  });
});

test("the marketing footer links to the demo", async ({ browser }) => {
  const { page } = await stranger(browser, { viewport: DESKTOP });
  await page.goto("/guide");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Demo", exact: true })
    .click();
  // A client-side navigation: see evidence.spec.ts on why this waits
  // with the navigation budget rather than `toHaveURL`'s 5s.
  await page.waitForURL(/\/demo$/);
  await expect(page.getByRole("note")).toHaveText(NOTICE);
  await page.context().close();
});
