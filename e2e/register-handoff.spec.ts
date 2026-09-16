/**
 * Registration → binding handoff (story 2.05).
 *
 * Two claims, and the ordering in the first one is the whole point: the page
 * must name BOTH signatures before it asks for either. An operator who meets
 * an unannounced second wallet popup is right to read it as an attack, and
 * copy that only appears on the success card arrives one signature too late —
 * which is exactly where this page used to keep it. So the assertion is made
 * at first render, with nothing clicked and no wallet even connected.
 *
 * The second claim is that the confirmation is a handoff rather than a
 * dead end: the bind link carries the id that was just registered, so the
 * operator never retypes an id they only ever saw on a confirmation screen.
 */
import { test, expect, type Page } from "@playwright/test";
import { TWO_SIGNATURES, bindHref } from "../lib/binding-status";
import {
  mockApi,
  mockBindAgentId,
  mockWallet,
  mockWalletAddress,
} from "./mocks";

/** Stand-ins for the build/submit round trip. Only the shapes matter — the
 *  guards in lib/guards.ts reject anything else, and the hash is rendered. */
const UNSIGNED_XDR = "AAAAAgAAAAAe2eUnsignedRegisterAgentXdr";
const SIGNED_XDR = "AAAAAgAAAAAe2eSignedRegisterAgentXdr";
const TX_HASH =
  "e2e0000000000000000000000000000000000000000000000000000000000001";

/**
 * Freighter's reply to a transaction-signing request.
 *
 * `mockWallet` answers SUBMIT_BLOB (the message signature story 2.01 needed)
 * but not SUBMIT_TRANSACTION, so registration would otherwise stop dead at its
 * "unmocked freighter request" fallback. This supplies the missing half here
 * rather than in e2e/mocks.ts, which two other lanes are building against.
 *
 * It MUST be installed BEFORE `mockWallet`: init scripts run in the order they
 * were added, listeners fire in the order they were registered, and
 * freighter-api resolves on the FIRST matching response. Running first also
 * lets `stopImmediatePropagation` keep `mockWallet`'s fallback from answering
 * this request at all, so only one reply is ever posted.
 */
async function mockWalletTxSigning(page: Page): Promise<void> {
  await page.addInitScript(
    ({ signedXdr, address }: { signedXdr: string; address: string }) => {
      window.addEventListener("message", (event: MessageEvent) => {
        const request = event.data as
          | { source?: string; messageId?: unknown; type?: string }
          | null
          | undefined;
        if (
          !request ||
          request.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST" ||
          request.type !== "SUBMIT_TRANSACTION"
        ) {
          return;
        }
        event.stopImmediatePropagation();
        window.postMessage(
          {
            source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
            messagedId: request.messageId,
            // freighter-api reads `signedTransaction` and re-exposes it as
            // `signedTxXdr`; the wallet kit passes that through untouched.
            signedTransaction: signedXdr,
            signerAddress: address,
          },
          window.location.origin,
        );
      });
    },
    { signedXdr: SIGNED_XDR, address: mockWalletAddress },
  );
}

/** The register build/submit/sync calls, which mockApi's catch-all answers
 *  with `{}`. Registered after it so these win. */
async function mockRegisterTx(page: Page): Promise<void> {
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  await page.route("**/api/stellar/build/register-agent", (route) =>
    route.fulfill(json({ xdr: UNSIGNED_XDR })),
  );
  await page.route("**/api/stellar/submit", (route) =>
    route.fulfill(json({ hash: TX_HASH, status: "SUCCESS" })),
  );
  await page.route("**/api/stellar/agents/sync", (route) =>
    route.fulfill(json({ synced: 1 })),
  );
}

test.describe("registration hands off to binding", () => {
  test("names both signatures at first render, before any wallet prompt", async ({
    page,
  }) => {
    // Deliberately no wallet: nothing has been signed, nothing can have been,
    // and the explanation still has to be on the page.
    await mockApi(page);
    await page.goto("/app/register");

    await expect(page.getByText(TWO_SIGNATURES)).toBeVisible();

    // …and it is the pre-prompt copy, not the success card's — the operator
    // has not registered anything, and cannot until a wallet is connected.
    await expect(page.getByText(/is registered on-chain by/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Register agent/i }),
    ).toBeDisabled();
  });

  test("carries the registered agent id into the bind step", async ({
    page,
  }) => {
    await mockWalletTxSigning(page); // before mockWallet — see the helper
    await mockWallet(page);
    await mockApi(page);
    await mockRegisterTx(page);
    await page.goto("/app/register");

    // The restored session is what makes the page consider a wallet connected.
    // Both the topbar and the page header render a control, hence first().
    await expect(
      page
        .getByRole("button", {
          name: new RegExp(mockWalletAddress.slice(0, 4)),
        })
        .first(),
    ).toBeVisible();

    await page.getByLabel("agent id").fill(mockBindAgentId);
    // Filling the next field blurs the id, which is what runs the on-chain
    // availability check the submit button is gated on.
    await page.getByLabel("display name").fill("Weather Bot");
    await page.getByLabel("price per step").fill("0.02");
    await expect(page.getByText("✓ available")).toBeVisible();

    const submit = page.getByRole("button", { name: /Register agent/i });
    await expect(submit).toBeEnabled();
    // Still on screen with the button live: the last thing read before the
    // first signature is the notice that there will be a second one.
    await expect(page.getByText(TWO_SIGNATURES)).toBeVisible();

    await submit.click();

    await expect(page.getByText(/is registered on-chain by/)).toBeVisible();
    // The one value the confirmation must not drop.
    await expect(
      page.getByRole("link", { name: /Bind an endpoint/i }),
    ).toHaveAttribute("href", bindHref(mockBindAgentId));
  });
});
