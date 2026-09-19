#!/usr/bin/env node
/**
 * Canonical address-book parity gate.
 *
 * `lib/contract-addresses.json` holds the contract ids this frontend renders
 * when the backend has not supplied one. They are display-only, so a stale
 * entry is not a wrong reading — it is a live explorer link pointing at a
 * contract the system is not using, which is the kind of wrong that looks
 * right. This script compares every id in that file against the deploy
 * scripts' own address book in the contract repo
 * (Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar) and fails the build on
 * any difference.
 *
 * WHY THIS IS NOT A VITEST TEST. Its input lives in another repository, so it
 * cannot be present on every machine that runs `npm test`. A test that hunts
 * for an absent input has only two endings: it goes red on every laptop
 * without a clone until somebody deletes it, or it skips — and a check that
 * quietly stops checking is the exact failure this gate exists to prevent.
 * Keeping it out of the suite lets it take the only honest third option:
 * ALWAYS FAIL WHEN THE ADDRESS BOOK IS MISSING. It is wired as its own CI job
 * (`.github/workflows/ci.yml`) which checks the contract repo out first, so an
 * absent address book there means the workflow was broken, not that there is
 * nothing to check — and it reports that rather than passing.
 *
 * The comparison is against a checkout, never a fetch: pulling the address
 * book over HTTPS at check time would make a network blip look like drift, and
 * a gate that cries wolf is a gate that gets disabled.
 *
 * Run:  npm run check:addresses
 * Local use, against an existing clone:
 *   ORIZON_CONTRACTS_DIR=/path/to/Orizon-Agents-Smart-Contract-Stellar \
 *     npm run check:addresses
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Where CI checks the contract repo out to (see the `addresses` job). */
const CI_CHECKOUT_DIR = ".canonical-contracts";

/**
 * Which canonical file backs each explorer segment, and which network that
 * file must declare itself to be. The `network` column is not decoration: the
 * two files differ only by name, so pointing both segments at one of them
 * would otherwise compare mainnet ids against mainnet ids and pass while the
 * testnet link rotted.
 */
const MIRRORS = [
  { segment: "public", file: "addresses.mainnet.json", network: "mainnet" },
  { segment: "testnet", file: "addresses.json", network: "testnet" },
];

/** Print and exit non-zero. Every failure path in this script ends here. */
function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function resolveContractsDir() {
  const override = process.env.ORIZON_CONTRACTS_DIR;
  if (override) {
    if (!existsSync(override)) {
      fail(
        `ORIZON_CONTRACTS_DIR is set to ${override}, which does not exist.\n` +
          "Point it at a checkout of Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar.",
      );
    }
    return override;
  }

  const checkout = join(root, CI_CHECKOUT_DIR);
  if (existsSync(checkout)) return checkout;

  // The only "input missing" branch, and it is a failure. Passing here would
  // turn a broken CI checkout into a green build, which is how a gate stops
  // gating without anyone noticing.
  fail(
    "Canonical address book not found — cannot verify the fallback contract ids.\n" +
      `Looked for $ORIZON_CONTRACTS_DIR (unset) and ${CI_CHECKOUT_DIR}/ in the repo root.\n\n` +
      "In CI this means the 'Checkout contract address book' step did not run or\n" +
      "wrote to a different path; restore it in .github/workflows/ci.yml.\n\n" +
      "Locally, either clone the contract repo and point at it:\n" +
      "  git clone https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar\n" +
      `  ORIZON_CONTRACTS_DIR=$PWD/Orizon-Agents-Smart-Contract-Stellar npm run check:addresses\n` +
      `or clone it into ${CI_CHECKOUT_DIR}/, which is git-ignored for this purpose.`,
  );
}

function readJson(path, what) {
  if (!existsSync(path)) {
    fail(`${what} not found at ${path}.`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`${what} at ${path} is not valid JSON: ${err.message}`);
  }
}

const contractsDir = resolveContractsDir();
const frontend = readJson(
  join(root, "lib", "contract-addresses.json"),
  "The frontend address book",
);

const rows = [];
let failed = false;
let compared = 0;

for (const { segment, file, network } of MIRRORS) {
  const canonical = readJson(
    join(contractsDir, file),
    `The canonical ${network} address book`,
  );

  if (canonical.network !== network) {
    fail(
      `${file} declares network ${JSON.stringify(canonical.network)}, expected ` +
        `${JSON.stringify(network)}. The mirror table in this script maps the ` +
        `"${segment}" explorer segment to that file; one of the two is wrong.`,
    );
  }

  for (const [contract, byNetwork] of Object.entries(frontend)) {
    const mine = byNetwork[segment];
    if (mine === undefined) {
      fail(
        `lib/contract-addresses.json is missing the "${segment}" id for ` +
          `${contract}; both explorer segments are required.`,
      );
    }

    const theirs = canonical[contract];
    if (theirs === undefined) {
      fail(
        `${file} has no "${contract}" entry, so the frontend's ${segment} ` +
          "fallback cannot be verified. Either the contract was renamed in the " +
          "deploy scripts or this frontend is mirroring a key that no longer exists.",
      );
    }

    compared += 1;
    const ok = mine === theirs;
    if (!ok) failed = true;
    rows.push({ ok, contract, segment, mine, theirs });
  }
}

// A run that compared nothing is not a passing run. The loops above can only
// reach zero if the frontend address book is empty, which would mean the ids
// moved somewhere unguarded rather than that everything matches.
if (compared === 0) {
  fail(
    "lib/contract-addresses.json declares no contracts, so nothing was verified.",
  );
}

// README.md is the higher-risk surface of the two, and the one people copy ids
// FROM: ten ids across four contracts and both networks, every one rendered as
// a clickable stellar.expert link at the top of the repo. A stale one there has
// the same failure mode as a stale fallback — a live link to the wrong contract
// — over five times the surface.
//
// Matched by shape rather than by position, deliberately. Asserting "the id on
// line 13 is the mainnet escrow" would break every time someone reflows a
// table; asserting "every full-length strkey in this file is a real deployed
// address" survives any amount of prose editing while still catching the one
// thing that matters. Truncated display forms (`CBJCQBA4…R5CNF`) do not match
// the 56-character pattern, so they are ignored rather than flagged.
const README = "README.md";
const readmeText = readFileSync(join(root, README), "utf8");
const deployed = new Set(
  MIRRORS.flatMap(({ file }) =>
    Object.entries(readJson(join(contractsDir, file), `canonical ${file}`))
      .filter(
        ([, value]) =>
          typeof value === "string" && /^C[A-Z2-7]{55}$/.test(value),
      )
      .map(([, value]) => value),
  ),
);
const strays = [...new Set(readmeText.match(/C[A-Z2-7]{55}/g) ?? [])].filter(
  (id) => !deployed.has(id),
);
if (strays.length > 0) {
  failed = true;
  for (const id of strays) {
    rows.push({
      ok: false,
      contract: README,
      segment: "link",
      mine: id,
      theirs: "not a deployed address",
    });
  }
} else {
  compared += 1;
}

for (const { ok, contract, segment, mine, theirs } of rows) {
  console.log(
    `${ok ? "  ok" : "FAIL"}  ${contract} (${segment})  ${ok ? mine : `${mine} != ${theirs}`}`,
  );
}

if (failed) {
  fail(
    "Fallback contract ids have drifted from the deployment address book.\n" +
      "The frontend renders these as explorer links, so a stale one sends operators\n" +
      "to the wrong contract. Copy the canonical values into lib/contract-addresses.json.",
  );
}

console.log(
  `\nAll ${compared} fallback contract ids match the canonical address book.`,
);
