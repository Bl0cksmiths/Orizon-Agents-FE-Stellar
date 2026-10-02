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
 *     and 1280px, and at 1280px the narrower table fits without scrolling.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAgents, mockApi, mockWallet } from "./mocks";
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
