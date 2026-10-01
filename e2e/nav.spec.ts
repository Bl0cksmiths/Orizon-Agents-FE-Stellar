/**
 * The marketing nav, at the six widths it is designed for (and 360px).
 *
 * What went wrong before this redesign, live on 2026-10-01: at 1920 the two
 * buttons wrapped onto two lines and the logo's "_" touched the first link;
 * at 1280 eight equal links ran edge to edge. So at every width:
 *
 *   - nothing scrolls sideways;
 *   - each button's label sits on one line, in a one-line-high button;
 *   - the logo keeps a clear gap before the next item;
 *   - from `lg` (1024) the whole bar is one row, and below it the toggle
 *     takes the links' place;
 *   - axe is clean with each menu, or the sheet, open.
 *
 * Then the behaviour a mouse, a keyboard and a phone each rely on, in a real
 * browser — the unit tests in app/(marketing)/_components/nav.test.tsx cannot
 * see visibility, layout or the top layer.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { WCAG_TAGS, disputeScan } from "./dispute-axe";
import { mockApi, mockWallet } from "./mocks";

const WIDTHS = [
  // The narrowest phone the other public-page specs read at, then the six.
  { width: 360, height: 780 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
/** Tailwind's `lg`: where the full bar replaces the toggle. */
const DESKTOP_FROM = 1024;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

const header = (page: Page) => page.getByRole("banner").first();
const bar = (page: Page) =>
  header(page).getByRole("navigation", { name: "Main" });
const menuButton = (page: Page, name: "Platform" | "Resources") =>
  bar(page).getByRole("button", { name, exact: true });
const panel = (page: Page, name: "Platform" | "Resources") =>
  page.locator(`#nav-menu-${name.toLowerCase()}`);
const logo = (page: Page) =>
  header(page).getByRole("link", { name: "Orizon Agents — home" });
const launch = (page: Page) =>
  header(page).getByRole("link", { name: /launch app/i });
const connectWallet = (page: Page) =>
  header(page).getByRole("button", { name: "Connect Wallet" });
const toggle = (page: Page) =>
  header(page).getByRole("button", { name: "Open menu" });
const sheet = (page: Page) => page.locator("dialog#marketing-mobile-menu");
/** The sheet's panel, inside the dialog box. */
const sheetPanel = (page: Page) =>
  page.locator("dialog#marketing-mobile-menu > div");

async function visit(page: Page, path = "/") {
  await mockApi(page);
  await page.goto(path);
  await expect(logo(page)).toBeVisible();
  // The bar is server-rendered, so it is visible before React hydrates it,
  // and a press in that window does nothing. React tags each element it has
  // hydrated with its props; the toggle, always in the DOM, is the signal.
  await expect
    .poll(() =>
      page
        .locator('header button[aria-controls="marketing-mobile-menu"]')
        .evaluate((el) =>
          Object.keys(el).some((key) => key.startsWith("__reactProps")),
        ),
    )
    .toBe(true);
}

async function overflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
}

/**
 * A control's label lines, and its own height. The lines are measured from
 * the text's own boxes, not the control's: a fixed-height button keeps its
 * height while its label wraps and spills, which is exactly what happened.
 */
async function lines(control: Locator) {
  return control.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const boxes = Array.from(range.getClientRects()).filter((r) => r.width);
    const top = Math.min(...boxes.map((r) => r.top));
    const bottom = Math.max(...boxes.map((r) => r.bottom));
    const fontSize = parseFloat(getComputedStyle(el).fontSize);
    return {
      // Two lines of text span at least two line-heights (> 2em).
      lines: bottom - top < 2 * fontSize ? 1 : 2,
      height: el.getBoundingClientRect().height,
    };
  });
}

async function expectOneLine(control: Locator) {
  const measured = await lines(control);
  expect(measured.lines).toBe(1);
  expect(measured.height).toBeLessThanOrEqual(40);
}

/**
 * Axe on the header alone, with a menu open. The page behind is the hero
 * mid-entrance, which is not the nav's to judge; the open sheet, a modal, is
 * judged by `disputeScan` instead.
 *
 * The panel lays a faint gradient (`data-decor`) over its opaque surface, and
 * axe files any text over a gradient as unjudged. As in e2e/dispute-axe.ts,
 * the overlay is flattened into its parent at its LIGHTEST point for the
 * scan — the worst case for light text — and any contrast axe still could not
 * judge in the header fails the scan rather than passing quietly.
 */
