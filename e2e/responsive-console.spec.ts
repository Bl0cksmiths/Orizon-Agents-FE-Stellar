/**
 * The console at phone, tablet, laptop and desktop widths.
 *
 * Every console page is opened at 360, 768, 1024, 1440 and 1920px with
 * realistic data, including a 64-character agent id, a 50-character name and
 * a 52-character task id, and is held to four things:
 *
 *   - nothing reaches past the right edge. The body hides horizontal overflow,
 *     so a too-wide element is not scrollable, it is cut off; the check reads
 *     the body's own scroll width, which still counts what is hidden. Text
 *     spilling out of a box that clips it (every Card is `clip-path`ed) is
 *     caught too, since that is lost without moving any box;
 *   - the sidebar is a rail from lg (1024px) and a drawer below it. At 768px
 *     a 240px rail left the page 528px and clipped the overview's figures;
 *   - every figure tile sits inside the viewport with nothing cut off;
 *   - axe finds no WCAG 2.0/2.1 A or AA violation at that width.
 *
 * Wide tables are the one sanctioned exception to the first rule: they live
 * in a `ScrollRegion`, which is focusable, named and marked as scrolling.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { WCAG_TAGS } from "./dispute-axe";
import {
  mockAdoptionWithOperator,
  mockAgents,
  mockApi,
  mockDispute,
  mockDisputeApi,
  mockDisputeTaskId,
  mockPlanExcluded,
  mockReputationBatch,
  mockSettlementSteps,
  mockSettlementView,
  mockTaskReadToken,
  mockTasks,
  mockTraceStream,
  mockWallet,
  mockWalletAddress,
  type AgentFixture,
} from "./mocks";
import { motionSettled } from "./motion-settled";
import { mockNetwork } from "./plan-fixtures";

const WIDTHS = [360, 768, 1024, 1440, 1920] as const;
/** Where the sidebar stops being a drawer (DESKTOP_NAV_QUERY). */
const RAIL_FROM = 1024;
const RAIL_WIDTH = 240;

const LONG_ID = `${"a".repeat(20)}_${"b".repeat(43)}`;
const LONG_TASK = `task_${"9f3a".repeat(12)}`;

const longAgent: AgentFixture = {
  ...mockAgents[2],
  id: LONG_ID,
  name: `LongIdAgent_${"x".repeat(40)}`,
  owner: mockWalletAddress,
};
const agents = [...mockAgents, longAgent];

/** A connected wallet, the testnet's network answer and long-valued data. */
async function mockConsole(
  page: Page,
  extra: Parameters<typeof mockApi>[1] = {},
): Promise<void> {
  await mockWallet(page);
  await mockApi(page, {
    agents,
    reputation: {
      ...mockReputationBatch,
      reputations: {
        ...mockReputationBatch.reputations,
        [LONG_ID]: {
          ...mockReputationBatch.reputations.unbound_bot,
          agent_id: LONG_ID,
        },
      },
    },
    adoption: mockAdoptionWithOperator,
    ...extra,
  });
  await mockNetwork(page);
  await page.route("**/api/tasks", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        ...mockTasks,
        {
          id: LONG_TASK,
          intent:
            "research the top fifty stellar anchors and compile a comparison of their fee schedules across every corridor",
          agents: 7,
          spent: 1.23456,
          status: "complete",
          started: "2026-07-27 11:00",
        },
      ]),
    }),
  );
  // With the network known the events page polls Soroban RPC directly; a
  // quiet ledger keeps the spec off the public testnet.
  await page.route("**/soroban-testnet.stellar.org/**", async (route) => {
    const body = route.request().postDataJSON() as {
      id: number;
      method: string;
    };
    const result =
      body.method === "getLatestLedger"
        ? { id: "e2e", protocolVersion: 22, sequence: 1010 }
        : { events: [], latestLedger: 1010, cursor: "0004295000000000000-1" };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
    });
  });
}

type ConsolePage = {
  path: string;
  setup?: (page: Page) => Promise<void>;
  /** What has to be on screen before the page is judged. */
  ready: (page: Page) => Promise<void>;
};

const tiles = (page: Page) => page.locator("main [data-stat-tile]");

