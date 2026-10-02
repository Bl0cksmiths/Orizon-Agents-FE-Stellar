/**
 * The agent registry without an id column.
 *
 * The id used to be the first column and each row's header. It is gone from
 * the screen, and the agent's name heads the row instead, so this holds:
 *
 *   - there is no `id` column header, and the columns that remain are the
 *     ones the caption names;
 *   - every row is headed by its agent's name, and that header's accessible
 *     name carries the id as well, so agents sharing a name are told apart;
 *   - the id is still there for whoever needs it, to bind, dispute or look
 *     it up: on the name's title, and as screen-reader text that takes no
 *     room on screen;
 *   - axe is clean and nothing reaches past the page's right edge at 360px
 *     and 1280px, and at 1280px the narrower table fits without scrolling;
 *   - an agent with a long, unbreakable name wraps inside its own column
 *     rather than starving the others: every header stays on one line, apart
 *     from its neighbours, the reputation chip, runs and status never touch,
 *     and the status badge reads on one line.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockAgents,
  mockApi,
  mockReputationBatch,
  mockWallet,
  mockWalletAddress,
  type AgentFixture,
} from "./mocks";
import { WCAG_TAGS } from "./dispute-axe";
import { registryRowHeader, registryRowName } from "./registry-rows";

const COLUMNS = [
  "agent",
  "skills",
  "price / call",
  "reputation",
  "runs",
  "status",
  "actions",
];

/** A connected owner, so the unbound notices and Manage are on the page too. */
async function openRegistry(page: Page, width = 1280): Promise<void> {
  await mockWallet(page);
  await mockApi(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/app/agents");
  await expect(page.getByRole("rowheader")).toHaveCount(mockAgents.length);
  await expect(
    page.getByRole("heading", { name: "Selection floor" }),
  ).toBeVisible();
}

/**
 * How far past the viewport's right edge the page reaches, in px. The body
 * hides horizontal overflow, so a too-wide table is cut off rather than
 * scrollable; the body's own scroll width still counts it. The registry's
 * scroller is measured too: its edge must sit inside the viewport, with the
 * table scrolling within it.
 */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const region = document.querySelector("[data-scroll-region]");
    return Math.max(
      document.documentElement.scrollWidth - vw,
      document.body.scrollWidth - vw,
      (region?.getBoundingClientRect().right ?? 0) - vw,
    );
  });
}

test.describe("the registry without an id column", () => {
  test("has no id column header", async ({ page }) => {
    await openRegistry(page);
    const table = page.getByRole("table");
    await expect(
      table.getByRole("columnheader", { name: "id", exact: true }),
    ).toHaveCount(0);
    await expect(table.getByRole("columnheader")).toHaveText(COLUMNS);
  });

  test("heads each row with the agent's name", async ({ page }) => {
    await openRegistry(page);
    const headers = page.getByRole("rowheader");
    for (const [i, agent] of mockAgents.entries()) {
      const header = headers.nth(i);
      await expect(header).toHaveAccessibleName(registryRowName(agent));
      // On screen the header leads with the name, and the id is not printed:
      // its text with the screen-reader-only run taken out.
      const seen = await header.evaluate((el) => {
        const copy = el.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".sr-only").forEach((n) => n.remove());
        return copy.textContent ?? "";
      });
      expect(seen.startsWith(agent.name)).toBe(true);
      expect(seen).not.toContain(agent.id);
    }
  });

  test("keeps each id on the name's title and in screen-reader text", async ({
    page,
  }) => {
    await openRegistry(page);
    for (const agent of mockAgents) {
      const header = registryRowHeader(page, agent.id);
      const name = header.locator(`[title="id: ${agent.id}"]`);
      await expect(name).toHaveCount(1);
      const hidden = name.locator(".sr-only");
      await expect(hidden).toHaveText(`(id: ${agent.id})`);
      // Read by a screen reader, and taking no room on screen.
      const box = await hidden.boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(1);
      expect(box?.height ?? 0).toBeLessThanOrEqual(1);
    }
  });

  for (const width of [360, 1280]) {
    test(`is axe-clean and fits the page at ${width}px`, async ({ page }) => {
      await openRegistry(page, width);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      const { violations } = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();
      expect(
        violations.map(
          (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
        ),
      ).toEqual([]);
    });
  }

  // At 60rem the id column's floor made a laptop scroll the table sideways.
  // Without it, the whole registry fits the scroller at 1280px.
  test("fits its scroller without scrolling at 1280px", async ({ page }) => {
    await openRegistry(page, 1280);
    const region = page.getByRole("region", {
      name: "Agent registry table, scrolls horizontally",
    });
    const fits = await region.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    expect(fits).toBe(true);
  });
});

/** One name with no break opportunity but an underscore, owned and unbound,
 *  so its row carries every mark the name cell can hold. */
const LONG_ID = `${"a".repeat(20)}_${"b".repeat(43)}`;
const longAgent: AgentFixture = {
  ...mockAgents[2],
  id: LONG_ID,
  name: `LongIdAgent_${"x".repeat(40)}`,
  owner: mockWalletAddress,
};

