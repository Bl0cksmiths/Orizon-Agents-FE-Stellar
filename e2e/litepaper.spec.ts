/**
 * The public litepaper page, /litepaper (story 5.06), and its files.
 *
 * The reader arrives from a link with no account, no wallet and no history,
 * so every visit is a brand-new browser context with no storage. The dev
 * server serves the fixture book (test/fixtures/litepaper/), whose files the
 * copy step published under public/litepaper/ before the server started, so
 * this spec does not change when the litepaper does.
 *
 * Asserted:
 *   - at desktop width and at 360px, the page loads with no wallet, no /api
 *     call, no cookie and nothing from another origin, shows the cover's
 *     version and date, never scrolls sideways, and axe (WCAG 2.1 A/AA) is
 *     clean;
 *   - the download links are reached by keyboard, in order;
 *   - each file is served from our own origin with 200 and its content type,
 *     the PDF inline under its clean name;
 *   - the §6 link opens the HTML book at §6, its own CSP lets its inline
 *     script and style run, and nothing it does is blocked;
 *   - every other page keeps the site-wide CSP, unchanged;
 *   - with JavaScript off, the page is all there;
 *   - /evidence, the footer and the nav all reach the page, and the evidence
 *     index's own litepaper link is this page's address.
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { WCAG_TAGS } from "./dispute-axe";

const LITEPAPER = "/litepaper";
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 360, height: 780 };
const TITLE = "The Orizon Agents Protocol Litepaper (fixture)";
const HTML_BOOK = "/litepaper/orizon-agents-litepaper.html";

/** next.config.mjs's BASE_CSP: what every page but two carries. */
const SITE_CSP =
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const HTML_BOOK_CSP = `${SITE_CSP}; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`;

const FILES = [
  {
    name: /^PDF document \(PDF, \d+ bytes\)$/,
    href: "/litepaper/orizon-agents-litepaper.pdf",
    type: "application/pdf",
  },
  {
    name: /^Web page \(HTML, \d+ (bytes|KB)\)$/,
    href: HTML_BOOK,
    type: "text/html",
  },
  {
    name: /^Word document \(DOCX, \d+ bytes\)$/,
    href: "/litepaper/orizon-agents-litepaper.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    name: /^Markdown text \(MD, \d+ bytes\)$/,
    href: "/litepaper/orizon-agents-litepaper.md",
    type: "text/markdown",
  },
];

type Visit = { page: Page; thirdParty: string[]; apiCalls: string[] };

/** A private window: nothing carried over, nothing injected, no wallet. */
async function stranger(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<Visit> {
  const context = await browser.newContext({
    storageState: undefined,
    ...options,
  });
  expect(await context.cookies()).toEqual([]);
  const page = await context.newPage();
  const thirdParty: string[] = [];
  const apiCalls: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    // Under `next dev`, Vercel Analytics and Speed Insights load debug
    // scripts from Vercel's CDN; in production both are same-origin.
    if (url.hostname === "va.vercel-scripts.com") return;
    if (url.hostname !== "localhost") thirdParty.push(req.url());
    if (url.pathname.startsWith("/api/")) apiCalls.push(req.url());
  });
  return { page, thirdParty, apiCalls };
}

/** What is painted past the right edge; empty is a pass (as evidence.spec.ts). */
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
  test.describe(`litepaper page in a private window (${name})`, () => {
    test("shows the cover's version and date and all four files, with no wallet or backend", async ({
      browser,
    }) => {
      const { page, thirdParty, apiCalls } = await stranger(browser, {
        viewport,
      });
      const response = await page.goto(LITEPAPER);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: TITLE }),
      ).toBeVisible();
      await expect(page.locator("[data-version]")).toHaveText("0.5");
      await expect(page.locator("[data-date]")).toHaveText(
        "September 27, 2026",
      );
      for (const f of FILES) {
        const link = page.getByRole("link", { name: f.name });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", f.href);
      }
      await expect(
        page.getByRole("heading", { name: "What changed in v0.5" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 3, name: /^Open registration New/ }),
      ).toBeVisible();
      expect(thirdParty).toEqual([]);
      expect(apiCalls).toEqual([]);
      expect(await page.context().cookies()).toEqual([]);
      await page.context().close();
    });

    test("never scrolls sideways and passes axe (WCAG 2.1 A/AA)", async ({
      browser,
    }) => {
      const { page } = await stranger(browser, { viewport });
      await page.goto(LITEPAPER);
      await expect(
        page.getByRole("heading", { level: 1, name: TITLE }),
      ).toBeVisible();
      expect(await sidewaysOverflow(page)).toEqual([]);
      expect(await axeProblems(page)).toEqual([]);
      await page.context().close();
    });
  });
}

test.describe("litepaper page by keyboard", () => {
  test("tabs through the four files, then §6, in order", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto(LITEPAPER);
    const pdf = page.getByRole("link", { name: FILES[0].name });
    await expect(pdf).toBeVisible();
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await pdf.evaluate((a) => a === document.activeElement);
    }
    expect(reached).toBe(true);
    const order = [FILES[0].href];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(
          () => document.activeElement?.getAttribute("href") ?? "",
        ),
      );
    }
    expect(order).toEqual([
      ...FILES.map((f) => f.href),
      `${HTML_BOOK}#operations-and-governance`,
    ]);
    // The focused link shows a ring that is not there without focus.
    const ring = () =>
      page
        .locator(`a[href="${HTML_BOOK}#operations-and-governance"]`)
        .evaluate((a) => getComputedStyle(a).boxShadow);
    const focused = await ring();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    expect(focused).not.toBe(await ring());
    await page.context().close();
  });
});

