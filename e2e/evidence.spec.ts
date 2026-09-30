/**
 * The public evidence index, /evidence (story 5.05, the sprint's exit gate).
 *
 * The reviewer is the Ambassador Chapter Lead: not a developer, arriving from
 * a link with no account, no wallet and no history, so every visit is a
 * brand-new browser context with no storage. The dev server serves the
 * fixture index (test/fixtures/evidence/, fake hashes), so the real index's
 * content never changes this spec.
 *
 * Asserted, at desktop width and at 360px:
 *   - the page loads with no wallet, no /api call, no cookie and nothing from
 *     another origin;
 *   - the §6.2 checklist summary shows its derived suggestions and its rule;
 *   - a missed target's reason is visible inline in the metrics table;
 *   - nothing scrolls sideways, and axe (WCAG 2.1 A/AA) is clean;
 * and also:
 *   - the REAL index (content/evidence/index.json), from the second dev
 *     server, at 360px: axe, no sideways scroll, and its print view;
 *   - with JavaScript off, the whole page is there;
 *   - printed, the nav and footer drop out, every link shows its URL, and
 *     badges and text are black words on white;
 *   - outside links open safely and say where they go;
 *   - the nav (one line at xl) and the footer both reach the page.
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
import { DEMO_PUBLISHED_PORT } from "./demo-server";
import { WCAG_TAGS } from "./dispute-axe";

const EVIDENCE = "/evidence";
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 360, height: 780 };
/** A4's printable width under print.css (210mm less two 14mm margins). */
const A4_CONTENT = { width: 688, height: 1000 };
const HASH = "1".repeat(64);
const TX_URL = `https://stellar.expert/explorer/testnet/tx/${HASH}`;
const M03_REASON = "Fixture reason for m03: not reached in the fixture.";

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
    // Under `next dev`, Vercel Analytics and Speed Insights (root layout, every
    // page) load debug scripts from Vercel's CDN; in production both are
    // served from /_vercel on our own origin. Not this page's to assert.
    if (url.hostname === "va.vercel-scripts.com") return;
    if (url.hostname !== "localhost") thirdParty.push(req.url());
    if (url.pathname.startsWith("/api/")) apiCalls.push(req.url());
  });
  return { page, thirdParty, apiCalls };
}

/** What is painted past the right edge; empty is a pass (as demo.spec.ts). */
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

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function checklist(page: Page) {
  return page.getByRole("table", {
    name: /Suggested SOW §6\.2 marking for each deliverable/,
  });
}

function metrics(page: Page) {
  return page.getByRole("table", { name: /SOW §6\.3 success metrics/ });
}

/** The suggestion each §6.2 row shows, as the reviewer reads it. */
async function suggestions(page: Page): Promise<string[][]> {
  const rows = checklist(page).getByRole("row");
  await expect(rows).toHaveCount(6);
  const out: string[][] = [];
  for (let i = 1; i < 6; i++) {
    const row = rows.nth(i);
    out.push([
      squash(await row.getByRole("link").innerText()),
      squash(await row.locator("[data-status]").innerText()),
    ]);
  }
  return out;
}

const EXPECTED_SUGGESTIONS = [
  ["Deliverable 1: Permissionless Agent Registration", "✓ PRESENT"],
  ["Deliverable 2: Reputation-Gated Routing", "◐ PARTIAL"],
  [
    "Deliverable 3: Automated Dispute Window + Partial-Credit Refund",
    "✕ MISSING",
  ],
  ["Deliverable 4: Ecosystem Validation Package", "◐ PARTIAL"],
  ["Repositories & Deployments", "✓ PRESENT"],
];

for (const [name, viewport] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test.describe(`evidence page in a private window (${name})`, () => {
    test("shows the derived checklist and a missed target's reason inline, with no wallet or backend", async ({
      browser,
    }) => {
      const { page, thirdParty, apiCalls } = await stranger(browser, {
        viewport,
      });
      const response = await page.goto(EVIDENCE);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Fixture evidence index",
        }),
      ).toBeVisible();
      await expect(page.locator("[data-as-of]")).toHaveText(
        "September 28, 2026",
      );

      await expect(
        page.getByText("The Chapter Lead decides; this page only suggests"),
      ).toBeVisible();
      await expect(page.locator("[data-derivation-rule]")).toHaveText(
        "How the suggestion is worked out: If every item is present, the suggestion is Present. If at least one item is present or partial, it is Partial. If none is, it is Missing.",
      );
      await expect(checklist(page)).toBeVisible();
      expect(await suggestions(page)).toEqual(EXPECTED_SUGGESTIONS);

      const table = metrics(page);
      await expect(page.locator("[data-met-count]")).toHaveText(
        "7 of 11 metrics met.",
      );
      const m03 = table.getByRole("row").nth(3);
      const reason = m03.getByText(M03_REASON);
      await reason.scrollIntoViewIfNeeded();
      await expect(reason).toBeVisible();
      await expect(m03.locator("[data-status]")).toHaveText("✕Not met");

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
      await page.goto(EVIDENCE);
      await expect(checklist(page)).toBeVisible();
      expect(await sidewaysOverflow(page)).toEqual([]);
      expect(await axeProblems(page)).toEqual([]);
      if (name === "phone") {
        // Stacked, not squeezed: each checklist row is a card, one above the next.
        const rows = checklist(page).getByRole("row");
        const a = await rows.nth(1).boundingBox();
        const b = await rows.nth(2).boundingBox();
        expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
        expect(a!.width).toBeLessThanOrEqual(PHONE.width);
      }
      await page.context().close();
    });
  });
}

