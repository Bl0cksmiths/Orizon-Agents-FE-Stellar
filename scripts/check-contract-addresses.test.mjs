/**
 * The address-book drift gate (check-contract-addresses.mjs), run end to end.
 *
 * The script is a CLI whose inputs are files — the frontend's fallback ids,
 * README.md and the contract repo's two address books — so each case builds
 * those files in a scratch root, copies the script beside them, and runs it
 * as CI does. The verdict is the exit code; the output says why.
 *
 * The README cases are the reason this file exists. The gate used to accept
 * any README id that was deployed on EITHER network, so two ids swapped
 * between rows, or a mainnet id behind a testnet link, passed while sending a
 * reader to the wrong contract. Each of those is pinned here.
 *
 * The ids are synthetic: shaped like contract strkeys, obviously not deployed.
 *
 * Run: node --test scripts/check-contract-addresses.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const SCRIPT = fileURLToPath(
  new URL("./check-contract-addresses.mjs", import.meta.url),
);

/** @param {string} tag  base32 characters padded into a strkey shape */
const id = (tag) => `C${tag.padEnd(55, tag.at(-1))}`;

const TESTNET = Object.freeze({
  network: "testnet",
  admin: `G${"A".repeat(55)}`,
  asset: "native",
  asset_sac: id("TS"),
  agent_registry: id("TR"),
  reputation_ledger: id("TL"),
  payment_escrow: id("TE"),
  attestation_registry: id("TA"),
});

const MAINNET = Object.freeze({
  network: "mainnet",
  admin: `G${"A".repeat(55)}`,
  asset: "native",
  asset_sac: id("MS"),
  agent_registry: id("MR"),
  reputation_ledger: id("ML"),
  payment_escrow: id("ME"),
  attestation_registry: id("MA"),
});

const FALLBACKS = {
  reputation_ledger: {
    public: MAINNET.reputation_ledger,
    testnet: TESTNET.reputation_ledger,
  },
};

const link = (segment, contract) =>
  `https://stellar.expert/explorer/${segment}/contract/${contract}`;
const cell = (segment, contract) =>
  `[\`${contract}\`](${link(segment, contract)})`;

/**
 * A README shaped like the real one: a badge with no contract named, a
 * summary row with a truncated id, and one table per network.
 */
function readme({
  testnet = TESTNET,
  mainnet = MAINNET,
  badge = TESTNET.payment_escrow,
} = {}) {
  const short = `${mainnet.payment_escrow.slice(0, 8)}…${mainnet.payment_escrow.slice(-5)}`;
  return [
    `# Orizon [![Testnet](https://img.shields.io/badge/x)](${link("testnet", badge)})`,
    "",
    `| **PaymentEscrow:** [\`${short}\`](${link("public", mainnet.payment_escrow)}) |`,
    "",
    "## Testnet",
    `| **PaymentEscrow** (x402) | ${cell("testnet", testnet.payment_escrow)} |`,
    `| **AgentRegistry** | ${cell("testnet", testnet.agent_registry)} |`,
    `| **AttestationRegistry** | ${cell("testnet", testnet.attestation_registry)} |`,
    `| **ReputationLedger** | ${cell("testnet", testnet.reputation_ledger)} |`,
    `| Asset SAC (native XLM) | ${cell("testnet", testnet.asset_sac)} |`,
    "",
    "## Mainnet",
    `| **PaymentEscrow** (x402) | ${cell("public", mainnet.payment_escrow)} |`,
    `| **AgentRegistry** | ${cell("public", mainnet.agent_registry)} |`,
    `| **AttestationRegistry** | ${cell("public", mainnet.attestation_registry)} |`,
    `| **ReputationLedger** | ${cell("public", mainnet.reputation_ledger)} |`,
    `| Asset SAC (native XLM) | ${cell("public", mainnet.asset_sac)} |`,
    "",
  ].join("\n");
}

