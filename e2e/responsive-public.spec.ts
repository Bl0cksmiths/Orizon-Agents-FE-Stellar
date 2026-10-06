/**
 * The public pages at phone, tablet, laptop and desktop widths.
 *
 * Every public page (the home page, the operator guide, /evidence, /demo and
 * /litepaper) is opened at 360, 768, 1024, 1440 and 1920px. At each width:
 *
 *   - the page never scrolls sideways, and no element is painted past either
 *     edge of the screen, except inside a box that scrolls on purpose (a code
 *     frame), screen-reader-only text, decoration hidden from assistive
 *     technology, and the agent ticker's track, which slides inside its own
 *     clipped band;
 *   - axe finds no WCAG 2.1 A/AA problem;
 *   - the layouts set per breakpoint hold: how many columns each card grid
 *     and the footer have, the fluid display type, the guide's tables
 *     stacking into labelled rows on a phone, its contents list going to two
 *     columns on a tablet, full-width calls to action on a phone, and lines
 *     of prose kept to a readable measure on a desktop;
 *   - up to 1024px the context has a touch screen, as a phone or tablet does,
 *     and the controls this pass sized for touch are at least 44px square.
 *
 * Content comes from the same fixtures as the rest of the suite (see
 * playwright.config.ts), so the prose can change without touching this spec.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { WCAG_TAGS } from "./dispute-axe";
import { entrancesSettled } from "./entrances-settled";
import { mockApi } from "./mocks";
import { motionSettled } from "./motion-settled";

const WIDTHS = [360, 768, 1024, 1440, 1920] as const;
type Width = (typeof WIDTHS)[number];

const HOME = "/";
const GUIDE = "/guide/list-your-agent";
const EVIDENCE = "/evidence";
const DEMO = "/demo";
const LITEPAPER = "/litepaper";
const PAGES = [HOME, GUIDE, EVIDENCE, DEMO, LITEPAPER] as const;
type PublicPage = (typeof PAGES)[number];

/** Phones and tablets, landscape included, are touch screens. */
const isTouch = (width: number) => width <= 1024;

/** The smallest comfortable touch target, in CSS pixels. */
const TAP = 44;

/**
 * Opens a page and scrolls through it once, so every section that fades in
 * on entering the screen has done so before anything is measured or scanned.
 */
async function open(page: Page, path: PublicPage): Promise<void> {
  await mockApi(page);
  await page.goto(path);
  await expect(page.locator("main#main")).toBeVisible();
  await page.evaluate(async () => {
    const pause = () => new Promise((r) => setTimeout(r, 60));
    const step = Math.max(200, Math.floor(window.innerHeight / 3));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await pause();
    }
    // A fast sweep can carry a short section past the screen between two
    // frames, so it never registers as seen; bring any such one into view.
    // The marketing sections reveal through a class (`.reveal`, shown once
    // `data-revealed` is set); anything else fades through an inline style.
    const faded = [
      ...Array.from(
        document.querySelectorAll<HTMLElement>(".reveal:not([data-revealed])"),
      ),
      ...Array.from(
        document.querySelectorAll<HTMLElement>('[style*="opacity"]'),
      ).filter((el) => el.style.opacity !== "" && el.style.opacity !== "1"),
    ];
    for (const el of faded) {
      el.scrollIntoView({ block: "center" });
      await pause();
    }
    window.scrollTo(0, 0);
  });
  await entrancesSettled(page);
  await motionSettled(page.locator("body"));
}

/**
 * Everything painted past the left or right edge of the screen, and the page
 * itself if it scrolls sideways. Empty is a pass.
 */
async function sideways(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const pageWidth = document.documentElement.scrollWidth;
    if (pageWidth > vw) out.push(`the page is ${pageWidth}px wide in ${vw}px`);
    const exempt = (el: Element): boolean => {
      for (let n: Element | null = el; n && n !== document.body;) {
        if (
          n.getAttribute("aria-hidden") === "true" ||
          n.classList.contains("sr-only") ||
          n.classList.contains("animate-marquee")
        )
          return true;
        if (
          n !== el &&
          ["auto", "scroll"].includes(getComputedStyle(n).overflowX)
        )
          return true;
        n = n.parentElement;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const wider = box.width > vw + 1;
      const past = box.right > vw + 1 || box.left < -1;
      if (!wider && !past) continue;
      if (exempt(el) || getComputedStyle(el).visibility === "hidden") continue;
      const text = (el.textContent ?? "").trim().slice(0, 40);
      out.push(
        `<${el.tagName.toLowerCase()}> ${Math.round(box.left)}..${Math.round(box.right)}px` +
          `${wider ? ` (${Math.round(box.width)}px wide)` : ""} "${text}"`,
      );
    }
    return out;
  });
}