async function openLongRegistry(page: Page, width: number): Promise<void> {
  await mockWallet(page);
  await mockApi(page, {
    agents: [...mockAgents, longAgent],
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
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/app/agents");
  await expect(page.getByRole("rowheader")).toHaveCount(mockAgents.length + 1);
  await expect(
    page.getByRole("heading", { name: "Selection floor" }),
  ).toBeVisible();
}

/**
 * Everything crushed in the registry, in words. Measured on what is drawn:
 * the visible text and inline boxes of each cell, with screen-reader-only
 * runs left out (they sit at a 1px point that would skew every box).
 */
async function crushed(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const GAP = 8;
    const found: string[] = [];
    const hidden = (n: Node) =>
      (n instanceof Element ? n : n.parentElement)?.closest(".sr-only");
    const textNodes = (el: Element): Text[] => {
      const out: Text[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!hidden(n) && (n.textContent ?? "").trim()) out.push(n as Text);
      }
      return out;
    };
    const rectsOf = (t: Text) => {
      const r = document.createRange();
      r.selectNodeContents(t);
      return Array.from(r.getClientRects()).filter((b) => b.width > 0);
    };
    /** How many lines the visible text of `el` takes. */
    const lines = (el: Element) => {
      const tops = textNodes(el)
        .flatMap(rectsOf)
        .map((b) => b.top + b.height / 2)
        .sort((a, b) => a - b);
      let n = tops.length ? 1 : 0;
      for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 4) n++;
      return n;
    };
    /** The drawn extent of `el`'s content: its text and inline boxes. */
    const extent = (el: Element) => {
      const boxes = textNodes(el).flatMap(rectsOf);
      for (const c of Array.from(el.querySelectorAll("*"))) {
        if (hidden(c)) continue;
        if (!getComputedStyle(c).display.startsWith("inline")) continue;
        const b = c.getBoundingClientRect();
        if (b.width > 0) boxes.push(b);
      }
      return {
        left: Math.min(...boxes.map((b) => b.left)),
        right: Math.max(...boxes.map((b) => b.right)),
      };
    };
    const label = (el: Element) => `«${(el.textContent ?? "").trim()}»`;

    const table = document.querySelector("table");
    if (!table) return ["no table"];
    const heads = Array.from(table.querySelectorAll("thead th")).filter(
      (th) => textNodes(th).length > 0,
    );
    for (const th of heads) {
      const n = lines(th);
      if (n !== 1) found.push(`header ${label(th)} on ${n} lines`);
    }
    for (let i = 0; i + 1 < heads.length; i++) {
      const gap = extent(heads[i + 1]).left - extent(heads[i]).right;
      if (gap < GAP) {
        found.push(
          `headers ${label(heads[i])} and ${label(heads[i + 1])} ${Math.round(gap)}px apart`,
        );
      }
    }
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
      if (!tr.querySelector('th[scope="row"]')) continue;
      const cells = Array.from(tr.children);
      const name = label(cells[0].querySelector("[title]") ?? cells[0]);
      // price | reputation | runs | status, each pair apart.
      for (const [a, b] of [
        [2, 3],
        [3, 4],
        [4, 5],
      ]) {
        const gap = extent(cells[b]).left - extent(cells[a]).right;
        if (gap < GAP) {
          found.push(
            `${name}: columns ${a} and ${b} ${Math.round(gap)}px apart`,
          );
        }
      }
      const status = cells[5];
      const n = lines(status);
      if (n !== 1) found.push(`${name}: status ${label(status)} on ${n} lines`);
    }
    return found;
  });
}

test.describe("the registry with a long agent name", () => {
  for (const width of [768, 1280, 1440]) {
    test(`keeps every column readable at ${width}px`, async ({ page }) => {
      await openLongRegistry(page, width);
      expect(await crushed(page)).toEqual([]);

      // The long name wraps inside its own column, under its cap, and its
      // marks sit inside the same cell, clear of the name's text.
      const header = registryRowHeader(page, LONG_ID);
      const layout = await header.evaluate((th, id) => {
        const name = th.querySelector(`[title="id: ${id}"]`) as HTMLElement;
        const range = document.createRange();
        range.selectNodeContents(name.firstChild as Node);
        const text = Array.from(range.getClientRects());
        const cell = th.getBoundingClientRect();
        const marks = Array.from(th.querySelectorAll("span"))
          .filter(
            (el) =>
              /^(unbound|. external)$/i.test((el.textContent ?? "").trim()) &&
              !el.closest(".sr-only"),
          )
          .map((el) => el.getBoundingClientRect());
        const hits = (a: DOMRect, b: DOMRect) =>
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom;
        return {
          nameWidth: name.getBoundingClientRect().width,
          textRight: Math.max(...text.map((r) => r.right)),
          cellLeft: cell.left,
          cellRight: cell.right,
          marks: marks.length,
          marksOutside: marks.filter(
            (m) => m.left < cell.left - 1 || m.right > cell.right + 1,
          ).length,
          marksOnName: marks.filter((m) => text.some((t) => hits(m, t))).length,
        };
      }, LONG_ID);
      expect(layout.nameWidth).toBeLessThanOrEqual(18 * 16);
      expect(layout.textRight).toBeLessThanOrEqual(layout.cellRight + 1);
      expect(layout.marks).toBe(2);
      expect(layout.marksOutside).toBe(0);
      expect(layout.marksOnName).toBe(0);
    });
  }
});