test.describe("evidence page with JavaScript disabled", () => {
  test("reads in full", async ({ browser }) => {
    const { page } = await stranger(browser, {
      viewport: PHONE,
      javaScriptEnabled: false,
    });
    const response = await page.goto(EVIDENCE);
    expect(response?.status()).toBe(200);
    for (const heading of [
      "How to use this page",
      "Checklist summary (SOW §6.2)",
      "Evidence by deliverable (SOW §6.1)",
      "Deliverable 1: Permissionless Agent Registration",
      "Deliverable 2: Reputation-Gated Routing",
      "Deliverable 3: Automated Dispute Window + Partial-Credit Refund",
      "Deliverable 4: Ecosystem Validation Package",
      "Repositories & Deployments",
      "Success metrics (SOW §6.3)",
      "Disclosures",
      "Notes",
      "Where else to look",
    ]) {
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    expect(await suggestions(page)).toEqual(EXPECTED_SUGGESTIONS);
    await expect(metrics(page).getByRole("row")).toHaveCount(12);
    await expect(page.getByText(M03_REASON)).toBeVisible();
    await expect(page.locator("[data-disclosure]")).toHaveCount(4);
    await expect(
      page.getByRole("link", {
        name: "Fixture registration by an outside operator (opens Stellar Expert)",
      }),
    ).toHaveAttribute("href", TX_URL);
    await page.context().close();
  });
});

test.describe("evidence page printed", () => {
  test("drops the nav and footer and prints every link with its URL, in black", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto(EVIDENCE);
    await expect(checklist(page)).toBeVisible();

    // On screen the URLs are not shown.
    const urls = page.locator("[data-evidence-page] [data-print-url]");
    const count = await urls.count();
    expect(count).toBeGreaterThan(10);
    for (let i = 0; i < count; i++) await expect(urls.nth(i)).toBeHidden();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner").first()).toBeHidden();
    await expect(page.getByRole("contentinfo")).toBeHidden();

    for (let i = 0; i < count; i++) await expect(urls.nth(i)).toBeVisible();
    // Each printed URL is the link's own address, just below it.
    const pairs = await page
      .locator("[data-evidence-page] a[href^='http']")
      .evaluateAll((links) =>
        links.map((a) => [
          a.getAttribute("href"),
          a.parentElement?.querySelector("[data-print-url]")?.textContent,
        ]),
      );
    expect(pairs.length).toBeGreaterThan(10);
    for (const [href, printed] of pairs) expect(printed).toBe(href);
    await expect(
      page.locator("[data-print-url]", { hasText: TX_URL }).first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-print-url]", {
        hasText: "https://orizons.xyz/guide/list-your-agent",
      }),
    ).toBeVisible();

    // Badges print as black words, the page as black on white.
    const colours = await page.evaluate(() => {
      const badge = document.querySelector('[data-status="missing"]')!;
      return {
        badge: getComputedStyle(badge).color,
        badgeText: (badge as HTMLElement).innerText.replace(/\s+/g, " "),
        body: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.querySelector("h1")!).color,
      };
    });
    expect(colours).toEqual({
      badge: "rgb(0, 0, 0)",
      badgeText: "✕ MISSING",
      body: "rgb(255, 255, 255)",
      text: "rgb(0, 0, 0)",
    });

    // And the printed pack really renders.
    const pdf = await page.pdf({ format: "A4" });
    expect(pdf.byteLength).toBeGreaterThan(10_000);
    await page.context().close();
  });
});