const scratch = mkdtempSync(join(tmpdir(), "check-addresses-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
let runs = 0;

/**
 * Lays the inputs out as the script expects them and runs it.
 * @param {{ readmeText?: string, fallbacks?: object, books?: { testnet?: object, mainnet?: object } | null }} [inputs]
 */
function check({
  readmeText = readme(),
  fallbacks = FALLBACKS,
  books = {},
  pins = { public: null, testnet: null },
} = {}) {
  const root = join(scratch, String((runs += 1)));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "lib"), { recursive: true });
  copyFileSync(SCRIPT, join(root, "scripts", "check-contract-addresses.mjs"));
  writeFileSync(join(root, "README.md"), readmeText);
  writeFileSync(
    join(root, "lib", "contract-addresses.json"),
    JSON.stringify(fallbacks),
  );
  writeFileSync(join(root, "lib", "escrow-address.json"), JSON.stringify(pins));
  const contracts = join(root, "contracts");
  if (books !== null) {
    mkdirSync(contracts);
    writeFileSync(
      join(contracts, "addresses.json"),
      JSON.stringify(books.testnet ?? TESTNET),
    );
    writeFileSync(
      join(contracts, "addresses.mainnet.json"),
      JSON.stringify(books.mainnet ?? MAINNET),
    );
  }
  const run = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-contract-addresses.mjs")],
    {
      encoding: "utf8",
      env: { ...process.env, ORIZON_CONTRACTS_DIR: contracts },
    },
  );
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

test("passes when every id sits under its own network and contract", () => {
  const { status, out } = check();
  assert.equal(status, 0, out);
  // Each README link is its own comparison, not one line of the total.
  assert.match(out, /All 2 fallback contract ids and 12 README ids match/);
});

// Passed before the fix: both ids are deployed testnet contracts, so the
// union check found each of them "somewhere" and was satisfied.
test("fails when two testnet ids trade rows", () => {
  const swapped = {
    ...TESTNET,
    payment_escrow: TESTNET.agent_registry,
    agent_registry: TESTNET.payment_escrow,
  };
  const { status, out } = check({ readmeText: readme({ testnet: swapped }) });
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}README\.md:6 \(testnet\).*payment_escrow/);
  assert.match(out, /FAIL {2}README\.md:7 \(testnet\).*agent_registry/);
});

// Passed before the fix: the mainnet id is deployed, just not on testnet.
test("fails when a testnet link carries a mainnet id", () => {
  const crossed = { ...TESTNET, reputation_ledger: MAINNET.reputation_ledger };
  const { status, out } = check({ readmeText: readme({ testnet: crossed }) });
  assert.equal(status, 1, out);
  assert.match(out, /README\.md:9 \(testnet\).*a mainnet id in a testnet link/);
});

// A link that names no contract — the CI badge — can still only point at a
// contract deployed on its own network.
test("fails when an unlabelled link points at the other network", () => {
  const { status, out } = check({
    readmeText: readme({ badge: MAINNET.payment_escrow }),
  });
  assert.equal(status, 1, out);
  assert.match(
    out,
    /README\.md:1 \(testnet\).*not a deployed testnet contract/,
  );
});

test("fails when a link's text shows a different id from its target", () => {
  const text = readme().replace(
    `[\`${TESTNET.agent_registry}\`]`,
    `[\`${TESTNET.payment_escrow}\`]`,
  );
  const { status, out } = check({ readmeText: text });
  assert.equal(status, 1, out);
  assert.match(out, /README\.md:7 \(testnet\).*link text shows/);
});

test("fails when a truncated id does not abbreviate its target", () => {
  const text = readme().replace(
    `${MAINNET.payment_escrow.slice(0, 8)}…`,
    `${MAINNET.agent_registry.slice(0, 8)}…`,
  );
  const { status, out } = check({ readmeText: text });
  assert.equal(status, 1, out);
  assert.match(out, /README\.md:3 \(public\).*link text shows/);
});

test("fails on a README id deployed on neither network", () => {
  const stray = id("ZZ");
  const { status, out } = check({
    readmeText: `${readme()}\nSee ${stray} for details.\n`,
  });
  assert.equal(status, 1, out);
  assert.match(out, new RegExp(`${stray} != not a deployed address`));
});