async function axeProblems(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  return violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}: ` +
      v.nodes.map((n) => n.target.join(" ")).join(", "),
  );
}

/** How many columns a CSS grid lays out (1 for a block). */
async function columns(grid: Locator): Promise<number> {
  return grid.evaluate((el) => {
    const cs = getComputedStyle(el);
    if (cs.display !== "grid") return 1;
    return cs.gridTemplateColumns.split(" ").filter(Boolean).length;
  });
}

async function px(el: Locator, prop: "fontSize" | "width"): Promise<number> {
  return el.evaluate(
    (node, p) =>
      p === "width"
        ? node.getBoundingClientRect().width
        : parseFloat(getComputedStyle(node)[p]),
    prop,
  );
}

/** Each visible control in `targets` that is smaller than 44 × 44px. */
async function smallTargets(targets: Locator): Promise<string[]> {
  return targets.evaluateAll((els, min) => {
    const out: string[] = [];
    for (const el of els) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < min || box.height < min) {
        const name =
          el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();
        out.push(
          `"${name.slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
      }
    }
    return out;
  }, TAP);
}

/** clamp(min, base + vw × width, max), as the stylesheet computes it. */
const fluid = (w: number, min: number, base: number, vw: number, max: number) =>
  Math.min(max, Math.max(min, base + vw * w));

/** Expected column counts per width, for each grid this pass laid out. */
const GRID: Record<string, Record<Width, number>> = {
  threeCards: { 360: 1, 768: 2, 1024: 3, 1440: 3, 1920: 3 },
  architecture: { 360: 1, 768: 2, 1024: 6, 1440: 6, 1920: 6 },
  roadmap: { 360: 1, 768: 2, 1024: 4, 1440: 4, 1920: 4 },
  footer: { 360: 2, 768: 4, 1024: 5, 1440: 5, 1920: 5 },
};

const sectionGrid = (page: Page, heading: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: heading }) })
    .locator(".grid")
    .first();

async function homeLayout(page: Page, width: Width): Promise<void> {
  const vw = await page.evaluate(() => document.documentElement.clientWidth);

  // Display type scales with the screen, between its phone and desktop sizes.
  const h1 = page.getByRole("heading", { level: 1 });
  expect(await px(h1, "fontSize")).toBeCloseTo(
    fluid(vw, 36, 19.2, 0.044, 72),
    0,
  );
  const h2 = page.getByRole("heading", { level: 2, name: /^AI agents are/ });
  expect(await px(h2, "fontSize")).toBeCloseTo(
    fluid(vw, 30, 19.2, 0.026, 48),
    0,
  );

  // The card grids: one column on a phone, two on a tablet with the odd card
  // out full width beneath (never one stranded in a half-empty row), then
  // their desktop layouts.
  for (const heading of [
    "AI agents are isolated. That's the bottleneck.",
    "Three layers. One coordinated network.",
    "Three audiences. One coordination layer.",
  ]) {
    const grid = sectionGrid(page, heading);
    expect(await columns(grid), heading).toBe(GRID.threeCards[width]);
    if (GRID.threeCards[width] === 2) {
      const last = grid.locator(":scope > *").last();
      expect(await px(last, "width")).toBeCloseTo(await px(grid, "width"), 0);
    }
  }
  const modules = sectionGrid(
    page,
    "Five modules. Every execution flows through them.",
  );
  expect(await columns(modules)).toBe(GRID.architecture[width]);
  if (GRID.architecture[width] === 2) {
    const fifth = modules.locator(":scope > *").last();
    expect(await px(fifth, "width")).toBeCloseTo(await px(modules, "width"), 0);
  }
  const roadmap = sectionGrid(page, "From MVP to a digital labor market.");
  expect(await columns(roadmap)).toBe(GRID.roadmap[width]);
  expect(await columns(page.locator("footer .grid").first())).toBe(
    GRID.footer[width],
  );

  // The use-case tabs: an even grid until they fit on one row.
  const tablist = page.getByRole("tablist", { name: "Use cases" });
  const tabTops = await tablist
    .getByRole("tab")
    .evaluateAll((tabs) => tabs.map((t) => t.getBoundingClientRect().top));
  if (width >= 1024) {
    expect(new Set(tabTops.map(Math.round)).size).toBe(1);
  } else {
    expect(await columns(tablist)).toBe(width < 640 ? 1 : 2);
  }

  // On a phone the calls to action are full-width, one under the other.
  if (width < 640) {
    const hero = page.locator("section").first();
    const container = await px(
      hero.getByRole("heading", { level: 1 }),
      "width",
    );
    for (const name of ["Launch Console ▸", "See how it works"]) {
      const cta = hero.getByRole("link", { name });
      expect(await px(cta, "width"), name).toBeCloseTo(container, 0);
    }
  }

  // A note under the reputation tiles keeps a readable line length.
  const note = page.getByText(/^Wash-trading costs real USDC/);
  expect(await px(note, "width")).toBeLessThanOrEqual(576);

  if (isTouch(width)) {
    expect(await smallTargets(page.getByRole("tab"))).toEqual([]);
    expect(await smallTargets(page.locator("footer ul a"))).toEqual([]);
  }
}

