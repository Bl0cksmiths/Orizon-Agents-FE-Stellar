/**
 * Live contract-id parity: the ids production actually serves, against the
 * deploy scripts' address book.
 *
 * `check-contract-addresses.mjs` proves the ids THIS repo ships match the
 * contract repo's address book. It cannot see the backend: the network and
 * every contract id the live product uses come from environment variables in
 * the Render dashboard, which override the backend's render.yaml (it runs
 * testnet while that file says mainnet). A redeploy that rotates an id, or a
 * dashboard edit that points one contract at a stale deployment, leaves every
 * repository green while production talks to the wrong contract. The only way
 * to see that is to ask the deployed backend which ids it is using —
 * `GET /api/stellar/network` — and compare them with the address book for the
 * network it says it is on. The post-deploy smoke (`smoke-deploy.mjs`) does.
 */

/**
 * The contract repo's address book for each network. The two files differ
 * only by name, which is why each also declares its network and the
 * comparison below checks that declaration instead of trusting the filename.
 */
export const ADDRESS_BOOKS = Object.freeze({
  testnet: "addresses.json",
  mainnet: "addresses.mainnet.json",
});

/**
 * Every value the backend may report as its network, mapped to the address
 * book it means. `public` is the backend's own alias for mainnet
 * (app/config.py and app/stellar/client.py treat the two alike), so reporting
 * it is not drift. Anything else is: an unrecognised network has no address
 * book to compare against, and passing it would pass an unchecked production.
 * A Map rather than an object literal so an inherited key such as
 * "constructor" cannot resolve to something truthy.
 */
const REPORTED_NETWORKS = new Map([
  ["testnet", "testnet"],
  ["mainnet", "mainnet"],
  ["public", "mainnet"],
]);

/**
 * @param {unknown} reported  the `network` field of GET /api/stellar/network
 * @returns {"testnet" | "mainnet" | null}  null when no address book covers it
 */
export function canonicalNetwork(reported) {
  if (typeof reported !== "string") return null;
  return REPORTED_NETWORKS.get(reported) ?? null;
}