test("fails when a fallback id drifts from its book", () => {
  const { status, out } = check({
    fallbacks: {
      reputation_ledger: {
        public: MAINNET.reputation_ledger,
        testnet: MAINNET.reputation_ledger,
      },
    },
  });
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}reputation_ledger \(testnet\)/);
});

// ── the escrow v2 pin ─────────────────────────────────────────

const V2 = id("TV");

test("reports an unset escrow v2 pin as pending, not as a pass or a failure", () => {
  const { status, out } = check();
  assert.equal(status, 0, out);
  assert.match(out, /pend {2}escrow v2 pin \(testnet\) {2}not pinned/);
  assert.match(out, /pend {2}escrow v2 pin \(public\)/);
  // Pending is not compared: the total still counts only real comparisons.
  assert.match(out, /All 2 fallback contract ids/);
});

test("passes a pin that matches the v2 id the deploy recorded", () => {
  const { status, out } = check({
    pins: { public: null, testnet: V2 },
    books: { testnet: { ...TESTNET, payment_escrow_v2: V2 } },
  });
  assert.equal(status, 0, out);
  assert.match(out, new RegExp(`  ok {2}escrow v2 pin \\(testnet\\) {2}${V2}`));
  assert.match(out, /All 3 fallback contract ids/);
});

// v1's id stays in the book as history under `payment_escrow`: a pin that
// names it is the build describing custody v1 never took.
test("fails a pin that names v1's escrow instead of the v2 entry", () => {
  const { status, out } = check({
    pins: { public: null, testnet: TESTNET.payment_escrow },
    books: { testnet: { ...TESTNET, payment_escrow_v2: V2 } },
  });
  assert.equal(status, 1, out);
  assert.match(out, /FAIL {2}escrow v2 pin \(testnet\)/);
});

test("fails a pin set before the deploy recorded any v2 id", () => {
  const { status, out } = check({ pins: { public: null, testnet: V2 } });
  assert.equal(status, 1, out);
  assert.match(out, /no "payment_escrow_v2" in addresses\.json/);
});

test("fails when the pin file is missing a network", () => {
  const { status, out } = check({ pins: { testnet: null } });
  assert.equal(status, 1, out);
  assert.match(out, /escrow-address\.json is missing the "public" entry/);
});

test("fails, never skips, when the address books are missing", () => {
  const { status, out } = check({ books: null });
  assert.equal(status, 1, out);
  assert.match(out, /does not exist/);
});

test("fails when a book declares the other network", () => {
  const { status, out } = check({
    books: { testnet: { ...TESTNET, network: "mainnet" } },
  });
  assert.equal(status, 1, out);
  assert.match(out, /addresses\.json declares network "mainnet"/);
});

// The README lists v2 beside v1 once it is deployed. "PaymentEscrow v2" also
// contains "PaymentEscrow", so the row must be held to the v2 key, not to v1's.
const withV2Row = (v2) =>
  readme().replace(
    "## Testnet\n",
    `## Testnet\n| **PaymentEscrow v2** | ${cell("testnet", v2)} |\n`,
  );

test("checks a README escrow v2 row against the v2 entry", () => {
  const { status, out } = check({
    readmeText: withV2Row(V2),
    pins: { public: null, testnet: V2 },
    books: { testnet: { ...TESTNET, payment_escrow_v2: V2 } },
  });
  assert.equal(status, 0, out);
  assert.match(
    out,
    new RegExp(`  ok {2}README\\.md:\\d+ \\(testnet\\) {2}${V2}`),
  );
});

test("fails a README escrow v2 row that links v1's escrow", () => {
  const { status, out } = check({
    readmeText: withV2Row(TESTNET.payment_escrow),
    pins: { public: null, testnet: V2 },
    books: { testnet: { ...TESTNET, payment_escrow_v2: V2 } },
  });
  assert.equal(status, 1, out);
  assert.match(out, /the testnet payment_escrow_v2 is /);
});