test.describe("evidence page links", () => {
  test("outside links open safely and say where they go", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto(EVIDENCE);
    const outside = page.locator(
      "[data-evidence-page] a[href^='http']:not([href^='https://orizons.xyz'])",
    );
    const n = await outside.count();
    expect(n).toBeGreaterThan(10);
    for (let i = 0; i < n; i++) {
      const link = outside.nth(i);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveAccessibleName(/ \(opens [^)]+\)$/);
    }
    await expect(
      page.getByRole("link", {
        name: "Fixture AgentRegistry contract on Stellar Expert (opens Stellar Expert)",
      }),
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/contract/C${"A".repeat(55)}`,
    );
    // A transaction's hash follows its label, shortened, never as the link.
    const tx = page.locator("[data-item='6.1-D1-c'] li");
    await expect(tx).toContainText(
      "Fixture registration by an outside operator (opens Stellar Expert) ↗ transaction 11111111…11111111 · September 12, 2026",
    );
    await page.context().close();
  });

  test("is reached from the marketing nav, still one line at xl, and from the footer", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: DESKTOP });
    await page.goto("/guide/list-your-agent");
    const banner = page.getByRole("banner").first();
    const evidence = banner.getByRole("link", {
      name: "Evidence",
      exact: true,
    });
    await expect(evidence).toBeVisible();
    // Every nav link sits on the same single line.
    const tops = await banner
      .locator("nav a")
      .evaluateAll((links) =>
        links
          .filter((a) => (a as HTMLElement).offsetParent !== null)
          .map((a) => Math.round(a.getBoundingClientRect().top)),
      );
    expect(new Set(tops).size).toBe(1);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Evidence" }),
    ).toHaveAttribute("href", EVIDENCE);
    await evidence.click();
    // A client-side navigation: the URL changes only once /evidence's page
    // chunk has loaded, and under `next dev` with the full suite running that
    // chunk can be compiled on demand behind other routes' rebuilds. A trace
    // of this test failing showed the click land on Evidence and the RSC fetch
    // start at once, with the chunk still pending when `toHaveURL`'s 5s ran
    // out. `waitForURL` takes the config's 60s navigationTimeout, the budget
    // set for exactly that compile.
    await page.waitForURL(new RegExp(`${EVIDENCE}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Fixture evidence index" }),
    ).toBeVisible();
    await page.context().close();
  });
});

/**
 * The same checks on the REAL index, which the second dev server serves
 * (EVIDENCE_CONTENT_DIR=content/evidence in playwright.config.ts). The fixture
 * proves the page; this proves the words a reviewer will read, however long
 * its labels and notes grow: at 360px nothing scrolls sideways and axe is
 * clean, and printed, every link in the index shows its own URL and nothing
 * runs past the paper's printable width.
 */
test.describe("the real evidence index at 360px", () => {
  const REAL = `http://localhost:${DEMO_PUBLISHED_PORT}${EVIDENCE}`;
  type Linked = { links?: { url: string }[] };
  const index = JSON.parse(
    readFileSync("content/evidence/index.json", "utf8"),
  ) as {
    title: string;
    deliverables: { items: Linked[] }[];
    metrics: Linked[];
  };
  const indexUrls = [
    ...index.deliverables.flatMap((d) => d.items),
    ...index.metrics,
  ].flatMap((x) => (x.links ?? []).map((l) => l.url));

  test("renders every link, never scrolls sideways and passes axe", async ({
    browser,
  }) => {
    const { page, thirdParty, apiCalls } = await stranger(browser, {
      viewport: PHONE,
    });
    const response = await page.goto(REAL);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: index.title }),
    ).toBeVisible();
    await expect(checklist(page)).toBeVisible();
    const hrefs = new Set(
      await page
        .locator("[data-evidence-page] a[href^='http']")
        .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
    );
    expect(indexUrls.length).toBeGreaterThan(100);
    expect(indexUrls.filter((url) => !hrefs.has(url))).toEqual([]);
    expect(await sidewaysOverflow(page)).toEqual([]);
    expect(await axeProblems(page)).toEqual([]);
    await page.waitForLoadState("networkidle");
    expect(thirdParty).toEqual([]);
    expect(apiCalls).toEqual([]);
    await page.context().close();
  });

  test("printed from a phone, drops the nav and footer and shows every link's URL in black, within the paper's width", async ({
    browser,
  }) => {
    const { page } = await stranger(browser, { viewport: PHONE });
    await page.goto(REAL);
    await expect(checklist(page)).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner").first()).toBeHidden();
    await expect(page.getByRole("contentinfo")).toBeHidden();

    const pairs = await page
      .locator("[data-evidence-page] a[href^='http']")
      .evaluateAll((links) =>
        links.map((a) => [
          a.getAttribute("href"),
          a.parentElement?.querySelector("[data-print-url]")?.textContent,
        ]),
      );
    expect(pairs.length).toBeGreaterThanOrEqual(indexUrls.length);
    for (const [href, printed] of pairs) expect(printed).toBe(href);
    const urls = page.locator("[data-evidence-page] [data-print-url]");
    const count = await urls.count();
    for (let i = 0; i < count; i++) await expect(urls.nth(i)).toBeVisible();

    // Paper, not the phone, sets the printed width: A4 less the 14mm side
    // margins of print.css is 182mm, 688px at 96 per inch.
    await page.setViewportSize(A4_CONTENT);
    expect(await sidewaysOverflow(page)).toEqual([]);
    const colours = await page.evaluate(() => ({
      badges: Array.from(document.querySelectorAll("[data-status]")).map(
        (el) => getComputedStyle(el).color,
      ),
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.querySelector("h1")!).color,
    }));
    expect(colours.badges.length).toBeGreaterThan(10);
    expect(new Set(colours.badges)).toEqual(new Set(["rgb(0, 0, 0)"]));
    expect(colours.body).toBe("rgb(255, 255, 255)");
    expect(colours.text).toBe("rgb(0, 0, 0)");

    const pdf = await page.pdf({ format: "A4" });
    expect(pdf.byteLength).toBeGreaterThan(10_000);
    await page.context().close();
  });
});
