/**
 * The rules of the live contract-id parity check (live-contract-parity.mjs).
 *
 * node:test rather than vitest: smoke.yml runs with no `npm ci` so that a
 * broken lockfile can never mask a production outage, and these run in that
 * same job, before the smoke trusts the comparison's verdict. The ids below are
 * synthetic — shaped like contract strkeys so they pass the same filter real
 * ids do, and obviously not deployed contracts.
 *
 * Run: npm run test:parity
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalNetwork,
  compareLiveContracts,
} from "./live-contract-parity.mjs";

/** @param {string} char  one base32 character, repeated into a strkey shape */
const id = (char) => `C${char.repeat(55)}`;

const TESTNET_BOOK = Object.freeze({
  network: "testnet",
  admin: `G${"A".repeat(55)}`,
  asset: "native",
  asset_sac: id("S"),
  agent_registry: id("R"),
  payment_escrow: id("E"),
});

/** A GET /api/stellar/network body serving exactly TESTNET_BOOK's ids. */
function liveBody(overrides = {}) {
  return {
    network: "testnet",
    network_passphrase: "Test SDF Network ; September 2015",
    asset: "native",
    asset_sac: id("S"),
    contracts: { agent_registry: id("R"), payment_escrow: id("E") },
    ...overrides,
  };
}

test("passes when every live contract id matches the address book", () => {
  const { network, rows, problems } = compareLiveContracts(
    liveBody(),
    TESTNET_BOOK,
  );
  assert.equal(network, "testnet");
  assert.deepEqual(problems, []);
  // The admin account and asset code are metadata, not contracts: only the
  // three contract ids are compared, and every one of them is.
  assert.deepEqual(
    rows.map((row) => [row.name, row.ok]),
    [
      ["agent_registry", true],
      ["asset_sac", true],
      ["payment_escrow", true],
    ],
  );
});

test("names the contract, the live id and the canonical id on a mismatch", () => {
  const { problems } = compareLiveContracts(
    liveBody({
      contracts: { agent_registry: id("R"), payment_escrow: id("X") },
    }),
    TESTNET_BOOK,
  );
  assert.deepEqual(problems, [
    `payment_escrow: live ${id("X")} != canonical ${id("E")}`,
  ]);
});

test("maps each reported network to the address book it means", () => {
  assert.equal(canonicalNetwork("testnet"), "testnet");
  assert.equal(canonicalNetwork("mainnet"), "mainnet");
  // The backend's own alias for mainnet.
  assert.equal(canonicalNetwork("public"), "mainnet");
});

test("recognises no other network value", () => {
  for (const reported of [
    "futurenet",
    "Mainnet",
    "",
    "constructor",
    undefined,
    null,
    1,
  ]) {
    assert.equal(canonicalNetwork(reported), null, JSON.stringify(reported));
  }
});

test("fails on a network with no address book instead of skipping it", () => {
  for (const network of ["futurenet", undefined]) {
    const { rows, problems } = compareLiveContracts(
      liveBody({ network }),
      TESTNET_BOOK,
    );
    assert.deepEqual(rows, []);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /has no canonical address book/);
  }
});

test("compares a backend reporting `public` against the mainnet book", () => {
  const { network, problems } = compareLiveContracts(
    liveBody({ network: "public" }),
    { ...TESTNET_BOOK, network: "mainnet" },
  );
  assert.equal(network, "mainnet");
  assert.deepEqual(problems, []);
});

test("fails when the address book declares a different network", () => {
  const { rows, problems } = compareLiveContracts(liveBody(), {
    ...TESTNET_BOOK,
    network: "mainnet",
  });
  assert.deepEqual(rows, []);
  assert.deepEqual(problems, [
    'addresses.json declares network "mainnet", expected "testnet"',
  ]);
});

test("fails when the backend omits a contract the address book lists", () => {
  const { problems } = compareLiveContracts(
    liveBody({ contracts: { payment_escrow: id("E") } }),
    TESTNET_BOOK,
  );
  assert.deepEqual(problems, [
    `agent_registry: live (missing) != canonical ${id("R")}`,
  ]);
});

test("fails when the backend omits the asset SAC", () => {
  const live = liveBody();
  delete live.asset_sac;
  const { problems } = compareLiveContracts(live, TESTNET_BOOK);
  assert.deepEqual(problems, [
    `asset_sac: live (missing) != canonical ${id("S")}`,
  ]);
});

test("fails on an empty id, the backend's unset default", () => {
  const { problems } = compareLiveContracts(
    liveBody({ contracts: { agent_registry: "", payment_escrow: id("E") } }),
    TESTNET_BOOK,
  );
  assert.deepEqual(problems, [
    `agent_registry: live (empty) != canonical ${id("R")}`,
  ]);
});

test("fails when the backend reports a contract the address book lacks", () => {
  const { problems } = compareLiveContracts(
    liveBody({
      contracts: {
        agent_registry: id("R"),
        payment_escrow: id("E"),
        constructor: id("Z"),
      },
    }),
    TESTNET_BOOK,
  );
  assert.deepEqual(problems, [
    `constructor: live ${id("Z")} != canonical (missing)`,
  ]);
});

test("fails when the live response has no contracts map", () => {
  for (const contracts of [undefined, null, [], "none"]) {
    const { problems } = compareLiveContracts(
      liveBody({ contracts }),
      TESTNET_BOOK,
    );
    assert.deepEqual(
      problems,
      ["the live response has no contracts map to compare"],
      JSON.stringify(contracts),
    );
  }
});

test("fails when there is nothing to compare at all", () => {
  const live = liveBody({ contracts: {} });
  delete live.asset_sac;
  const { rows, problems } = compareLiveContracts(live, {
    network: "testnet",
    admin: TESTNET_BOOK.admin,
    asset: "native",
  });
  assert.deepEqual(rows, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nothing was compared/);
});
