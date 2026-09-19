/**
 * Replacing an endpoint on an already-bound agent (story 2.05).
 *
 * This path shipped with no coverage at all. `bind/page.tsx` derives
 * `replacing` from a non-null current binding and changes four things on the
 * strength of it — the field label, the confirmation copy, the submit button,
 * and whether the current endpoint is shown — while every existing bind spec
 * drove the FIRST bind, because the default fixture answers
 * `binding_not_found`. So 2.05's "I can rebind later" rested entirely on
 * manual verification.
 *
 * It matters more than a label: an operator moving hosts is the one person
 * who most needs to be sure they are replacing rather than adding, and the
 * one whose mistake silently keeps work flowing to a machine they have
 * decommissioned.
 */
import { test, expect } from "@playwright/test";
import {
  mockApi,
  mockBindAgentId,
  mockExistingBinding,
  mockWallet,
} from "./mocks";

const NEW_ENDPOINT = "https://agent-two.example.com/run";

test.describe("replacing a bound endpoint", () => {
  test("says it is a replacement rather than a first bind", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { binding: mockExistingBinding });
    await page.goto(`/app/bind?agent=${mockBindAgentId}`);

    // The submit control is the load-bearing one: it is the last thing an
    // operator reads before a wallet prompt, and "Bind endpoint" on an agent
    // that already has one invites them to believe they are adding a second.
    await expect(
      page.getByRole("button", { name: /replace endpoint/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^bind endpoint/i }),
    ).toHaveCount(0);

    // And the field says which url it is asking for.
    await expect(page.getByLabel(/replacement endpoint url/i)).toBeVisible();
  });

  test("states what happens to work already routed", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page, { binding: mockExistingBinding });
    await page.goto(`/app/bind?agent=${mockBindAgentId}`);

    // The question an operator moving hosts actually has, answered before
    // they sign rather than discovered afterwards.
    await expect(
      page.getByText(
        /work already routed keeps the endpoint it was routed to/i,
      ),
    ).toBeVisible();
  });

  test("shows the endpoint being replaced, so the wrong agent is obvious", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { binding: mockExistingBinding });
    await page.goto(`/app/bind?agent=${mockBindAgentId}`);

    // An operator with several agents arrives here from a link. Showing the
    // endpoint currently bound is what lets them catch landing on the wrong
    // one before they replace something that was working.
    await expect(
      page.getByText(mockExistingBinding.endpoint_url).first(),
    ).toBeVisible();
  });

  test("replaces the endpoint and sends the new url to the backend", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page, { binding: mockExistingBinding });

    const bindBody = page.waitForRequest(
      (r) =>
        r.method() === "POST" &&
        new URL(r.url()).pathname === `/api/agents/${mockBindAgentId}/bind`,
    );

    await page.goto(`/app/bind?agent=${mockBindAgentId}`);
    await page.getByLabel(/replacement endpoint url/i).fill(NEW_ENDPOINT);
    await page.getByRole("button", { name: /replace endpoint/i }).click();

    // The new endpoint reaches the backend, not the old one. A replace that
    // posted the current value would look like it worked and change nothing.
    const request = await bindBody;
    expect(request.postDataJSON()).toMatchObject({
      endpoint_url: NEW_ENDPOINT,
    });
  });

  test("a first bind is still offered as a first bind", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto(`/app/bind?agent=${mockBindAgentId}`);

    // The negative control. Without it, a component that rendered the replace
    // copy unconditionally would pass every test above.
    await expect(
      page.getByRole("button", { name: /^bind endpoint/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/work already routed keeps the endpoint/i),
    ).toHaveCount(0);
  });
});