async function headerScan(page: Page): Promise<string[]> {
  const flattened = await page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (css: string): Rgba | null => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)];
    };
    const over = (top: Rgba, under: Rgba): Rgba => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
      1,
    ];
    const light = ([r, g, b]: Rgba) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let n = 0;
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("header [data-decor]"),
    )) {
      const parent = el.parentElement;
      const base = parent && parse(getComputedStyle(parent).backgroundColor);
      const stops = (
        getComputedStyle(el).backgroundImage.match(/rgba?\([^)]+\)/g) ?? []
      )
        .map(parse)
        .filter((s): s is Rgba => s !== null);
      if (!parent || !base || base[3] < 1 || stops.length === 0) continue;
      const worst = stops
        .map((s) => over(s, base))
        .reduce((a, b) => (light(b) > light(a) ? b : a));
      el.dataset.navAxe = "";
      el.style.setProperty("display", "none", "important");
      parent.dataset.navAxeBg = parent.style.backgroundColor;
      parent.style.setProperty(
        "background-color",
        `rgb(${worst.slice(0, 3).map(Math.round).join(",")})`,
        "important",
      );
      n += 1;
    }
    return n;
  });
  expect(flattened, "decor overlays flattened").toBeGreaterThan(0);
  let result: Awaited<ReturnType<AxeBuilder["analyze"]>>;
  try {
    result = await new AxeBuilder({ page })
      .include("header")
      .withTags(WCAG_TAGS)
      .analyze();
  } finally {
    await page.evaluate(() => {
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("[data-nav-axe]"),
      )) {
        el.style.removeProperty("display");
        delete el.dataset.navAxe;
      }
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("[data-nav-axe-bg]"),
      )) {
        el.style.backgroundColor = el.dataset.navAxeBg ?? "";
        delete el.dataset.navAxeBg;
      }
    });
  }
  const target = (n: { target: unknown[] }) => n.target.map(String).join(" ");
  return [
    ...result.violations.map(
      (v) => `${v.id}: ${v.nodes.map(target).join(", ")}`,
    ),
    ...result.incomplete
      .filter((v) => v.id === "color-contrast")
      .flatMap((v) => v.nodes)
      // A node of symbols only (the ▸ beside "Launch App") is decoration
      // axe cannot read as text; WCAG 1.4.3 exempts it.
      .filter(
        (n) =>
          !n.any.some((c) =>
            c.message.includes("contains only non-text characters"),
          ),
      )
      .map(
        (n) =>
          `color-contrast [unjudged] ${target(n)}: ${n.any.map((c) => c.message).join("; ")}`,
      ),
  ];
}

const rect = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });

for (const viewport of WIDTHS) {
  const desktop = viewport.width >= DESKTOP_FROM;

  test.describe(`marketing nav at ${viewport.width}px`, () => {
    test.use({ viewport });

    for (const path of ["/", "/evidence"]) {
      test(`${path} fits: no sideways scroll, one-line buttons, a clear logo`, async ({
        page,
      }) => {
        await visit(page, path);
        expect(await overflowX(page)).toBeLessThanOrEqual(0);

        await expectOneLine(launch(page));
        if (desktop) await expectOneLine(connectWallet(page));

        // The item right after the logo: the first menu on desktop, the
        // Launch App button below it.
        const next = desktop ? menuButton(page, "Platform") : launch(page);
        const gap = (await rect(next)).left - (await rect(logo(page))).right;
        expect(gap).toBeGreaterThanOrEqual(desktop ? 32 : 12);

        if (desktop) {
          await expect(bar(page)).toBeVisible();
          await expect(toggle(page)).toBeHidden();
          // One row: every top-level item shares the bar's middle line.
          const items = [
            logo(page),
            menuButton(page, "Platform"),
            menuButton(page, "Resources"),
            bar(page).getByRole("link", { name: "Guide", exact: true }),
            connectWallet(page),
            launch(page),
          ];
          const middles = await Promise.all(
            items.map(async (item) => {
              const r = await rect(item);
              return (r.top + r.bottom) / 2;
            }),
          );
          for (const middle of middles) {
            expect(Math.abs(middle - middles[0])).toBeLessThanOrEqual(2);
          }
          // Left to right, never overlapping.
          const rects = await Promise.all(items.map(rect));
          for (let i = 1; i < rects.length; i++) {
            expect(rects[i].left).toBeGreaterThanOrEqual(rects[i - 1].right);
          }
          expect((await rect(header(page))).bottom).toBeLessThanOrEqual(65);
        } else {
          await expect(bar(page)).toBeHidden();
          await expect(toggle(page)).toBeVisible();
          await expect(connectWallet(page)).toBeHidden();
        }
      });
    }

    if (desktop) {
      for (const name of ["Platform", "Resources"] as const) {
        test(`the ${name} menu fits and is clean under axe when open`, async ({
          page,
        }) => {
          await visit(page);
          await menuButton(page, name).click();
          await expect(menuButton(page, name)).toHaveAttribute(
            "aria-expanded",
            "true",
          );
          const links = panel(page, name).getByRole("link");
          await expect(links.first()).toBeVisible();
          await expect(panel(page, name)).toHaveCSS("opacity", "1");
          // The open panel stays inside the window.
          const box = await rect(panel(page, name).locator("> div"));
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(viewport.width);
          expect(await overflowX(page)).toBeLessThanOrEqual(0);
          expect(await headerScan(page)).toEqual([]);
        });
      }
    } else {
      test("the sheet fits and is clean under axe when open", async ({
        page,
      }) => {
        await visit(page);
        await toggle(page).click();
        await expect(sheet(page)).toBeVisible();
        // Once its slide-in has settled, the panel sits inside the window.
        await expect
          .poll(async () => (await rect(sheetPanel(page))).right)
          .toBeLessThanOrEqual(viewport.width);
        expect((await rect(sheetPanel(page))).left).toBeGreaterThanOrEqual(0);
        // Both actions sit at the bottom of the window, on one line each.
        const launchInSheet = sheet(page).getByRole("link", {
          name: /launch app/i,
        });
        await expectOneLine(launchInSheet);
        expect((await rect(launchInSheet)).bottom).toBeGreaterThan(
          viewport.height - 100,
        );
        expect(await disputeScan(page)).toEqual([]);
      });
    }
  });
}

