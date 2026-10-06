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
const { PAGES } = await import("./smoke-deploy.mjs");

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

/** A page as the site serves it when nothing is wrong. */
const page = (title) =>
  Object.freeze({
    html: `<!doctype html><html><head><title>${title}</title></head><body><main id="main"><h1>${title}</h1></main></body></html>`,
  });

/** Every route the smoke checks, answered healthily. */
const HEALTHY = Object.freeze({
  "/api/health": { status: "ok" },
  "/api/agents": [{ id: "agt_1", price: 0.01 }],
  "/api/flow/default": { nodes: [{ id: "n1" }] },
  "/api/metrics/overview": { agents_online: 3, throughput: [1, 2] },
  "/api/stellar/network": NETWORK,
  "/api/tasks": [],
  ...Object.fromEntries(PAGES.map((path) => [path, page(`Orizon ${path}`)])),
});

/**
 * The API checks, the contract parity and the escrow pin, then the pages and
 * the home page's time budget.
 */
const TOTAL = 8 + PAGES.length + 1;

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
 * HTTP status with a small error body instead, and one mapped to `{ html }`
 * answers that page, `delayMs` late when it has one.
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
    if (typeof body?.html === "string") {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body.html);
      }, body.delayMs ?? 0);
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
  assert.match(out, new RegExp(`all ${TOTAL} checks passed`));
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
  assert.match(out, new RegExp(`1/${TOTAL} checks failed`));
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

// The fault a reviewer saw: a page that renders the error boundary instead
// of itself. The site still answers 200, so only the page's own words show
// it — the boundary's copy, or the stable attribute every boundary carries.
for (const [what, html] of [
  [
    "the root boundary's copy",
    `<main id="main"><p>// system fault</p><h1>SYSTEM FAULT</h1></main>`,
  ],
  [
    "the console boundary's copy",
    `<div><p>// subsystem fault</p><h2>SUBSYSTEM FAULT</h2></div>`,
  ],
  [
    "the boundary's attribute, whatever its copy",
    `<main id="main" data-error-boundary="root"><h1>Something went wrong</h1></main>`,
  ],
]) {
  test(`exits 1 when a page renders the error boundary: ${what}`, async () => {
    const { code, out } = await smoke(
      await origin({ ...HEALTHY, "/app/agents": { html } }),
    );
    assert.equal(code, 1, out);
    assert.match(out, /✗ page \/app\/agents → renders the error boundary/);
    assert.match(out, new RegExp(`1/${TOTAL} checks failed`));
  });
}

test("passes a page that only mentions a system fault in its prose", async () => {
  const { code, out } = await smoke(
    await origin({
      ...HEALTHY,
      "/evidence": {
        html: `<main id="main"><p>A reviewer saw a system fault on 2026-10-05.</p></main>`,
      },
    }),
  );
  assert.equal(code, 0, out);
});

test("exits 1 when a page does not answer 200", async () => {
  const { code, out } = await smoke(
    await origin({ ...HEALTHY, "/evidence": 500 }),
  );
  assert.equal(code, 1, out);
  assert.match(out, /✗ page \/evidence → HTTP 500/);
  // The API answered, so the proxy hint is not printed for a page.
  assert.doesNotMatch(out, /NEXT_PUBLIC_API_BASE/);
});

test("opens every public page and console route", () => {
  for (const path of ["/", "/evidence", "/demo", "/guide", "/litepaper"]) {
    assert.ok(PAGES.includes(path), `${path} is a public page`);
  }
  for (const path of [
    "/app",
    "/app/agents",
    "/app/orchestrator",
    "/app/trace",
  ]) {
    assert.ok(PAGES.includes(path), `${path} is a console route`);
  }
});

// A reviewer called the site slow to load. The home page is the page they
// open first, so it is held to a time budget like any other check.
test("exits 1 when the home page takes longer than its budget", async () => {
  const { code, out } = await smoke(
    await origin({ ...HEALTHY, "/": { ...HEALTHY["/"], delayMs: 400 } }),
    { SMOKE_HOME_BUDGET_MS: "150" },
  );
  assert.equal(code, 1, out);
  assert.match(out, /✗ home page budget → \d+ms, over the 150ms budget/);
  assert.match(out, new RegExp(`1/${TOTAL} checks failed`));
});

test("passes a home page inside its budget, and says by how much", async () => {
  const { code, out } = await smoke(await origin(HEALTHY));
  assert.equal(code, 0, out);
  assert.match(out, /✓ home page budget → \d+ms, within the 3000ms budget/);
});

test("exits 1 when the home page never answers, and still reports the budget", async () => {
  const { code, out } = await smoke(await origin({ ...HEALTHY, "/": 503 }));
  assert.equal(code, 1, out);
  assert.match(out, /✗ page \/ → HTTP 503/);
  assert.match(out, /✗ home page budget → no page to time/);
});

// The browser pass. The fault a reviewer saw can happen after the HTML
// arrives, once the page's own code runs; only a browser sees that. It is
// opt-in because it needs Playwright, which smoke.yml does not install.

test("exits 1 when the browser pass is asked for and Playwright is missing", async () => {
  const { code, out } = await smoke(await origin(HEALTHY), {
    SMOKE_BROWSER: "1",
    SMOKE_PLAYWRIGHT_MODULES: "no-such-playwright",
  });
  assert.equal(code, 1, out);
  assert.match(
    out,
    /✗ browser pass → Playwright could not be loaded \(tried no-such-playwright\)/,
  );
});

test("says the browser pass did not run when it was not asked for", async () => {
  const { code, out } = await smoke(await origin(HEALTHY));
  assert.equal(code, 0, out);
  assert.match(out, /browser pass → not requested \(SMOKE_BROWSER=1 runs it\)/);
});

const chromium = await import("playwright")
  .then((m) => m.chromium)
  .catch(() => null);

/**
 * A page whose HTML is healthy and whose script then renders `boundary`. The
 * boundary travels base64-encoded, so the HTML the plain pass reads holds
 * none of its words; only a browser running the script sees it.
 */
const faultsAfterLoad = (boundary) => ({
  html: `<!doctype html><html><body><main id="main"><h1>Agents</h1></main><script>setTimeout(() => { document.body.innerHTML = atob("${Buffer.from(boundary).toString("base64")}"); }, 200);</script></body></html>`,
});

test(
  "the browser pass fails a page that faults only after it loads",
  { skip: chromium ? false : "Playwright is not installed here" },
  async () => {
    const { code, out } = await smoke(
      await origin({
        ...HEALTHY,
        "/app/agents": faultsAfterLoad(
          `<div data-error-boundary="console"><h2>Something broke</h2></div>`,
        ),
        "/demo": faultsAfterLoad(
          `<main><p style="text-transform:uppercase">// system fault</p></main>`,
        ),
      }),
      { SMOKE_BROWSER: "1", SMOKE_SETTLE_MS: "1000" },
    );
    assert.equal(code, 1, out);
    // The HTML is healthy, so only the browser sees either fault.
    assert.match(out, /✓ page \/app\/agents → 200/);
    assert.match(
      out,
      /✗ browser \/app\/agents → renders the error boundary \("data-error-boundary"\)/,
    );
    assert.match(
      out,
      /✗ browser \/demo → renders the error boundary \("\/\/ SYSTEM FAULT"\)/,
    );
    assert.match(out, /✓ browser \/evidence → 200/);
    assert.match(
      out,
      /✓ home page load budget → \d+ms, within the \d+ms budget/,
    );
    assert.match(
      out,
      new RegExp(`2/${TOTAL + PAGES.length + 1} checks failed`),
    );
  },
);