async function guideLayout(page: Page, width: Width): Promise<void> {
  // A table reads as a stack of labelled rows on a phone, and as a table
  // from sm up. Either way every cell is still a cell under its header.
  const region = page.getByRole("region", { name: "Trust boundaries table" });
  const table = region.getByRole("table");
  const headers = await table
    .getByRole("columnheader")
    .evaluateAll((ths) => ths.map((th) => (th.textContent ?? "").trim()));
  expect(headers.length).toBeGreaterThan(1);
  const firstRow = table.getByRole("row").nth(1);
  const labels = await firstRow.getByRole("cell").evaluateAll((tds) =>
    tds.map((td) => {
      const label = td.querySelector("[aria-hidden='true']");
      return label && label.getBoundingClientRect().height > 0
        ? (label.textContent ?? "").trim()
        : null;
    }),
  );
  const display = await table.evaluate((t) => getComputedStyle(t).display);
  if (width < 640) {
    expect(display).toBe("block");
    expect(labels).toEqual(headers);
    expect(await region.evaluate((r) => r.scrollWidth <= r.clientWidth)).toBe(
      true,
    );
  } else {
    expect(display).toBe("table");
    expect(labels.every((l) => l === null)).toBe(true);
  }

  // The contents list: two columns while it sits above the guide.
  const toc = page
    .getByRole("navigation", { name: "On this page" })
    .locator("ol")
    .first();
  const tocColumns = await toc.evaluate(
    (ol) => getComputedStyle(ol).columnCount,
  );
  expect(tocColumns).toBe(width < 640 ? "auto" : width < 1024 ? "2" : "1");

  // The header and legend share the body's measure (max-w-3xl).
  for (const part of [
    page.locator("article[data-guide] header").first(),
    page.locator("section[aria-labelledby='guide-legend-heading']"),
  ]) {
    expect(await px(part, "width")).toBeLessThanOrEqual(768);
  }

  if (isTouch(width)) {
    expect(
      await smallTargets(page.getByRole("button", { name: /^Copy / })),
    ).toEqual([]);
    expect(
      await smallTargets(
        page
          .getByRole("navigation", { name: "On this page" })
          .getByRole("link"),
      ),
    ).toEqual([]);
    expect(
      await smallTargets(page.getByRole("link", { name: /^Link to / })),
    ).toEqual([]);
    expect(
      await smallTargets(page.getByRole("link", { name: /^Backend commit / })),
    ).toEqual([]);
  }
}

async function evidenceLayout(page: Page, width: Width): Promise<void> {
  const howTo = page.locator("section[aria-labelledby='how-to-use'] p");
  for (const p of await howTo.all()) {
    expect(await px(p, "width")).toBeLessThanOrEqual(768);
  }
  if (isTouch(width)) {
    const checklist = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: /^Checklist summary/ }),
      })
      .getByRole("table")
      .getByRole("link");
    expect(await checklist.count()).toBeGreaterThan(0);
    expect(await smallTargets(checklist)).toEqual([]);
  }
}

async function demoLayout(page: Page, width: Width): Promise<void> {
  if (isTouch(width)) {
    // The list of bundles, not the one named in a sentence above it.
    const bundles = page
      .locator("ul")
      .filter({ has: page.getByRole("link", { name: /evidence bundle$/ }) })
      .getByRole("link");
    expect(await bundles.count()).toBeGreaterThan(0);
    expect(await smallTargets(bundles)).toEqual([]);
  }
}

const LAYOUT: Partial<
  Record<PublicPage, (page: Page, width: Width) => Promise<void>>
> = {
  [HOME]: homeLayout,
  [GUIDE]: guideLayout,
  [EVIDENCE]: evidenceLayout,
  [DEMO]: demoLayout,
};

for (const width of WIDTHS) {
  test.describe(`public pages at ${width}px`, () => {
    test.use({
      viewport: { width, height: 900 },
      hasTouch: isTouch(width),
    });

    for (const path of PAGES) {
      test(`${path} fits the screen and keeps its layout`, async ({ page }) => {
        await open(page, path);
        expect(await sideways(page)).toEqual([]);
        await LAYOUT[path]?.(page, width);
      });

      test(`${path} passes axe (WCAG 2.1 A/AA)`, async ({ page }) => {
        await open(page, path);
        expect(await axeProblems(page)).toEqual([]);
      });
    }
  });
}