test.describe("marketing nav menus", () => {
  test.use({ viewport: DESKTOP });

  test("are hidden until opened, and only one is open at a time", async ({
    page,
  }) => {
    await visit(page);
    await expect(panel(page, "Platform").getByRole("link")).toHaveCount(0);
    await menuButton(page, "Platform").click();
    await expect(
      panel(page, "Platform").getByRole("link", { name: "Roadmap" }),
    ).toBeVisible();
    await menuButton(page, "Resources").click();
    await expect(menuButton(page, "Platform")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(panel(page, "Platform").getByRole("link")).toHaveCount(0);
    await expect(
      panel(page, "Resources").getByRole("link", { name: "Litepaper" }),
    ).toBeVisible();
  });

  test("work from the keyboard, with a visible focus ring", async ({
    page,
  }) => {
    await visit(page);
    const button = menuButton(page, "Platform");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    const product = panel(page, "Platform").getByRole("link", {
      name: "Product",
    });
    await expect(product).toBeFocused();
    // The ring is there with focus and gone without it.
    const ring = () => product.evaluate((a) => getComputedStyle(a).boxShadow);
    const focused = await ring();
    expect(focused).not.toBe("none");
    await page.keyboard.press("ArrowUp");
    await expect(
      panel(page, "Platform").getByRole("link", { name: "Roadmap" }),
    ).toBeFocused();
    expect(await ring()).toBe("none");

    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();

    // Tab walks through an open menu and closes it on the way out.
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
    await expect(
      panel(page, "Platform").getByRole("link", { name: "Roadmap" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(menuButton(page, "Resources")).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("close on a click outside", async ({ page }) => {
    await visit(page);
    await menuButton(page, "Resources").click();
    await expect(
      panel(page, "Resources").getByRole("link").first(),
    ).toBeVisible();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(menuButton(page, "Resources")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(panel(page, "Resources").getByRole("link")).toHaveCount(0);
  });

  test("lead to their pages, and a section link to its section", async ({
    page,
  }) => {
    await visit(page, "/evidence");
    await menuButton(page, "Platform").click();
    await panel(page, "Platform")
      .getByRole("link", { name: "Roadmap" })
      .click();
    await page.waitForURL(/\/#roadmap$/);
    await expect(page.locator("#roadmap")).toBeInViewport();
    await expect(menuButton(page, "Platform")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("show the current page", async ({ page }) => {
    await visit(page, "/evidence");
    await expect(menuButton(page, "Resources")).toHaveAttribute(
      "data-current",
      "true",
    );
    await expect(menuButton(page, "Platform")).not.toHaveAttribute(
      "data-current",
      /.*/,
    );
    await menuButton(page, "Resources").click();
    await expect(
      panel(page, "Resources").getByRole("link", { name: "Evidence" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      panel(page, "Resources").getByRole("link", { name: "Litepaper" }),
    ).not.toHaveAttribute("aria-current", /.*/);

    await visit(page, "/guide/list-your-agent");
    await expect(
      bar(page).getByRole("link", { name: "Guide", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("move without motion for a reader who asked for less", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await visit(page);
    await menuButton(page, "Platform").click();
    await expect(panel(page, "Platform")).toHaveCSS(
      "transition-property",
      "none",
    );
  });

  test("keep the bar on one row at 1024 with a wallet connected", async ({
    page,
  }) => {
    await mockWallet(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await visit(page);
    const address = header(page).getByRole("button", { name: /◆/ });
    await expect(address).toBeVisible();
    await expectOneLine(address);
    await expectOneLine(launch(page));
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    const a = await rect(address);
    const r = await rect(menuButton(page, "Resources"));
    const guide = await rect(
      bar(page).getByRole("link", { name: "Guide", exact: true }),
    );
    expect(guide.right).toBeLessThanOrEqual(a.left);
    expect(
      Math.abs((a.top + a.bottom) / 2 - (r.top + r.bottom) / 2),
    ).toBeLessThanOrEqual(2);
  });
});

test.describe("marketing nav sheet", () => {
  test.use({ viewport: PHONE });

  test("opens as a modal over a locked page and keeps focus inside", async ({
    page,
  }) => {
    await visit(page);
    // Opened the moment the page can take it: the sheet must still arrive
    // fully visible, not stuck at its entrance's first frame.
    await toggle(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheetPanel(page)).toHaveCSS("opacity", "1");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(
      sheet(page).getByRole("link", { name: "Product" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflow,
      ),
    ).toBe("hidden");
    // Grouped under headed sections, with both actions at the bottom.
    await expect(sheet(page).getByRole("heading", { level: 3 })).toHaveText([
      "Platform",
      "Resources",
    ]);
    // Twice round the whole sheet by Tab, never once outside it.
    const stops = await sheet(page)
      .locator("a[href], button:not([disabled])")
      .count();
    for (let i = 0; i < stops * 2; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("dialog[open]")),
        ),
      ).toBe(true);
    }
    for (let i = 0; i < stops; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("dialog[open]")),
        ),
      ).toBe(true);
    }
  });

  test("closes on Escape and gives focus back to the toggle", async ({
    page,
  }) => {
    await visit(page);
    await toggle(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflow,
      ),
    ).not.toBe("hidden");
  });

  test("closes on a route change, and on a section link", async ({ page }) => {
    await visit(page);
    await toggle(page).click();
    await sheet(page).getByRole("link", { name: "Use cases" }).click();
    await expect(sheet(page)).toBeHidden();
    await page.waitForURL(/\/#use-cases$/);

    await toggle(page).click();
    await sheet(page).getByRole("link", { name: "Evidence" }).click();
    await page.waitForURL(/\/evidence$/);
    await expect(sheet(page)).toBeHidden();
    // And it marks the page it led to.
    await toggle(page).click();
    await expect(
      sheet(page).getByRole("link", { name: "Evidence" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("closes when the window grows into the desktop bar", async ({
    page,
  }) => {
    await visit(page);
    await toggle(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.setViewportSize(DESKTOP);
    await expect(sheet(page)).toBeHidden();
    await expect(bar(page)).toBeVisible();
  });
});
