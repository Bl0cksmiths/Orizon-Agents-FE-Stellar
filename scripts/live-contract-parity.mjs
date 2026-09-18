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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * A Soroban contract strkey. Tells the address book's contract ids apart from
 * its metadata (`network`, the `admin` account, the `asset` code) by shape —
 * the same rule check-contract-addresses.mjs uses for "a deployed address" —
 * so a metadata field added to the address book later is not mistaken for a
 * contract the backend failed to report.
 */
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

/**
 * Both id sets are Maps for the same reason as REPORTED_NETWORKS: a name read
 * off the wire is looked up on the other side, and a plain object would hand
 * back an inherited property for a name like "constructor".
 *
 * @param {Record<string, unknown>} book
 * @returns {Map<string, string>}
 */
function canonicalContractIds(book) {
  return new Map(
    Object.entries(book).filter(
      ([, value]) => typeof value === "string" && CONTRACT_ID.test(value),
    ),
  );
}

/**
 * Every contract id the live backend reports, under its address-book name.
 * The `contracts` map carries the Orizon contracts; the native asset's SAC is
 * a contract id too, reported beside it as `asset_sac` — the same name the
 * address book uses. Null when the response has no contracts map at all.
 *
 * @param {any} live
 * @returns {Map<string, unknown> | null}
 */
function liveContractIds(live) {
  const contracts = live?.contracts;
  if (
    contracts === null ||
    typeof contracts !== "object" ||
    Array.isArray(contracts)
  ) {
    return null;
  }
  const ids = new Map(Object.entries(contracts));
  if (Object.hasOwn(live, "asset_sac")) ids.set("asset_sac", live.asset_sac);
  return ids;
}

/** @param {unknown} id */
function show(id) {
  if (id === undefined) return "(missing)";
  if (id === "") return "(empty)";
  return typeof id === "string" ? id : JSON.stringify(id);
}

/**
 * @typedef {{ name: string, live: unknown, canonical: string | undefined, ok: boolean }} ParityRow
 * @typedef {{ network: "testnet" | "mainnet" | null, rows: ParityRow[], problems: string[] }} Parity
 */

/**
 * Compare the live backend's contract ids with the canonical address book for
 * the network it reports. Pure — both arguments are parsed JSON — and the
 * verdict is `problems.length === 0`.
 *
 * Every name on EITHER side must be present on both, and equal. A contract the
 * address book lists but the backend does not report is one production is not
 * wired to; one the backend reports but the book does not know is a deployment
 * nobody recorded; an empty id is the backend's unset default. All of them
 * fail: a comparison that skips what it cannot match is how a parity check
 * ends up comparing nothing and passing.
 *
 * @param {any} live  body of GET /api/stellar/network
 * @param {any} book  the parsed address book for `canonicalNetwork(live.network)`
 * @returns {Parity}
 */
export function compareLiveContracts(live, book) {
  const network = canonicalNetwork(live?.network);
  if (network === null) {
    return {
      network,
      rows: [],
      problems: [
        `the live backend reports network ${JSON.stringify(live?.network)}, ` +
          "which has no canonical address book (expected one of " +
          `${[...REPORTED_NETWORKS.keys()].join(", ")})`,
      ],
    };
  }

  // The caller picks the file by name; the file's own declaration is what
  // proves it is the right one. Testnet ids compared against a mainnet book
  // would flag every contract as drifted and bury the actual cause.
  if (book?.network !== network) {
    return {
      network,
      rows: [],
      problems: [
        `${ADDRESS_BOOKS[network]} declares network ` +
          `${JSON.stringify(book?.network)}, expected "${network}"`,
      ],
    };
  }

  const liveIds = liveContractIds(live);
  if (liveIds === null) {
    return {
      network,
      rows: [],
      problems: ["the live response has no contracts map to compare"],
    };
  }

  const canonicalIds = canonicalContractIds(book);
  const names = [
    ...new Set([...canonicalIds.keys(), ...liveIds.keys()]),
  ].sort();
  if (names.length === 0) {
    return {
      network,
      rows: [],
      problems: [
        "neither the live backend nor the address book lists a contract id, " +
          "so nothing was compared",
      ],
    };
  }

  const rows = names.map((name) => {
    const canonical = canonicalIds.get(name);
    const liveId = liveIds.get(name);
    // `canonical` is a validated strkey whenever it is defined, so equality
    // alone rules out a missing, empty or non-string live id.
    const ok = canonical !== undefined && liveId === canonical;
    return { name, live: liveId, canonical, ok };
  });

  return {
    network,
    rows,
    problems: rows
      .filter((row) => !row.ok)
      .map(
        (row) =>
          `${row.name}: live ${show(row.live)} != canonical ${show(row.canonical)}`,
      ),
  };
}

/** Where the workflows check the contract repo out to (ci.yml, smoke.yml). */
export const CHECKOUT_DIR = ".canonical-contracts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Locate the contract repo checkout the way check-contract-addresses.mjs does:
 * $ORIZON_CONTRACTS_DIR, else .canonical-contracts/ in the repo root.
 *
 * Throws when neither exists, on every machine. smoke.yml checks the repo out
 * before the smoke runs, so a missing address book there means the workflow
 * broke, not that there is nothing to compare — and a parity check that
 * quietly skips is the defect it exists to close. Throwing instead of exiting
 * lets the smoke still report its proxy checks beside this failure.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [root]  the repository root that holds .canonical-contracts/
 * @returns {string}
 */
export function resolveContractsDir(env = process.env, root = repoRoot) {
  const override = env.ORIZON_CONTRACTS_DIR;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(
        `ORIZON_CONTRACTS_DIR is set to ${override}, which does not exist.\n` +
          "Point it at a checkout of Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar.",
      );
    }
    return override;
  }

  const checkout = join(root, CHECKOUT_DIR);
  if (existsSync(checkout)) return checkout;

  throw new Error(
    "Canonical address book not found — cannot verify the live contract ids.\n" +
      `Looked for $ORIZON_CONTRACTS_DIR (unset) and ${CHECKOUT_DIR}/ in the repo root.\n\n` +
      "In CI this means the 'Checkout contract address book' step did not run or\n" +
      "wrote to a different path; restore it in .github/workflows/smoke.yml.\n\n" +
      "Locally, point at a clone of the contract repo:\n" +
      "  ORIZON_CONTRACTS_DIR=/path/to/Orizon-Agents-Smart-Contract-Stellar npm run smoke\n" +
      `or clone it into ${CHECKOUT_DIR}/, which is git-ignored for this purpose.`,
  );
}

/**
 * Read one network's address book out of a contract repo checkout.
 *
 * @param {"testnet" | "mainnet"} network  from canonicalNetwork()
 * @param {string} dir  from resolveContractsDir()
 * @returns {{ path: string, book: unknown }}
 */
export function loadAddressBook(network, dir) {
  if (!Object.hasOwn(ADDRESS_BOOKS, network)) {
    throw new Error(`No address book is kept for network ${network}.`);
  }
  const path = join(dir, ADDRESS_BOOKS[network]);
  if (!existsSync(path)) {
    throw new Error(`The canonical ${network} address book is not at ${path}.`);
  }
  const text = readFileSync(path, "utf8");
  try {
    return { path, book: JSON.parse(text) };
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON: ${err instanceof Error ? err.message : err}`,
    );
  }
}