const PAGES: ConsolePage[] = [
  {
    path: "/app",
    ready: async (page) => {
      await expect(tiles(page)).toHaveCount(4);
      await expect(
        page.getByRole("rowheader", { name: LONG_TASK }),
      ).toHaveCount(1);
    },
  },
  {
    path: "/app/agents",
    ready: async (page) => {
      await expect(page.getByRole("rowheader")).toHaveCount(agents.length);
      await expect(
        page.getByRole("heading", { name: "Selection floor" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: `bind ${LONG_ID}` }),
      ).toBeVisible();
    },
  },
  {
    path: "/app/register",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    },
  },
  {
    path: "/app/bind",
    ready: async (page) => {
      await expect(page.getByRole("button", { name: LONG_ID })).toBeVisible();
    },
  },
  {
    path: "/app/operator",
    ready: async (page) => {
      await expect(
        page.getByRole("button", { name: `settings for ${LONG_ID}` }),
      ).toBeVisible();
      await expect(tiles(page).first()).toBeVisible();
    },
  },
  {
    path: "/app/ecosystem",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "External operators" }),
      ).toBeVisible();
    },
  },
  {
    path: "/app/reputation",
    ready: async (page) => {
      await expect(tiles(page)).toHaveCount(4);
      await expect(page.getByText(longAgent.name)).toBeVisible();
    },
  },
  {
    // The plan card, drawn: a decompose against the exclusions fixture.
    path: "/app/orchestrator",
    setup: (page) => mockConsole(page, { plan: mockPlanExcluded }),
    ready: async (page) => {
      await page
        .getByRole("textbox", { name: /intent/i })
        .fill(mockPlanExcluded.intent);
      await page.getByRole("button", { name: /decompos/i }).click();
      await expect(
        page.getByRole("heading", { name: /execution plan/i }),
      ).toBeVisible();
    },
  },
  {
    path: "/app/trace",
    ready: async (page) => {
      await expect(
        page.getByRole("heading", { name: "Trace", level: 1 }),
      ).toBeVisible();
    },
  },
  {
    // The receipt panel of a settled workflow, one step under dispute.
    path: `/app/trace?task=${mockDisputeTaskId}`,
    setup: async (page) => {
      const settledAtS = Math.floor(Date.now() / 1000) - 3600;
      await mockTaskReadToken(page);
      await mockConsole(page);
      await mockTraceStream(page, mockDisputeTaskId);
      await mockDisputeApi(page, {
        settlement: mockSettlementView({ settledAtS }),
        disputes: [
          mockDispute(mockSettlementSteps[0], {
            openedAtS: settledAtS + 600,
            reason: "the outline misses half of the brief",
          }),
        ],
      });
    },
    ready: async (page) => {
      await expect(
        page
          .getByRole("region", { name: "Receipt" })
          .getByRole("button", { name: /^Dispute step/ }),
      ).toHaveCount(1);
    },
  },
  {
    path: "/app/events",
    ready: async (page) => {
      await expect(page.getByText("ledger #1010")).toBeVisible();
    },
  },
  {
    path: "/app/send",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    },
  },
  {
    path: "/app/flow",
    ready: async (page) => {
      await expect(tiles(page)).toHaveCount(3);
    },
  },
  {
    path: "/app/pdax",
    ready: async (page) => {
      await expect(page.getByText("PHP", { exact: true })).toBeVisible();
    },
  },
  {
    path: "/app/wallet",
    ready: async (page) => {
      await expect(page.getByText("Agent Registry")).toBeVisible();
    },
  },
];

