/**
 * The post-deploy smoke's exit paths (smoke-deploy.mjs), run end to end.
 *
 * The smoke is the only check that reads production through the deployed
 * proxy, and its whole value is its exit code: smoke.yml goes red on 1 and
 * green on 0. Each case below stands up a local origin that answers the way a
 * deploy can — healthy, a broken proxy, a backend on the wrong contracts, a
 * missing address book — and runs the script against it as the workflow does.
 *
 * node:test, no install, like the parity tests beside it. The contract ids are
 * synthetic strkey shapes.
 *
 * Run: node --test scripts/smoke-deploy.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const SCRIPT = fileURLToPath(new URL("./smoke-deploy.mjs", import.meta.url));

/** @param {string} char */
const id = (char) => `C${char.repeat(55)}`;

const BOOK = Object.freeze({
  network: "testnet",
  admin: `G${"A".repeat(55)}`,
  asset: "native",
  asset_sac: id("S"),
  agent_registry: id("R"),
  payment_escrow: id("E"),
});

const NETWORK = Object.freeze({
  network: "testnet",
  network_passphrase: "Test SDF Network ; September 2015",
  rpc_url: "https://soroban-testnet.stellar.org",
  admin: BOOK.admin,
  asset: "native",
  asset_sac: BOOK.asset_sac,
  contracts: {
    agent_registry: BOOK.agent_registry,
    payment_escrow: BOOK.payment_escrow,
  },
});

/** Every route the smoke checks, answered healthily. */
const HEALTHY = Object.freeze({
  "/api/health": { status: "ok" },
  "/api/agents": [{ id: "agt_1", price: 0.01 }],
  "/api/flow/default": { nodes: [{ id: "n1" }] },
  "/api/metrics/overview": { agents_online: 3, throughput: [1, 2] },
  "/api/stellar/network": NETWORK,
  "/api/tasks": [],
});

const scratch = mkdtempSync(join(tmpdir(), "smoke-deploy-"));
const books = join(scratch, "contracts");
mkdirSync(books);
writeFileSync(join(books, "addresses.json"), JSON.stringify(BOOK));
// The default runs use an unset pin, not the repository's own: the
// committed pin changes when escrow v2 deploys, and these cases are about
// the other checks.
const UNSET_PINS = join(scratch, "pins-unset.json");
writeFileSync(UNSET_PINS, JSON.stringify({ public: null, testnet: null }));

/** @type {import("node:http").Server[]} */
const servers = [];
after(() => {
  for (const server of servers) server.close();
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * A local origin answering `routes`; a path mapped to a number answers that
 * HTTP status with a small error body instead.
 * @param {Record<string, unknown>} routes
 * @returns {Promise<string>} the origin
 */
async function origin(routes) {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const body = Object.hasOwn(routes, path) ? routes[path] : 404;
    if (typeof body === "number") {
      res.writeHead(body, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: "Not Found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Runs the smoke against `target` and resolves with its exit code and output.
 * @param {string} target
 * @param {Record<string, string>} [env]
 */
function smoke(target, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, target], {
      env: {
        ...process.env,
        ORIZON_CONTRACTS_DIR: books,
        ORIZON_ESCROW_PINS: UNSET_PINS,
        ...env,
      },
    });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
  });
}

test("exits 0 when every check passes and the contracts match", async () => {
  const { code, out } = await smoke(await origin(HEALTHY));
  assert.equal(code, 0, out);
  assert.match(out, /all 8 checks passed/);
  assert.match(out, /3 live contract ids match/);
  // An unset pin is pending, never a pass or a failure.
  assert.match(
    out,
    /escrow v2 pin → not pinned for this network yet \(pending\)/,
  );
});

/** Runs the smoke with `pins` as the frontend's escrow v2 pin. */
async function smokeWithPins(pins, routes = HEALTHY) {
  const file = join(
    scratch,
    `pins-${Math.random().toString(36).slice(2)}.json`,
  );
  writeFileSync(file, JSON.stringify(pins));
  return smoke(await origin(routes), { ORIZON_ESCROW_PINS: file });
}

test("passes when production settles through the pinned escrow v2", async () => {
  const { code, out } = await smokeWithPins({
    public: null,
    testnet: BOOK.payment_escrow,
  });
  assert.equal(code, 0, out);
  assert.match(
    out,
    new RegExp(`escrow v2 pin → live escrow is ${BOOK.payment_escrow}`),
  );
});

// The console's copy describes the pinned escrow; production on another one
// is a console whose words about money are wrong.
test("exits 1 when production settles through an escrow other than the pin", async () => {
  const { code, out } = await smokeWithPins({ public: null, testnet: id("V") });
  assert.equal(code, 1, out);
  assert.match(out, /✗ escrow v2 pin/);
  assert.match(
    out,
    new RegExp(
      `payment_escrow: live ${BOOK.payment_escrow} != escrow v2 pin ${id("V")}`,
    ),
  );
});

test("exits 1 without running a check when the origin is unreachable", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  await new Promise((resolve) => server.close(resolve));
  const { code, out } = await smoke(`http://127.0.0.1:${address.port}`);
  assert.equal(code, 1, out);
  assert.match(out, /warmup failed/);
  assert.doesNotMatch(out, /✓|✗/);
});

