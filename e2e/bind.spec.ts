/**
 * Agent endpoint binding (story 2.01).
 *
 * The happy path is walked end to end — preflight, challenge, a real wallet
 * signature, the bind itself — against `mockWallet`'s stand-in for the
 * Freighter content script, so the one step that usually stops an e2e suite
 * dead (the signing popup) is exercised rather than skipped.
 *
 * The assertion that earns its keep is on the request body: the signature the
 * wallet produced must reach POST /bind byte for byte. The backend accepts
 * both raw-bytes and SEP-53 signatures deliberately, so a client that
 * "normalizes" one turns a valid signature into a rejected one, and nothing in
 * the UI would say why.
 */
import { test, expect } from "@playwright/test";
import {
  mockApi,
  mockBindAgentId,
  mockSignature,
  mockWallet,
  mockWalletAddress,
} from "./mocks";

const ENDPOINT = "https://agent.example.com/run";

test.describe("agent endpoint binding", () => {
  test("binds an endpoint: preflight, challenge, wallet signature, bound", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/app/bind");

    // The restored session is what makes the console consider a wallet
    // connected; without it the submit stays disabled. Both the topbar and the
    // page header render a wallet control, hence first().
    await expect(
      page
        .getByRole("button", {
          name: new RegExp(mockWalletAddress.slice(0, 4)),
        })
        .first(),
    ).toBeVisible();

    await page.getByLabel("agent id").fill(mockBindAgentId);
    await expect(page.getByText(/no endpoint bound yet/)).toBeVisible();

    await page.getByLabel("endpoint url").fill(ENDPOINT);
    await expect(page.getByText("✓ endpoint allowed")).toBeVisible();

    const bindRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname ===
          `/api/agents/${mockBindAgentId}/bind`,
    );
    await page.getByRole("button", { name: /Bind endpoint/i }).click();

    const body = (await bindRequest).postDataJSON() as {
      endpoint_url: string;
      signature: string;
    };
    expect(body.endpoint_url).toBe(ENDPOINT);
    expect(body.signature).toBe(mockSignature);

    await expect(page.getByText("✓ endpoint bound")).toBeVisible();
    await expect(page.getByText(ENDPOINT).first()).toBeVisible();
  });

  test("shows the registry's own reason for a refused endpoint, inline", async ({
    page,
  }) => {
    await mockWallet(page);
    await mockApi(page);
    // Registered last, so it wins over mockApi's allow-everything preflight.
    await page.route("**/api/agents/bind/endpoint-check*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allowed: false,
          rule: "no_private_hosts",
          message: "private addresses cannot be bound",
        }),
      }),
    );
    await page.goto("/app/bind");

    await page.getByLabel("agent id").fill(mockBindAgentId);
    await page.getByLabel("endpoint url").fill("http://10.0.0.4:9000/run");

    // The whole point of the preflight: a reason under the field, naming the
    // rule, before a wallet popup is ever spent on it.
    await expect(
      page.getByText(/private addresses cannot be bound/),
    ).toBeVisible();
    await expect(page.getByText(/no_private_hosts/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Bind endpoint/i }),
    ).toBeDisabled();
  });

  // The production incident's other face: the database down, and the
  // current-binding read answered 500. The backend now says 503
  // `store_unavailable` with a Retry-After; the panel says so in words and
  // asks again on its own, after the wait it was given.
  test("a binding read that meets a store outage says so, waits, and asks again", async ({
    page,
  }) => {
    await page.clock.install({ time: Date.now() });
    await mockWallet(page);
    await mockApi(page);
    let failing = true;
    let reads = 0;
    await page.route(
      (url) => url.pathname === `/api/agents/${mockBindAgentId}/binding`,
      async (route) => {
        reads += 1;
        if (!failing) return route.fallback();
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "Retry-After": "30" },
          body: JSON.stringify({
            detail: "store_unavailable",
            error: {
              code: "store_unavailable",
              message: "store unavailable",
              request_id: "e2e0000000000503",
            },
          }),
        });
      },
    );
    await page.goto("/app/bind");
    await page.getByLabel("agent id").fill(mockBindAgentId);

    const note = page.getByRole("alert").filter({
      hasText: "binding records are temporarily unreachable",
    });
    await expect(note).toHaveText(
      /^⚠ The endpoint binding records are temporarily unreachable, so the current binding can't be read yet\./,
    );
    await expect(note).not.toContainText("503");
    await expect(note).not.toContainText("GET /agents");
    await expect(page.getByText("Retrying automatically.")).toBeVisible();
    await page.waitForTimeout(1_000);
    const asked = reads;

    // Not before the thirty seconds the backend asked for — the page's clock
    // runs on in real time too, so this stops well short of them…
    await page.clock.runFor(20_000);
    await page.waitForTimeout(1_000);
    expect(reads).toBe(asked);

    // …and then once, which finds the records back.
    failing = false;
    await page.clock.runFor(12_000);
    await expect(page.getByText(/no endpoint bound yet/)).toBeVisible();
    expect(reads).toBe(asked + 1);
    await expect(note).toHaveCount(0);
  });
});