/** Scrolls to the bottom a screen at a time, then back to the top. */
async function scrollThrough(page: Page): Promise<void> {
  const { height, step } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    step: window.innerHeight,
  }));
  for (let y = step; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    // Long enough for an IntersectionObserver round: scrolled past within a
    // frame, a section is never seen, and never fades in.
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * Everything that runs past the viewport or out of a box that clips it.
 * Elements inside a ScrollRegion are skipped: scrolling there is the design.
 */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const found: string[] = [];
    const name = (el: Element) =>
      `<${el.tagName.toLowerCase()} class="${String((el as HTMLElement).className).slice(0, 60)}"> «${(el.textContent ?? "").trim().slice(0, 40)}»`;
    if (document.body.scrollWidth > vw) {
      found.push(`page is ${document.body.scrollWidth}px wide in ${vw}px`);
    }
    const main = document.querySelector("main");
    for (const el of Array.from(main?.querySelectorAll("*") ?? [])) {
      if (el.closest("[data-scroll-region], .sr-only, svg")) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > vw + 1) {
        found.push(`ends at ${Math.round(box.right)}px: ${name(el)}`);
        continue;
      }
      const clip = clipperOf(el as HTMLElement);
      const clipRight = clip?.getBoundingClientRect().right ?? Infinity;
      if (
        box.right > clipRight + 1 &&
        !el.closest("[aria-hidden=true], [data-decor]") &&
        !(
          el.parentElement &&
          el.parentElement.getBoundingClientRect().right > clipRight + 1
        )
      ) {
        found.push(
          `cut off by its card at ${Math.round(clipRight)}px: ${name(el)}`,
        );
        continue;
      }
      // A control whose label wrapped inside its fixed height spills out of
      // the bottom of its own border (h-8 buttons do not grow).
      if (
        (el.tagName === "BUTTON" || el.tagName === "A") &&
        (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1
      ) {
        found.push(`label wrapped out of its control: ${name(el)}`);
        continue;
      }
      // Content wider than its own box is only lost when it also runs past
      // the nearest ancestor that clips: a Card's clip-path, or overflow
      // hidden. Text overflowing that way moves no box, so the edge check
      // above never sees it.
      const h = el as HTMLElement;
      if (
        getComputedStyle(h).overflowX !== "visible" ||
        h.clientWidth === 0 ||
        h.scrollWidth <= h.clientWidth + 1
      ) {
        continue;
      }
      const end = box.left + h.scrollWidth;
      if (clip && end > clipRight + 1) {
        found.push(
          `content ${h.scrollWidth}px in a ${h.clientWidth}px box, cut off by its card: ${name(el)}`,
        );
      }
    }
    return found;

    function clipperOf(el: HTMLElement): HTMLElement | null {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.clipPath !== "none" || /hidden|clip/.test(style.overflowX)) {
          return p;
        }
      }
      return null;
    }
  });
}

/** Figure tiles that leave the viewport or cut their own content off. */
async function clippedTiles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    for (const tile of Array.from(
      document.querySelectorAll("main [data-stat-tile]"),
    )) {
      const box = tile.getBoundingClientRect();
      const label = (tile.textContent ?? "").trim().slice(0, 30);
      if (box.left < 0 || box.right > vw) {
        bad.push(
          `«${label}» spans ${Math.round(box.left)}..${Math.round(box.right)}`,
        );
      }
      for (const el of Array.from(tile.querySelectorAll("*"))) {
        const r = el.getBoundingClientRect();
        const h = el as HTMLElement;
        if (r.width === 0 || el.closest("[aria-hidden=true],[data-decor]"))
          continue;
        if (r.right > box.right + 1 || h.scrollWidth > h.clientWidth + 1) {
          bad.push(`«${label}» cuts off «${(el.textContent ?? "").trim()}»`);
        }
      }
    }
    return bad;
  });
}

/**
 * The top bar holds one row: nothing past the right edge, and no control
 * whose label wrapped inside its fixed height (at 360px the wallet address
 * used to break onto a second line inside a 32px chip).
 */
async function topBarProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    const header = document.querySelector("header");
    for (const el of Array.from(header?.querySelectorAll("*") ?? [])) {
      const h = el as HTMLElement;
      const box = h.getBoundingClientRect();
      if (box.width === 0 || h.closest(".sr-only")) continue;
      const what = (h.textContent ?? "").trim().slice(0, 30);
      if (box.right > vw + 1 || box.left < -1)
        bad.push(`off screen: «${what}»`);
      if (
        (h.tagName === "BUTTON" || h.tagName === "A") &&
        h.scrollHeight > h.clientHeight + 1
      ) {
        bad.push(`wrapped: «${what}»`);
      }
      // Content wider than its box runs under its neighbour: the crumbs
      // used to slide beneath the wallet controls.
      if (
        getComputedStyle(h).overflowX === "visible" &&
        h.scrollWidth > h.clientWidth + 1
      ) {
        bad.push(
          `crowded: «${what}» needs ${h.scrollWidth}px of ${h.clientWidth}px`,
        );
      }
    }
    return bad;
  });
}