// The outage the smoke was written for: the site serves, the proxy 404s.
test("exits 1 and names the proxy when a proxied route 404s", async () => {
  const { code, out } = await smoke(
    await origin({ ...HEALTHY, "/api/agents": 404 }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /1\/8 checks failed/);
  assert.match(out, /\/api\/agents → HTTP 404/);
  assert.match(out, /check NEXT_PUBLIC_API_BASE/);
});

test("exits 1 when a route answers with the wrong shape", async () => {
  const { code, out } = await smoke(
    await origin({ ...HEALTHY, "/api/agents": [] }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /\/api\/agents → expected at least one agent/);
});

test("accepts the measured overview as well as the legacy one", async () => {
  const measured = {
    agents: { registered: 49, onchain: 37, seeded: 12 },
    workflows: { settled: 3, series: [] },
  };
  const { code, out } = await smoke(
    await origin({ ...HEALTHY, "/api/metrics/overview": measured }),
  );
  assert.equal(code, 0, out);
});

test("exits 1 when the overview is neither shape", async () => {
  const { code, out } = await smoke(
    await origin({
      ...HEALTHY,
      "/api/metrics/overview": { agents: { registered: "49" } },
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /\/api\/metrics\/overview → expected agents\.registered/);
});

test("exits 1 when production runs a contract the book does not list", async () => {
  const { code, out } = await smoke(
    await origin({
      ...HEALTHY,
      "/api/stellar/network": {
        ...NETWORK,
        contracts: { ...NETWORK.contracts, payment_escrow: id("X") },
      },
    }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /✗ contract parity/);
  assert.match(out, /production and the deploy scripts\s+disagree/);
  // Every proxied request succeeded, so the proxy hint is not printed.
  assert.doesNotMatch(out, /NEXT_PUBLIC_API_BASE/);
});

test("exits 1, never skips, when the address book is missing", async () => {
  const { code, out } = await smoke(await origin(HEALTHY), {
    ORIZON_CONTRACTS_DIR: join(scratch, "absent"),
  });
  assert.equal(code, 1, out);
  assert.match(out, /contract parity → address book unavailable/);
  assert.match(out, /does not exist/);
});

test("exits 1 when the backend reports a network other than the expected", async () => {
  const { code, out } = await smoke(await origin(HEALTHY), {
    SMOKE_EXPECT_NETWORK: "mainnet",
  });
  assert.equal(code, 1, out);
  assert.match(out, /expected network mainnet, got testnet/);
});
