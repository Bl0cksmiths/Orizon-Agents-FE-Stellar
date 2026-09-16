/**
 * The register → bind hand-off, and the trust boundary it hands over with
 * (story 2.05).
 *
 * `/app/bind?agent=<id>` is the seam between two screens owned by two
 * different flows: registration writes the URL, this page reads it. The tests
 * that earn their keep here are the ones that fail when the seam is subtly
 * wrong rather than broken — an id that arrives truncated still looks like a
 * perfectly good id, and the operator would sign a binding for the wrong
 * agent. So the assertions are on the exact value in the field and on the
 * request the page makes off the back of it, never on "the page rendered".
 */
import { test, expect } from "@playwright/test";
import { bindHref } from "../lib/binding-status";
import { mockApi, mockBindAgentId, mockWallet } from "./mocks";

/** Pathname of the current-binding read for a given agent. */
function bindingPath(agentId: string): string {
  return `/api/agents/${encodeURIComponent(agentId)}/binding`;
}

test.describe("bind hand-off", () => {
  test("fills the agent in and reads its binding without a keystroke", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);

    // Armed before navigating: the debounced lookup is supposed to fire off
    // the seeded id on its own, and waiting for it afterwards would hide a
    // page that only looks right because something else typed into it.
    const bindingRead = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname === bindingPath(mockBindAgentId),
    );

    await page.goto(bindHref(mockBindAgentId));

    await expect(page.getByLabel("agent id")).toHaveValue(mockBindAgentId);
    await bindingRead;

    // The panel resolved — from the URL alone, with the form never touched.
    await expect(page.getByText(/no endpoint bound yet/)).toBeVisible();

    // The hand-off carries an agent, never an endpoint: the operator still has
    // to say where the agent lives, and a pre-filled guess would be a claim
    // the registration step was in no position to make.
    await expect(page.getByLabel("endpoint url")).toHaveValue("");
  });

  test("still works when nobody handed an agent over", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/bind");

    // Empty, unremarked-upon, and waiting — exactly the 2.01 starting state.
    await expect(page.getByLabel("agent id")).toHaveValue("");
    await expect(
      page.getByText(/enter an agent id to see what it points at today/),
    ).toBeVisible();
    await expect(page.getByText(/Agent ID is required/)).toBeHidden();

    // And typing one in still drives the same lookup the URL would have.
    await page.getByLabel("agent id").fill(mockBindAgentId);
    await expect(page.getByText(/no endpoint bound yet/)).toBeVisible();
  });

  test("hands over an id with URL-significant characters intact", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);

    // Every character here ends a query value under some parser: the whole
    // string must arrive as one id. Truncating at the `&` is the dangerous
    // failure, because `weather_bot` is a real agent this wallet owns — the
    // page would look correct and bind the wrong thing.
    const hostile = "weather_bot&agent=agt_evil#x y";

    let bindingReads = 0;
    await page.route("**/api/agents/*/binding", (route) => {
      bindingReads += 1;
      return route.fallback();
    });

    await page.goto(bindHref(hostile));

    await expect(page.getByLabel("agent id")).toHaveValue(hostile);
    // Seeded ids are counted touched, so the charset rule answers immediately
    // rather than waiting for a blur that will never come.
    await expect(
      page.getByText(/Letters, digits and underscore only/),
    ).toBeVisible();
    // An id the validator rejects is never spent on a request. Waited out past
    // the field's debounce, or this would only be asserting that 400ms have
    // not yet passed.
    await page.waitForTimeout(800);
    expect(bindingReads).toBe(0);
  });
});
