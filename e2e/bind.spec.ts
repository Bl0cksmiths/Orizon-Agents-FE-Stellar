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
});
