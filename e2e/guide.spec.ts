/**
 * The public guide, /guide/list-your-agent (story 5.03).
 *
 * Its acceptance test is a stranger: opened in a private window with no
 * wallet and no session, the whole guide must be readable. So every visit
 * here is a brand-new browser context with no storage state, no cookies and
 * no wallet extension, and the page is watched for any call to the backend,
 * which it must not need. The content is the fixture guide (see
 * playwright.config.ts), which uses every construct of the dialect.
 *
 * Also asserted: no sideways page scroll at a phone's 360px (code and tables
 * scroll inside themselves), copy works and is announced, the whole guide
 * reads with JavaScript off, the draft notice shows, the sites that point at
 * the guide reach it, and axe finds no WCAG 2.1 A/AA problem.
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
import { mockApi } from "./mocks";

const GUIDE = "/guide/list-your-agent";
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 360, height: 780 };

/** A private window: nothing carried over, nothing injected. */
async function strangerPage(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<{ page: Page; apiCalls: string[] }> {
  const context = await browser.newContext({
    storageState: undefined,
    ...options,
  });
  expect(await context.cookies()).toEqual([]);
  const page = await context.newPage();
  const apiCalls: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/")) {
      apiCalls.push(req.url());
    }
  });
  return { page, apiCalls };
}

/** Everything a reader needs is on the page, in order. */
async function expectFullContent(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: "List your agent on Orizon" }),
  ).toBeVisible();
  await expect(
    page.getByText("Draft — not yet validated by a newcomer."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Backend commit 1e3c60d" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/commit/1e3c60d4b2a9f7e8c6d5b4a3f2e1d0c9b8a7f6e5",
  );

  const trust = page.getByRole("heading", {
    level: 2,
    name: "Trust boundaries",
  });
  await trust.scrollIntoViewIfNeeded();
  await expect(trust).toBeVisible();
  const trustTable = page.getByRole("region", {
    name: "Trust boundaries table",
  });
  await expect(trustTable).toContainText("The dispatch came from Orizon");
  await expect(
    page.getByRole("note").filter({ hasText: "Limitation" }),
  ).toContainText("Orizon does not audit what your agent returns.");

  const errors = page.getByRole("heading", { level: 2, name: "Error codes" });
  await errors.scrollIntoViewIfNeeded();
  await expect(errors).toBeVisible();
  const codes = page.getByRole("region", { name: "Error codes table" });
  await codes.scrollIntoViewIfNeeded();
  for (const code of ["invalid_api_key", "not_scorer", "rate_limited"]) {
    await expect(codes.getByRole("cell", { name: code })).toBeVisible();
  }
  await expect(page.locator("#read-network-code")).toHaveText(
    'curl -s "$ORIZON_API/api/stellar/network" | python3 -m json.tool',
  );
}

