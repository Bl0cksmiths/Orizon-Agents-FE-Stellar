import type { Page } from "@playwright/test";
import type { StellarNetworkInfo } from "../lib/types";

/**
 * Plan-card fixtures for the Epic 3 hardening pass, kept apart from
 * e2e/mocks.ts so the shared defaults every other spec leans on stay put.
 *
 * The shared `mockApi` answers `GET /api/stellar/network` with its catch-all
 * `{}`, which the runtime guard rejects — so under it the card has no asset to
 * name, and prints amounts bare. That is the right rendering for an unknown
 * asset and the wrong one to use as evidence that the card names the real
 * unit, hence the network fixture below.
 */

/**
 * What GET /api/stellar/network answers on this sprint's testnet deployment.
 * `asset` is the field that matters: the escrow's SAC wraps the NATIVE asset,
 * so the cap a buyer signs is XLM — never USDC, whatever the plan's
 * `total_usdc` field is called. Contract ids are the deployed testnet ones.
 */
export const mockTestnetNetwork = {
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEPLATFORMXXXXX",
  contracts: {
    agent_registry: "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ",
    reputation_ledger:
      "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
    payment_escrow: "CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI",
    attestation_registry:
      "CBYUZKOET43UXTBXZUJIBBJW5ODGD2J2AZVVXCR3QONGOCAHOXQQHEGK",
  },
  asset: "native",
  asset_sac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} satisfies StellarNetworkInfo;

/**
 * Serves a network payload over the shared mock. Call it AFTER `mockApi`:
 * Playwright tries routes in reverse registration order, so the later, more
 * specific route answers first and the catch-all never sees the request.
 */
export async function mockNetwork(
  page: Page,
  network: StellarNetworkInfo = mockTestnetNetwork,
): Promise<void> {
  await page.route("**/api/stellar/network", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(network),
    }),
  );
}
