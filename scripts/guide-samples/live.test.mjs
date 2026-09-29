/**
 * The live run against a local fake backend: a pass, a missing key, a wrong
 * type, a mainnet refusal, a cold start, and the requests it must never send.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { liveRefusal } from "./live.mjs";
import { checkGuide } from "./run.mjs";

const GUIDE = fileURLToPath(new URL("./fixtures/guide.md", import.meta.url));
const MINI = fileURLToPath(
  new URL("./fixtures/openapi.mini.json", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const FAST = {
  retryDelaysMs: [5, 5],
  warmupBudgetMs: 3000,
  requestTimeoutMs: 3000,
};

const dir = mkdtempSync(join(tmpdir(), "guide-live-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const TESTNET = {
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: `G${"A".repeat(55)}`,
  dispatch_signer: null,
  asset: "native",
  asset_sac: `C${"S".repeat(55)}`,
  contracts: { agent_registry: `C${"R".repeat(55)}` },
};
const MAINNET = {
  ...TESTNET,
  network: "mainnet",
  network_passphrase: "Public Global Stellar Network ; September 2015",
};

/**
 * A backend that answers the fixture guide's live routes. `answers` overrides a
 * route's body; `failFirst` makes a route answer 503 that many times first.
 */
async function fakeBackend({
  network = TESTNET,
  answers = {},
  failFirst = {},
  statusFor = {},
  down = false,
} = {}) {
  /** @type {{ method: string, path: string, headers: Record<string, any>, body: string }[]} */
  const requests = [];
  const counts = new Map();
  const routes = [
    [
      "GET",
      /^\/api\/health$/,
      () => ({ status: "ok", version: "t", uptime_seconds: 1 }),
    ],
    ["GET", /^\/api\/stellar\/network$/, () => network],
    [
      "GET",
      /^\/api\/stellar\/agent-id-available\/[^/]+$/,
      () => ({ available: true, reason: null, message: null, owner: null }),
    ],
    [
      "GET",
      /^\/api\/agents\/bind\/endpoint-check$/,
      () => ({ allowed: true, rule: null, message: null }),
    ],
    [
      "POST",
      /^\/api\/stellar\/build\/register-agent$/,
      () => ({ xdr: "AAAAAgAAAA==" }),
    ],
    [
      "POST",
      /^\/api\/agents\/([^/]+)\/bind\/challenge$/,
      (m) => ({
        agent_id: m[1],
        nonce: "ab".repeat(16),
        message: `orizon-bind:v1:${m[1]}`,
        expires_at: 1712345678.5,
        ttl_seconds: 300,
      }),
    ],
  ];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      requests.push({
        method: req.method ?? "",
        path: url.pathname,
        query: url.search,
        headers: req.headers,
        body,
      });
      for (const [method, re, answer] of routes) {
        const m = re.exec(url.pathname);
        if (method !== req.method || m === null) continue;
        const key = `${method} ${re}`;
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        if (
          n <= (failFirst[url.pathname] ?? 0) ||
          (down && url.pathname === "/api/health")
        ) {
          res.writeHead(503).end("waking up");
          return;
        }
        const out = answers[url.pathname] ?? answer(m);
        res
          .writeHead(statusFor[url.pathname] ?? 200, {
            "content-type": "application/json",
          })
          .end(JSON.stringify(out));
        return;
      }
      res
        .writeHead(404, { "content-type": "application/json" })
        .end('{"detail":"Not Found"}');
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = /** @type {import("node:net").AddressInfo} */ (
    server.address()
  );
  after(() => server.close());
  return { api: `http://127.0.0.1:${port}/api`, requests };
}

const live = (api, guidePath = GUIDE) =>
  checkGuide({
    guidePath,
    snapshotPath: MINI,
    repoRoot,
    live: true,
    api,
    liveOptions: FAST,
  });
const byId = (report, id) => report.samples.find((s) => s.id === id);
const LIVE_IDS = [
  "get-network",
  "check-id",
  "endpoint-check",
  "build-register",
  "bind-challenge",
];