/**
 * What is painted past the right edge of the screen, outside the boxes that
 * are meant to scroll sideways (code frames and table regions). Empty is a
 * pass. Screen-reader-only text is skipped; it is clipped to 1px on purpose.
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
  // A scan that judged no contrast at all would pass blind (an overlay can do
  // that; see e2e/dispute-axe.ts), so it must have judged some.
  const judged =
    result.passes.find((r) => r.id === "color-contrast")?.nodes.length ?? 0;
  if (judged === 0) problems.push("color-contrast: no text was judged");
  return problems;
}

for (const [name, viewport] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test.describe(`guide in a private window (${name})`, () => {
    test("shows the whole guide with no login, wallet or backend call", async ({
      browser,
    }) => {
      const { page, apiCalls } = await strangerPage(browser, { viewport });
      const response = await page.goto(GUIDE);
      expect(response?.status()).toBe(200);
      expect(
        await page.evaluate(() => ({
          local: localStorage.length,
          session: sessionStorage.length,
          freighter: "freighter" in window || "freighterApi" in window,
        })),
      ).toEqual({ local: 0, session: 0, freighter: false });

      await expectFullContent(page);
      // Nothing between the reader and the text: no gate, no sign-in prompt.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByText(/sign in|log in|connect your wallet to/i),
      ).toHaveCount(0);
      expect(apiCalls).toEqual([]);
      expect(await page.context().cookies()).toEqual([]);
      await page.context().close();
    });

    test("never scrolls the page sideways; code and tables scroll inside", async ({
      browser,
    }) => {
      const { page } = await strangerPage(browser, { viewport });
      await page.goto(GUIDE);
      await expect(page.locator("#read-network")).toBeVisible();
      expect(await sidewaysOverflow(page)).toEqual([]);
      if (name === "phone") {
        // The long line really is wider than the phone, inside its frame.
        const pre = page.locator("#sign-registration > pre");
        const [scroll, client] = await pre.evaluate((el) => [
          el.scrollWidth,
          el.clientWidth,
        ]);
        expect(scroll).toBeGreaterThan(client);
      }
      await page.context().close();
    });

    test("passes axe (WCAG 2.1 A/AA)", async ({ browser }) => {
      const { page } = await strangerPage(browser, { viewport });
      await page.goto(GUIDE);
      await expect(page.locator("#read-network")).toBeVisible();
      expect(await axeProblems(page)).toEqual([]);
      await page.context().close();
    });
  });
}

test.describe("copying a sample", () => {
  test("copies the code and announces it politely", async ({ browser }) => {
    const { page } = await strangerPage(browser, {
      viewport: DESKTOP,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await page.goto(GUIDE);
    const block = page.locator("#read-network");
    const button = block.getByRole("button", { name: "Copy Read the network" });
    await expect(button).toBeEnabled();
    const status = block.locator("figcaption").getByRole("status");
    await expect(status).toHaveText("");
    await button.click();
    await expect(status).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'curl -s "$ORIZON_API/api/stellar/network" | python3 -m json.tool',
    );

    // An attached expected response has its own copy button.
    await page
      .getByRole("button", {
        name: "Copy expected response: The network answer",
      })
      .click();
    expect(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
    ).toEqual({
      network: "testnet",
      dispatch_signer:
        "GB5MKHDFLJZ6OFPAHM7R4HGBUPFV5PZYL3W27VTIUZZ25JMQSDZBKCMR",
    });
    await page.context().close();
  });
});

test.describe("guide with JavaScript disabled", () => {
  test("reads in full; only the copy buttons are inert", async ({
    browser,
  }) => {
    const { page } = await strangerPage(browser, {
      viewport: PHONE,
      javaScriptEnabled: false,
    });
    await page.goto(GUIDE);
    await expectFullContent(page);
    await expect(
      page.getByRole("button", { name: "Copy Read the network" }),
    ).toBeDisabled();
    // The contents list is plain links.
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: "Error codes" })
      .first()
      .click();
    await expect(page).toHaveURL(/#error-codes$/);
    await page.context().close();
  });
});

test.describe("guide content safety and links", () => {
  test("runs no raw HTML from the Markdown", async ({ browser }) => {
    const { page } = await strangerPage(browser, { viewport: DESKTOP });
    await page.goto(GUIDE);
    await expect(page.getByText("bad link")).toBeVisible();
    await page.getByText("bad link").click();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __guideInjected?: boolean }).__guideInjected,
      ),
    ).toBeUndefined();
    await expect(page.locator("article script, article b")).toHaveCount(0);
    await page.context().close();
  });

  test("lands a deep link to a section below the fixed nav", async ({
    browser,
  }) => {
    const { page } = await strangerPage(browser, { viewport: PHONE });
    await page.goto(`${GUIDE}#trust-boundaries`);
    const heading = page.locator("#trust-boundaries");
    await expect(heading).toBeInViewport();
    const navBottom = await page
      .locator("header")
      .first()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const top = await heading.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(navBottom);
    await page.context().close();
  });

  test("is linked from the ecosystem page's empty state", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app/ecosystem");
    await page
      .getByRole("link", { name: "Read the guide: List your agent on Orizon" })
      .click();
    // A client-side navigation: see evidence.spec.ts on why this waits
    // with the navigation budget rather than `toHaveURL`'s 5s.
    await page.waitForURL(new RegExp(`${GUIDE}$`));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "List your agent on Orizon",
      }),
    ).toBeVisible();
  });

  test("is linked from the marketing nav and footer", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: "List your agent" }),
    ).toHaveAttribute("href", GUIDE);
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Guide", exact: true })
      .click();
    // A client-side navigation: see evidence.spec.ts on why this waits
    // with the navigation budget rather than `toHaveURL`'s 5s.
    await page.waitForURL(new RegExp(`${GUIDE}$`));
  });

  test("an unknown guide is a 404", async ({ page }) => {
    const response = await page.goto("/guide/no-such-guide");
    expect(response?.status()).toBe(404);
  });
});
