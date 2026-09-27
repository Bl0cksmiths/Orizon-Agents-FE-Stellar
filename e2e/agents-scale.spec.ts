/**
 * The registry at the sizes and widths the default fixtures never reach: a
 * large registry, a 360px phone, and an agent id with no break opportunity.
 *
 * The marketplace is open to anyone, so none of these is hypothetical — the
 * live registry already lists two dozen agents, and nothing bounds an id's
 * length but the contract.
 */
import { test, expect } from "@playwright/test";
import { mockAgents, mockApi, type AgentFixture } from "./mocks";

/** The seeded, healthy row every generated agent is cloned from. */
const TEMPLATE: AgentFixture = mockAgents[0];

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
      has: page.getByRole("rowheader", { name: `bulk_${N - 1}`, exact: true }),
    });
    await expect
      .poll(() => last.evaluate((el) => getComputedStyle(el).opacity), {
        timeout: 2_000,
      })
      .toBe("1");
  });
});