test("every live sample passes against a backend that answers as documented", async () => {
  const backend = await fakeBackend();
  const report = await live(backend.api);
  assert.deepEqual(report.guideErrors, []);
  for (const id of LIVE_IDS) {
    const s = byId(report, id);
    assert.equal(s.status, "verified", `${id}: ${s.reason}\n${s.diff ?? ""}`);
    assert.deepEqual(
      s.checks.map((c) => c.name),
      ["parse", "contract", "live"],
    );
  }
  assert.equal(report.network, "testnet");
  const network = byId(report, "get-network");
  assert.ok(
    network.extra.includes("$.dispatch_signer: undocumented key (null)"),
    network.extra.join("\n"),
  );
  assert.ok(
    network.extra.includes(
      "$.contracts.agent_registry: undocumented key (string)",
    ),
  );

  const challenge = backend.requests.find((r) =>
    r.path.endsWith("/bind/challenge"),
  );
  assert.match(
    challenge.path,
    /^\/api\/agents\/guide_check_[0-9a-f]{8}\/bind\/challenge$/,
  );
  assert.deepEqual(JSON.parse(challenge.body), {
    endpoint_url: "https://agent.example.com/orizon",
  });
  assert.equal(challenge.headers["content-type"], "application/json");
  const build = backend.requests.find((r) =>
    r.path.endsWith("/register-agent"),
  );
  assert.match(
    JSON.parse(build.body).owner,
    /^G[A-Z2-7]{55}$/,
    "the fixture address, not a secret",
  );
  const check = backend.requests.find((r) =>
    r.path.endsWith("/endpoint-check"),
  );
  assert.equal(check.query, "?url=https%3A%2F%2Fagent.example.com%2Forizon");
});

test("manual samples are never sent, and nothing secret or state-changing is", async () => {
  const backend = await fakeBackend();
  await live(backend.api);
  const paths = backend.requests.map((r) => `${r.method} ${r.path}`);
  assert.ok(!paths.some((p) => /\/bind$|\/binding$/.test(p)), paths.join("\n"));
  for (const r of backend.requests) {
    assert.equal(r.headers["x-api-key"], undefined);
    assert.doesNotMatch(r.body + r.path + r.query, /S[A-Z2-7]{55}/);
    assert.ok(
      r.method === "GET" || /\/build\/|\/challenge$/.test(r.path),
      `${r.method} ${r.path}`,
    );
  }
});

test("a documented key missing from the real response fails with a diff", async () => {
  const backend = await fakeBackend({
    answers: {
      "/api/stellar/network": (({ asset_sac: _a, ...rest }) => rest)(TESTNET),
    },
  });
  const s = byId(await live(backend.api), "get-network");
  assert.equal(s.status, "failed");
  assert.match(
    s.diff,
    /^- \$\.asset_sac: documented key is missing from the response$/m,
  );
});

test("a value of the wrong type fails, even where the guide wrote a wildcard", async () => {
  // The agent id is fresh per run, so answer every challenge path with the bad body.
  const backend = await fakeBackend({
    answers: new Proxy(
      {
        "/api/agents/bind/endpoint-check": {
          allowed: "yes",
          rule: null,
          message: null,
        },
      },
      {
        get: (target, key) =>
          typeof key === "string" && key.endsWith("/bind/challenge")
            ? {
                agent_id: "a",
                nonce: "n",
                message: "m",
                expires_at: "1712345678",
                ttl_seconds: 300,
              }
            : target[key],
      },
    ),
  });
  const report = await live(backend.api);
  const challenge = byId(report, "bind-challenge");
  assert.equal(challenge.status, "failed");
  assert.match(
    challenge.diff,
    /! \$\.expires_at: documented <unix seconds> \(number \| integer\), got string "1712345678"/,
  );
  const check = byId(report, "endpoint-check");
  assert.equal(check.status, "failed");
  assert.match(
    check.diff,
    /! \$\.allowed: documented boolean true, got string "yes"/,
  );
});

test("a backend on mainnet is refused before any sample runs", async () => {
  const backend = await fakeBackend({ network: MAINNET });
  const report = await live(backend.api);
  assert.ok(
    report.guideErrors.some((e) => e.startsWith("refusing to run:")),
    report.guideErrors.join("\n"),
  );
  for (const id of LIVE_IDS) {
    const s = byId(report, id);
    assert.equal(s.status, "failed");
    assert.match(s.reason, /not executed: refusing to run/);
  }
  assert.deepEqual([...new Set(backend.requests.map((r) => r.path))].sort(), [
    "/api/health",
    "/api/stellar/network",
  ]);
});

test("a cold start is absorbed: the warm-up waits and a 503 is retried", async () => {
  const backend = await fakeBackend({
    failFirst: { "/api/health": 2, "/api/stellar/agent-id-available": 0 },
  });
  const report = await live(backend.api);
  assert.deepEqual(report.guideErrors, []);
  assert.equal(report.counts.failed, 0);
  const flaky = await fakeBackend({
    failFirst: { "/api/agents/bind/endpoint-check": 1 },
  });
  const s = byId(await live(flaky.api), "endpoint-check");
  assert.equal(s.status, "verified", s.reason);
  assert.match(
    s.checks.find((c) => c.name === "live").detail,
    /after 2 attempts/,
  );
});

