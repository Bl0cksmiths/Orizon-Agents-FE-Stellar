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

// The escrow v2 pin (lib/escrow-address.ts): the PaymentEscrow this build's
// payment copy describes. Null on a network v2 has not reached yet — never a
// guessed id — and reported as pending rather than compared; once set, it is
// held to the id the deploy scripts recorded for v2 on that network like any
// fallback. `make deploy-escrow-v2` records it as `payment_escrow_v2` and
// keeps v1's id under `payment_escrow` as history, so that is the key the
// pin answers to. Both segments must be present, so a typo cannot read as
// "null".
const escrowPins = readJson(
  join(root, "lib", "escrow-address.json"),
  "The escrow v2 pin",
);
const CANONICAL_ESCROW_KEY = "payment_escrow_v2";

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

  const pin = escrowPins[segment];
  if (pin === undefined) {
    fail(
      `lib/escrow-address.json is missing the "${segment}" entry. Set it to ` +
        "null until escrow v2 is deployed on that network, then to its id.",
    );
  }
  if (pin === null) {
    rows.push({
      ok: true,
      pending: true,
      contract: "escrow v2 pin",
      segment,
      mine: "not pinned — escrow v2 is not deployed on this network yet",
      theirs: "",
    });
  } else {
    compared += 1;
    const theirs = canonical[CANONICAL_ESCROW_KEY];
    const ok = pin === theirs;
    if (!ok) failed = true;
    rows.push({
      ok,
      contract: "escrow v2 pin",
      segment,
      mine: String(pin),
      theirs: theirs ?? `no "${CANONICAL_ESCROW_KEY}" in ${file}`,
    });
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
// Every explorer link is checked against ITS OWN network's book, never the
// union of both. The union let a testnet link carry a mainnet id, and let two
// testnet ids trade places, and still pass: each was "some deployed address".
// Where the link's table row names exactly one contract, the id must be that
// contract's; where it names none (a badge, a prose mention) it must at least
// be deployed on the link's network. A full-length id shown as a link's text
// must be the id the link goes to, and a truncated one (`CBJCQBA4…R5CNF`) must
// be a head and tail of it.
//
// Matched per link rather than by line number, so reflowing a table does not
// break the check. A bare full-length strkey outside any link cannot be tied to
// a network, so it is held to the weaker rule: deployed on one of them.
const README = "README.md";
const readmeText = readFileSync(join(root, README), "utf8");

/** Explorer segment → the canonical book for that network. */
const books = Object.fromEntries(
  MIRRORS.map(({ segment, file }) => [
    segment,
    readJson(join(contractsDir, file), `canonical ${file}`),
  ]),
);
const strkeyValues = (book) =>
  Object.values(book).filter(
    (value) => typeof value === "string" && /^C[A-Z2-7]{55}$/.test(value),
  );
/** Which network each deployed id belongs to, to say so when one is misfiled. */
const networkOf = new Map(
  MIRRORS.flatMap(({ segment, network }) =>
    strkeyValues(books[segment]).map((id) => [id, network]),
  ),
);

/** How the README's tables name each contract, against its book key. */
const README_LABELS = [
  ["PaymentEscrow", "payment_escrow"],
  ["AgentRegistry", "agent_registry"],
  ["AttestationRegistry", "attestation_registry"],
  ["ReputationLedger", "reputation_ledger"],
  ["Asset SAC", "asset_sac"],
];

const EXPLORER_LINK =
  /(?:\[`?([^\]`]*)`?\]\()?https:\/\/stellar\.expert\/explorer\/([a-z]+)\/contract\/(C[A-Z2-7]{55})/g;

const readmeLines = readmeText.split("\n");
const linked = new Set();
let readmeChecked = 0;

readmeLines.forEach((line, index) => {
  const where = `${README}:${index + 1}`;
  const labels = README_LABELS.filter(([label]) =>
    new RegExp(`\\b${label}\\b`).test(line),
  );
  for (const match of line.matchAll(EXPLORER_LINK)) {
    const [, text, segment, id] = match;
    linked.add(id);
    readmeChecked += 1;
    const book = books[segment];
    const mirror = MIRRORS.find((m) => m.segment === segment);
    const problems = [];

    if (book === undefined || mirror === undefined) {
      problems.push(`unknown explorer segment "${segment}"`);
    } else {
      const expectedKey = labels.length === 1 ? labels[0][1] : null;
      if (expectedKey !== null) {
        if (book[expectedKey] !== id) {
          problems.push(
            `the ${mirror.network} ${expectedKey} is ${book[expectedKey] ?? "absent"}`,
          );
        }
      } else if (!strkeyValues(book).includes(id)) {
        problems.push(`not a deployed ${mirror.network} contract`);
      }
      const home = networkOf.get(id);
      if (home !== undefined && home !== mirror.network) {
        problems.push(`it is a ${home} id in a ${segment} link`);
      }
    }

    if (text !== undefined && text !== "") {
      const shown = text.trim();
      if (/^C[A-Z2-7]{55}$/.test(shown)) {
        if (shown !== id) problems.push(`the link text shows ${shown}`);
      } else {
        const truncated = /^(C[A-Z2-7]+)…([A-Z2-7]+)$/.exec(shown);
        if (
          truncated !== null &&
          !(id.startsWith(truncated[1]) && id.endsWith(truncated[2]))
        ) {
          problems.push(`the link text shows ${shown}`);
        }
      }
    }

    const ok = problems.length === 0;
    if (!ok) failed = true;
    rows.push({
      ok,
      contract: where,
      segment,
      mine: id,
      theirs: problems.join("; "),
    });
  }
});

for (const id of new Set(readmeText.match(/C[A-Z2-7]{55}/g) ?? [])) {
  if (linked.has(id)) continue;
  readmeChecked += 1;
  const ok = networkOf.has(id);
  if (!ok) failed = true;
  rows.push({
    ok,
    contract: README,
    segment: "bare id",
    mine: id,
    theirs: "not a deployed address",
  });
}

for (const { ok, pending, contract, segment, mine, theirs } of rows) {
  const mark = pending ? "pend" : ok ? "  ok" : "FAIL";
  console.log(
    `${mark}  ${contract} (${segment})  ${ok ? mine : `${mine} != ${theirs}`}`,
  );
}

if (failed) {
  fail(
    "Contract ids have drifted from the deployment address book.\n" +
      "The frontend and README render these as explorer links, so a stale or\n" +
      "misplaced one sends operators to the wrong contract. Copy the canonical\n" +
      "values into lib/contract-addresses.json or README.md, each under its own\n" +
      "network and its own contract.",
  );
}

console.log(
  `\nAll ${compared} fallback contract ids and ${readmeChecked} README ids ` +
    "match the canonical address book for their network.",
);