test.describe("litepaper files", () => {
  test("each is served from our own origin with 200 and its content type", async ({
    browser,
  }) => {
    const { page } = await stranger(browser);
    for (const f of FILES) {
      const res = await page.request.get(f.href);
      expect(res.status(), f.href).toBe(200);
      expect(res.headers()["content-type"], f.href).toMatch(
        new RegExp(`^${f.type.replace(/[.+]/g, "\\$&")}(;|$)`),
      );
      expect((await res.body()).byteLength, f.href).toBeGreaterThan(0);
    }
    const pdf = await page.request.get(FILES[0].href);
    expect(pdf.headers()["content-disposition"]).toBe(
      'inline; filename="orizon-agents-litepaper.pdf"',
    );
    const figure = await page.request.get("/litepaper/figures/figure-1.png");
    expect(figure.status()).toBe(200);
    expect(figure.headers()["content-type"]).toBe("image/png");
    await page.context().close();
  });

  test("the §6 link opens the HTML book at §6, and its CSP lets the inline script and style run", async ({
    browser,
  }) => {
    const { page, thirdParty } = await stranger(browser, {
      viewport: DESKTOP,
    });
    await page.addInitScript(() => {
      (window as unknown as { violations: string[] }).violations = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        (window as unknown as { violations: string[] }).violations.push(
          `${e.violatedDirective} ${e.blockedURI}`,
        ),
      );
    });
    await page.goto(LITEPAPER);
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === HTML_BOOK),
      page
        .getByRole("link", {
          name: /^Go straight to §6 · Operations and Governance, in the web page/,
        })
        .click(),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-security-policy"]).toBe(HTML_BOOK_CSP);
    await expect(page).toHaveURL(
      new RegExp(`${HTML_BOOK}#operations-and-governance$`),
    );
    // The book's inline script ran: it drew the diagram and marked the body.
    await expect(page.locator("body")).toHaveAttribute(
      "data-mermaid-ready",
      "true",
    );
    await expect(page.locator(".mermaid svg")).toHaveCount(1);
    // And its inline style applied.
    expect(
      await page.evaluate(() => getComputedStyle(document.body).maxWidth),
    ).toBe("640px");
    expect(
      await page.evaluate(
        () => (window as unknown as { violations: string[] }).violations,
      ),
    ).toEqual([]);
    await expect(page.locator("#operations-and-governance")).toBeInViewport();
    expect(thirdParty).toEqual([]);
    await page.context().close();
  });

  test("every other page keeps the site-wide CSP", async ({ browser }) => {
    const { page } = await stranger(browser);
    for (const path of [
      "/",
      LITEPAPER,
      "/evidence",
      "/guide/list-your-agent",
      FILES[0].href,
      FILES[3].href,
    ]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-security-policy"], path).toBe(SITE_CSP);
    }
    await page.context().close();
  });
});

test.describe("litepaper page with JavaScript disabled", () => {
  test("reads in full", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(LITEPAPER);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    for (const f of FILES) {
      await expect(page.getByRole("link", { name: f.name })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "What changed in v0.5" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Source" })).toBeVisible();
    await context.close();
  });
});

test.describe("litepaper page links", () => {
  test("is reached from /evidence, the footer and the nav", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto("/evidence");
    const where = page
      .getByRole("heading", { name: "Where else to look" })
      .locator("xpath=ancestor::section[1]");
    await where.getByRole("link", { name: "Litepaper", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${LITEPAPER}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();

    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Litepaper" }),
    ).toHaveAttribute("href", LITEPAPER);
    await expect(
      page
        .getByRole("banner")
        .first()
        .getByRole("link", { name: "Litepaper", exact: true }),
    ).toHaveAttribute("href", LITEPAPER);
    await page.context().close();
  });

  test("the evidence index's litepaper item names this page's public address", async ({
    browser,
  }) => {
    // The real index, not the fixture the dev server shows. Until the page is
    // deployed the index names its address in the item's note rather than
    // linking a page that answers 404; once deployed it links it. Either way
    // the address it gives must be this page, and the page must be served there.
    const index = JSON.parse(
      readFileSync("content/evidence/index.json", "utf8"),
    ) as {
      deliverables: {
        id: string;
        items: { id: string; note?: string; links: { url: string }[] }[];
      }[];
    };
    const d4 = index.deliverables.find((d) => d.id === "D4")!;
    const item = d4.items.find((i) => i.id === "6.1-D4-e")!;
    const linked = item.links
      .map((l) => new URL(l.url))
      .filter((u) => u.hostname === "orizons.xyz")
      .map((u) => u.pathname);
    const named = [
      ...(item.note ?? "").matchAll(/orizons\.xyz(\/[\w/-]+)/g),
    ].map((m) => m[1]);
    const addresses = [...new Set([...linked, ...named])];
    expect(addresses).toEqual([LITEPAPER]);
    const { page } = await stranger(browser);
    const res = await page.goto(addresses[0]);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible();
    await page.context().close();
  });
});