test("a live sample that cannot run as written, or would leak or change state, fails", async () => {
  const backend = await fakeBackend();
  const guide = join(dir, "refusals.md");
  const sample = (id, curl, response = "{}") =>
    `\`\`\`bash id="${id}" verify="live"\n${curl}\n\`\`\`\n\n\`\`\`json id="${id}-response"\n${response}\n\`\`\`\n`;
  writeFileSync(
    guide,
    [
      "---\ntitle: T\ndescription: D\nversion: 1.0.0\napi_verified_against: aaaaaaa\nnetwork: testnet\nupdated: 2026-09-28\nstatus: draft\n---\n",
      '```bash id="set-api" verify="manual"\nexport ORIZON_API=https://orizons.xyz/api\n```\n',
      sample(
        "unset",
        'curl -s "$ORIZON_API/stellar/agent-id-available/$NOT_A_FIXTURE"',
        '{"available": true}',
      ),
      sample(
        "key",
        'curl -s "$ORIZON_API/agents/a/binding" -H "X-API-Key: k"',
        '{"agent_id": "a", "endpoint_url": "u", "owner": "o", "bound_at": 1, "replaced": false}',
      ),
      sample(
        "bind",
        `curl -s "$ORIZON_API/agents/a/bind" -H "Content-Type: application/json" -d '{"endpoint_url": "https://agent.example.com/x", "signature": "c2ln"}'`,
        '{"agent_id": "a", "endpoint_url": "u", "owner": "o", "bound_at": 1, "replaced": false}',
      ),
    ].join("\n"),
  );
  const report = await live(backend.api, guide);
  assert.deepEqual(report.guideErrors, []);
  assert.match(
    byId(report, "unset").reason,
    /cannot run as written: \$NOT_A_FIXTURE is not set/,
  );
  assert.match(
    byId(report, "key").reason,
    /refused to run live: it sends X-API-Key, a credential/,
  );
  assert.match(
    byId(report, "bind").reason,
    /refused to run live: POST \/api\/agents\/a\/bind changes state/,
  );
  assert.ok(
    !backend.requests.some((r) => r.path.includes("/agents/a/")),
    "refused samples never reach the backend",
  );
});

test("liveRefusal: GET, build, availability and challenge only; never a secret", () => {
  const r = (method, url, { headers = [], body = null } = {}) => ({
    method,
    url,
    headers,
    body,
  });
  const path = (url) => new URL(url).pathname;
  const allowed = [
    r("GET", "https://x/api/stellar/network"),
    r("POST", "https://x/api/stellar/build/register-agent", { body: "{}" }),
    r("POST", "https://x/api/agents/a/bind/challenge"),
    r("POST", "https://x/api/disputes/read-challenge"),
  ];
  for (const req of allowed)
    assert.equal(liveRefusal(req, [], path(req.url)), null, req.url);
  const refused = [
    [r("POST", "https://x/api/stellar/submit"), [], /changes state/],
    [r("DELETE", "https://x/api/agents/a/bind"), [], /changes state/],
    [r("POST", "https://x/api/stellar/agents/sync"), [], /changes state/],
    [
      r("GET", "https://x/api/tasks/t", { headers: [["X-Task-Token", "t"]] }),
      [],
      /X-Task-Token, a credential/,
    ],
    [r("GET", "https://x/api/tasks/t?token=abc"), [], /query parameter token/],
    [
      r("GET", "https://x/api/a"),
      ["ORIZON_OWNER_SECRET"],
      /\$ORIZON_OWNER_SECRET, a secret/,
    ],
    [r("GET", "https://x/api/a"), ["MY_API_KEY"], /\$MY_API_KEY, a secret/],
    [
      r("POST", "https://x/api/stellar/build/x", {
        body: `{"s": "S${"A".repeat(55)}"}`,
      }),
      [],
      /Stellar secret seed/,
    ],
  ];
  for (const [req, vars, pattern] of refused)
    assert.match(liveRefusal(req, vars, path(req.url)) ?? "", pattern, req.url);
});

test("a backend that never wakes is reported, and no sample runs", async () => {
  const backend = await fakeBackend({ down: true });
  const report = await checkGuide({
    guidePath: GUIDE,
    snapshotPath: MINI,
    repoRoot,
    live: true,
    api: backend.api,
    liveOptions: { ...FAST, warmupBudgetMs: 300 },
  });
  assert.ok(
    report.guideErrors.some((e) =>
      /\/health never answered 2xx within 300 ms/.test(e),
    ),
    report.guideErrors.join("\n"),
  );
  assert.ok(
    !backend.requests.some((r) => r.path !== "/api/health"),
    "nothing but the warm-up was sent",
  );
});

test("the documented status must match: the right body with the wrong status fails", async () => {
  const backend = await fakeBackend({
    statusFor: { "/api/agents/bind/endpoint-check": 201 },
  });
  const s = byId(await live(backend.api), "endpoint-check");
  assert.equal(s.status, "failed");
  assert.match(s.diff, /^! status: documented 200, got 201$/m);
});
