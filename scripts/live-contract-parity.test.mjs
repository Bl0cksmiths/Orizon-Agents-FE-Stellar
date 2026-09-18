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

import { compareLiveContracts } from "./live-contract-parity.mjs";

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