async function expectNavMode(page: Page, width: number): Promise<void> {
  const aside = page.locator("aside");
  const menu = page.getByRole("button", { name: "open menu" });
  const main = (await page.locator("main").boundingBox())!;
  const rail = (await aside.boundingBox())!;
  if (width >= RAIL_FROM) {
    expect(rail.x, "the rail sits at the left edge").toBe(0);
    expect(rail.width).toBe(RAIL_WIDTH);
    await expect(aside).not.toHaveAttribute("inert", "");
    await expect(menu).toBeHidden();
    expect(main.x, "the page starts right of the rail").toBeGreaterThanOrEqual(
      RAIL_WIDTH,
    );
  } else {
    expect(
      rail.x + rail.width,
      "the closed drawer is off screen",
    ).toBeLessThanOrEqual(0);
    await expect(aside).toHaveAttribute("inert", "");
    await expect(menu).toBeVisible();
    expect(main.x, "the page has the full width").toBe(0);
  }
}

test.describe("the console at every width", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const consolePage of PAGES) {
    test(`${consolePage.path} fits 360 to 1920px`, async ({ page }) => {
      test.slow();
      await (consolePage.setup ?? mockConsole)(page);
      for (const width of WIDTHS) {
        await test.step(`${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(consolePage.path);
          await consolePage.ready(page);
          // Entrances fade opacity inline even under reduced motion; axe
          // judging a row mid-fade fails contrast that the page never shows.
          // Scrolled through first, so the sections that fade in on reaching
          // the viewport have reached it.
          await scrollThrough(page);
          await motionSettled(page.locator("main"));
          await expectNavMode(page, width);
          expect(await topBarProblems(page), `top bar at ${width}px`).toEqual(
            [],
          );
          expect(await overflow(page), `overflow at ${width}px`).toEqual([]);
          expect(await clippedTiles(page), `tiles at ${width}px`).toEqual([]);
          const { violations } = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();
          expect(
            violations.map(
              (v) =>
                `${v.id} [${v.impact}] ${v.help}: ${v.nodes
                  .map(
                    (n) =>
                      `${n.target.join(" ")} (${n.failureSummary?.split("\n").pop()?.trim() ?? ""})`,
                  )
                  .join("; ")}`,
            ),
            `axe at ${width}px`,
          ).toEqual([]);
        });
      }
    });
  }
});

test.describe("the console drawer", () => {
  for (const width of [360, 768]) {
    test(`at ${width}px it opens as a modal, traps focus and closes on Escape`, async ({
      page,
    }) => {
      await mockConsole(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app");
      const menu = page.getByRole("button", { name: "open menu" });
      await menu.click();

      const drawer = page.getByRole("dialog", { name: "Navigation" });
      await expect(drawer).toBeVisible();
      await expect(drawer).not.toHaveAttribute("inert", "");
      // Slid all the way in (the slide is a 200ms transition).
      await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
      const box = (await drawer.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await expect(page.locator("body")).toHaveClass(/overflow-hidden/);

      // Focus moves in, and Tab and Shift+Tab wrap inside the drawer.
      const inDrawer = () =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest("aside[role=dialog]")),
        );
      expect(await inDrawer()).toBe(true);
      const close = drawer.getByRole("button", { name: "close menu" });
      const controls = drawer.locator("a[href], button:not([disabled])");
      const stops = await controls.count();
      // Tab from the drawer itself lands on its first control; Shift+Tab
      // from there wraps to its last instead of leaving for the page.
      await page.keyboard.press("Tab");
      await expect(controls.first()).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(controls.last()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(controls.first()).toBeFocused();
      for (let i = 0; i < stops + 2; i++) {
        await page.keyboard.press("Tab");
        expect(await inDrawer(), `Tab ${i + 1}`).toBe(true);
      }

      // Every control in it is a 44px target.
      for (const link of await drawer.getByRole("link").all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await menu.boundingBox())!.width).toBeGreaterThanOrEqual(44);

      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(menu).toBeFocused();
      await expect(page.locator("aside")).toHaveAttribute("inert", "");
      await expect(page.locator("body")).not.toHaveClass(/overflow-hidden/);
    });
  }

  test("the close button closes it", async ({ page }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app");
    await page.getByRole("button", { name: "open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await drawer.getByRole("button", { name: "close menu" }).click();
    await expect(drawer).toHaveCount(0);
  });

  test("the backdrop covers the top bar", async ({ page }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/app");
    await page.getByRole("button", { name: "open menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Navigation" }),
    ).toBeVisible();
    // A point on the top bar, right of the drawer: what is on top there must
    // be the backdrop, not the top bar still painted over it. The page behind
    // is `inert`, which takes it out of hit testing altogether, so it is
    // lifted for the one probe: this asks about paint order, not about clicks.
    const hit = await page.evaluate(() => {
      const header = document.querySelector("header");
      const inert = Array.from(document.querySelectorAll("[inert]")).filter(
        (el) => header && el.contains(header),
      );
      inert.forEach((el) => el.removeAttribute("inert"));
      const el = document.elementFromPoint(700, 32);
      inert.forEach((el) => el.setAttribute("inert", ""));
      return el?.getAttribute("aria-label") ?? el?.tagName ?? null;
    });
    expect(hit).toBe("close menu");
  });

  test("widening past lg while open hands the page back", async ({ page }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/app");
    await page.getByRole("button", { name: "open menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Navigation" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveClass(/overflow-hidden/);
    // The page behind is interactive again, not left inert.
    await expect(
      page.locator("main").locator("xpath=ancestor::div[@inert]"),
    ).toHaveCount(0);
  });
});

test.describe("long values stay readable", () => {
  test("a capped id keeps its whole value in the title and the accessible name", async ({
    page,
  }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/agents");
    const header = page.getByRole("rowheader", { name: LONG_ID, exact: true });
    await expect(header).toHaveCount(1);
    await expect(header.locator(`[title="${LONG_ID}"]`)).toHaveCount(1);
    // Ellipsised on screen: the box is narrower than the text in it.
    const cut = await header
      .locator(`[title="${LONG_ID}"]`)
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut).toBe(true);
  });

  // The unbound notice spans every column of a 60rem table. Held to the
  // scroller's visible width, its bind action is on screen however far the
  // columns above it are scrolled.
  test("a full-width registry row stays in view while the table scrolls", async ({
    page,
  }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/agents");
    const region = page.getByRole("region", {
      name: "Agent registry table, scrolls horizontally",
    });
    const bind = page.getByRole("link", { name: `bind ${LONG_ID}` });
    await expect(bind).toBeVisible();
    // Its label is ellipsised inside the button rather than spilling out.
    expect(
      await bind.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth + 1 &&
          el.scrollHeight <= el.clientHeight + 1,
      ),
    ).toBe(true);
    for (const left of [0, 10_000]) {
      await region.evaluate((el, x) => el.scrollTo({ left: x }), left);
      await expect
        .poll(async () => {
          const r = (await region.boundingBox())!;
          const b = (await bind.boundingBox())!;
          return b.x >= r.x - 1 && b.x + b.width <= r.x + r.width + 1;
        })
        .toBe(true);
    }
  });

  test("the top bar fits a phone with no wallet and the backend offline", async ({
    page,
  }) => {
    // No wallet: the wide "Connect Wallet" button. No network answer: the
    // "offline ↻" retry pill. Both at once is the most the bar ever holds.
    await mockApi(page);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/wallet");
    await expect(
      page.getByRole("banner").getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /backend unreachable/i }),
    ).toBeVisible();
    expect(await topBarProblems(page)).toEqual([]);
  });

  test("a wide table says that it scrolls", async ({ page }) => {
    await mockConsole(page);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app/agents");
    await expect(page.getByRole("rowheader")).toHaveCount(agents.length);
    const region = page.getByRole("region", {
      name: "Agent registry table, scrolls horizontally",
    });
    await expect(region).toHaveAttribute("data-overflowing", "true");
    await expect(page.getByText("scroll sideways for more →")).toBeVisible();
    // Scrolled to the end, the hint turns round.
    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(page.getByText("← scroll back")).toBeVisible();
    // And at a width where the table fits, there is nothing to say.
    await page.setViewportSize({ width: 1920, height: 900 });
    await expect(region).toHaveAttribute("data-overflowing", "false");
    await expect(page.getByText(/scroll sideways|scroll back/)).toHaveCount(0);
  });
});
