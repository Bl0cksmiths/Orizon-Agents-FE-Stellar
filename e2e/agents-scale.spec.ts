/**
 * The registry at the sizes and widths the default fixtures never reach: a
 * large registry, a 360px phone, and an agent id with no break opportunity.
 *
 * The marketplace is open to anyone, so none of these is hypothetical — the
 * live registry already lists two dozen agents, and nothing bounds an id's
 * length but the contract.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  mockAgents,
  mockApi,
  mockReputationBatchDegraded,
  type AgentFixture,
} from "./mocks";
import { registryRowHeader } from "./registry-rows";

/** The seeded, healthy row every generated agent is cloned from. */
const TEMPLATE: AgentFixture = mockAgents[0];

/** Horizontal page overflow in px; the registry's own scroller is exempt. */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

/** 64 characters with no break opportunity but the one underscore. */
const LONG_ID = `${"a".repeat(20)}_${"b".repeat(43)}`;

test.describe("the registry at scale", () => {
  test("reveals the last row of a large registry promptly", async ({
    page,
  }) => {
    const N = 400;
    const agents: AgentFixture[] = Array.from({ length: N }, (_, i) => ({
      ...TEMPLATE,
      id: `bulk_${i}`,
      name: `Bulk ${i}`,
    }));
    await mockApi(page, { agents });
    await page.goto("/app/agents");
    await expect(page.getByRole("rowheader")).toHaveCount(N);

    // Every row is in the DOM already; the question is whether a buyer can
    // see it. An uncapped stagger gave row 400 a twelve-second delay, so it
    // sat at opacity 0 long after it rendered.
    const last = page.getByRole("row").filter({
      has: registryRowHeader(page, `bulk_${N - 1}`),
    });
    await expect
      .poll(() => last.evaluate((el) => getComputedStyle(el).opacity), {
        timeout: 2_000,
      })
      .toBe("1");
  });

  // The narrowest phone the console supports, the degraded batch (so every
  // listed row gains a "provisional" mark), and an agent whose id and name are
  // single unbreakable runs. The table may scroll inside its own region; the
  // page may not, and the standing marks must wrap inside their cap rather
  // than widen the row.
  test("fits 360px with a long id and every standing mark on one row", async ({
    page,
  }) => {
    const WIDTH = 360;
    const agents: AgentFixture[] = [
      ...mockAgents,
      {
        ...mockAgents[2],
        id: LONG_ID,
        name: `LongIdAgent_${"x".repeat(40)}`,
      },
    ];
    await page.setViewportSize({ width: WIDTH, height: 800 });
    await mockApi(page, {
      agents,
      reputation: {
        ...mockReputationBatchDegraded,
        reputations: {
          ...mockReputationBatchDegraded.reputations,
          [LONG_ID]: {
            ...mockReputationBatchDegraded.reputations.unbound_bot,
            agent_id: LONG_ID,
          },
        },
      },
    });
    await page.goto("/app/agents");
    await expect(page.getByRole("rowheader")).toHaveCount(agents.length);
    await expect(
      page.getByRole("heading", { name: "Selection floor" }),
    ).toBeVisible();

    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

    // Its marks — external, not yet operational, provisional — all present,
    // and wrapped inside the 14rem cap instead of stretching the column.
    const row = page.getByRole("row").filter({
      has: registryRowHeader(page, LONG_ID),
    });
    for (const mark of ["external", "not yet operational", "provisional"]) {
      await expect(row.getByText(new RegExp(`^. ${mark}$`))).toBeVisible();
    }
    const cap = await row.getByText(/^. provisional$/).evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node && !node.className.includes("max-w-[14rem]")) {
        node = node.parentElement;
      }
      return node
        ? { width: node.clientWidth, content: node.scrollWidth }
        : { width: Infinity, content: Infinity };
    });
    // Capped, and the marks inside it wrap rather than spill past the cap —
    // a cap the content overflows would widen the column just the same.
    expect(cap.width).toBeLessThanOrEqual(14 * 16);
    expect(cap.content).toBeLessThanOrEqual(cap.width + 1);

    // The notices above the table sit inside the viewport too.
    for (const heading of ["Agent Registry", "Selection floor"]) {
      const box = await page
        .getByRole("heading", { name: heading })
        .boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? -1) + (box?.width ?? Infinity)).toBeLessThanOrEqual(
        WIDTH,
      );
    }
  });
});
