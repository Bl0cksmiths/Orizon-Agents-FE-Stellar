/**
 * The static contract check: each curl against the OpenAPI snapshot.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkHttpSample, findOperation } from "./contract.mjs";
import { parseGuide } from "./parse.mjs";
import { createValidator } from "./schema.mjs";
import { marker } from "./shell.mjs";

const MINI = JSON.parse(
  readFileSync(
    new URL("./fixtures/openapi.mini.json", import.meta.url),
    "utf8",
  ),
);
const validator = createValidator(MINI);
const API = "https://orizons.xyz/api";
const env = { ORIZON_API: API };

/** Check one curl + documented response as the guide would hold them. */
function check(curl, response = "{}", { status, extraEnv = {} } = {}) {
  const text = [
    "---\ntitle: T\ndescription: D\nversion: 1.0.0\napi_verified_against: aaaaaaa\nnetwork: testnet\nupdated: 2026-09-28\nstatus: draft\n---",
    '```bash id="set-api" verify="manual"\nexport ORIZON_API=https://orizons.xyz/api\n```',
    `\`\`\`bash id="s" verify="manual"\n${curl}\n\`\`\``,
    `\`\`\`json id="s-response"${status ? ` status="${status}"` : ""}\n${response}\n\`\`\``,
  ].join("\n\n");
  const parsed = parseGuide(text);
  assert.deepEqual(parsed.errors, []);
  const sample = parsed.samples.find((s) => s.id === "s");
  return checkHttpSample({
    sample,
    doc: MINI,
    validator,
    env: { ...env, ...extraEnv },
    apiBase: parsed.apiBase,
  });
}

const TEMPLATES = {
  paths: {
    "/api/items/{item_id}": { get: { responses: {} } },
    "/api/items/new": { get: { responses: {} } },
    "/api/items/{item_id}/tags": { post: { responses: {} } },
  },
};

test("path templates: a parameter matches any segment, a literal only itself, the most literal wins", () => {
  assert.equal(
    findOperation(TEMPLATES, "GET", "/api/items/abc").template,
    "/api/items/{item_id}",
  );
  assert.deepEqual(findOperation(TEMPLATES, "GET", "/api/items/abc").params, {
    item_id: "abc",
  });
  assert.equal(
    findOperation(TEMPLATES, "GET", "/api/items/new").template,
    "/api/items/new",
  );
  assert.equal(
    findOperation(TEMPLATES, "GET", `/api/items/${marker("ID")}`).template,
    "/api/items/{item_id}",
  );
  assert.equal(
    findOperation(TEMPLATES, "POST", "/api/items/abc/tags").template,
    "/api/items/{item_id}/tags",
  );
  assert.match(
    findOperation(TEMPLATES, "GET", "/api/items").error,
    /GET \/api\/items is not an operation/,
  );
  assert.match(
    findOperation(TEMPLATES, "GET", "/api/items/").error,
    /not an operation/,
    "an empty segment is no parameter",
  );
  assert.match(
    findOperation(TEMPLATES, "DELETE", "/api/items/abc").error,
    /DELETE \/api\/items\/abc is not an operation in the OpenAPI snapshot \(the contract has GET \/api\/items\/\{item_id\}\)/,
  );
});

test("a correct sample passes: method, templated path, headers, body and response", () => {
  const ok = check(
    `curl -s -X POST "$ORIZON_API/agents/$AGENT_ID/bind/challenge" -H "Content-Type: application/json" -d '{"endpoint_url": "https://agent.example.com/orizon"}'`,
    '{"agent_id": "<id>", "nonce": "<n>", "message": "<m>", "expires_at": "<unix seconds>", "ttl_seconds": 300}',
  );
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.operation, "POST /api/agents/{agent_id}/bind/challenge");
  assert.deepEqual([...ok.wildcards.get("$.expires_at")].sort(), [
    "integer",
    "number",
  ]);
});

test("a path or method that is not in the contract fails", () => {
  assert.match(
    check(`curl -s "$ORIZON_API/agents/x/nope"`).problems[0],
    /not an operation/,
  );
  assert.match(
    check(`curl -s -X DELETE "$ORIZON_API/stellar/network"`).problems[0],
    /the contract has GET \/api\/stellar\/network/,
  );
  assert.match(
    check(`curl -s "https://elsewhere.example/api/stellar/network"`)
      .problems[0],
    /is not under \$ORIZON_API/,
  );
});

test("path and query parameters: declared, required, and valid for their schema", () => {
  const undeclared = check(
    `curl -s "$ORIZON_API/stellar/network?verbose=1"`,
    "{}",
  ).problems;
  assert.ok(
    undeclared.includes(
      "query parameter verbose is not declared by GET /api/stellar/network",
    ),
    undeclared.join("\n"),
  );
  const missing = check(
    `curl -s "$ORIZON_API/agents/bind/endpoint-check"`,
    '{"allowed": true}',
  ).problems;
  assert.ok(
    missing.includes(
      "GET /api/agents/bind/endpoint-check requires query parameter url",
    ),
    missing.join("\n"),
  );
  const good = check(
    `curl -sG "$ORIZON_API/agents/bind/endpoint-check" --data-urlencode "url=https://a.example/x"`,
    '{"allowed": true}',
  );
  assert.deepEqual(good.problems, []);
});

test("headers: X-API-Key / X-Task-Token must be declared by the operation", () => {
  const declared = check(
    `curl -s "$ORIZON_API/agents/a/binding" -H "X-API-Key: $KEY"`,
    '{"agent_id": "a", "endpoint_url": "u", "owner": "o", "bound_at": 1, "replaced": false}',
  );
  assert.deepEqual(declared.problems, []);
  const task = check(
    `curl -s "$ORIZON_API/tasks/t1" -H "X-Task-Token: $TOKEN"`,
    '{"id": "<id>"}',
  );
  assert.ok(
    !task.problems.some((p) => p.includes("X-Task-Token")),
    task.problems.join("\n"),
  );
  const undeclared = check(
    `curl -s "$ORIZON_API/stellar/network" -H "X-Task-Token: t"`,
    "{}",
  ).problems;
  assert.ok(
    undeclared.includes(
      "header X-Task-Token is not declared by GET /api/stellar/network",
    ),
    undeclared.join("\n"),
  );
  assert.deepEqual(
    check(
      `curl -s "$ORIZON_API/stellar/network" -H "Accept: application/json"`,
      "{}",
    ).problems.filter((p) => p.startsWith("header")),
    [],
  );
});

test("request bodies: sent as JSON, and valid against the request schema", () => {
  const formEncoded = check(
    `curl -s "$ORIZON_API/agents/a/bind/challenge" -d '{"endpoint_url": "https://agent.example.com/x"}'`,
    "{}",
  ).problems;
  assert.ok(
    formEncoded.some((p) =>
      p.startsWith("the body is sent as application/x-www-form-urlencoded"),
    ),
    formEncoded.join("\n"),
  );
  const invalid = check(
    `curl -s "$ORIZON_API/stellar/build/register-agent" -H "Content-Type: application/json" -d '{"owner": "GBAD", "agent_id": "a", "name": "n", "price_usdc": 0}'`,
    '{"xdr": "<xdr>"}',
  ).problems;
  assert.ok(
    invalid.includes(
      'request body.owner: "GBAD" does not match ^G[A-Z2-7]{55}$',
    ),
    invalid.join("\n"),
  );
  assert.ok(
    invalid.includes("request body.price_usdc: 0 must be greater than 0"),
    invalid.join("\n"),
  );
  const notJson = check(
    `curl -s "$ORIZON_API/agents/a/bind/challenge" -H "Content-Type: application/json" -d '{endpoint_url: 1}'`,
    "{}",
  ).problems;
  assert.ok(
    notJson.some((p) => p.startsWith("the request body is not valid JSON")),
    notJson.join("\n"),
  );
  const noBody = check(
    `curl -s -X POST "$ORIZON_API/agents/a/bind/challenge"`,
    "{}",
  ).problems;
  assert.ok(
    noBody.includes(
      "POST /api/agents/{agent_id}/bind/challenge requires a request body",
    ),
    noBody.join("\n"),
  );
  const unexpected = check(
    `curl -s "$ORIZON_API/stellar/network" -G -d x=1`,
    "{}",
  );
  assert.ok(
    !unexpected.problems.some((p) => p.includes("takes no request body")),
    "-G moves data to the query",
  );
});

test("shell variables in a body are wildcards of the declared type", () => {
  const ok = check(
    `curl -s "$ORIZON_API/stellar/build/register-agent" -H "Content-Type: application/json" -d "{\\"owner\\": \\"$OWNER\\", \\"agent_id\\": \\"a\\", \\"name\\": \\"n\\", \\"price_usdc\\": $PRICE}"`,
    '{"xdr": "<xdr>"}',
  );
  assert.deepEqual(ok.problems, []);
  const filled = check(
    `curl -s "$ORIZON_API/stellar/build/register-agent" -H "Content-Type: application/json" -d "{\\"owner\\": \\"$OWNER\\", \\"agent_id\\": \\"a\\", \\"name\\": \\"n\\", \\"price_usdc\\": 1}"`,
    '{"xdr": "<xdr>"}',
    { extraEnv: { OWNER: "not-an-address" } },
  );
  assert.ok(
    filled.problems.some((p) => p.startsWith("request body.owner")),
    "a variable the guide sets is checked by value",
  );
});

test("documented responses: valid for the documented status's schema", () => {
  const wrong = check(
    `curl -s "$ORIZON_API/stellar/network"`,
    '{"network": 1}',
  ).problems;
  assert.ok(
    wrong.includes(
      "documented response $.network: expected string, got integer",
    ),
    wrong.join("\n"),
  );
  assert.ok(
    wrong.includes(
      "documented response $.rpc_url: required property is missing",
    ),
    wrong.join("\n"),
  );
  const tagged = check(
    `curl -s "$ORIZON_API/health"`,
    '{"status": "ok", "version": "<string>", "uptime_seconds": "<string: seconds>"}',
  ).problems;
  assert.ok(
    tagged.some((p) =>
      p.startsWith(
        "documented response $.uptime_seconds: <string: seconds> is string",
      ),
    ),
    tagged.join("\n"),
  );
  const error = check(
    `curl -s "$ORIZON_API/agents/a/bind/challenge" -H "Content-Type: application/json" -d '{"endpoint_url": "https://agent.example.com/x"}'`,
    '{"detail": "<any>", "error": {"code": "<c>", "message": "<m>", "request_id": "<r>"}}',
    { status: "422" },
  );
  assert.deepEqual(error.problems, []);
  const undocumented = check(`curl -s "$ORIZON_API/stellar/network"`, "{}", {
    status: "404",
  }).problems;
  assert.ok(
    undocumented.some((p) =>
      p.startsWith("GET /api/stellar/network documents no 404 response"),
    ),
    undocumented.join("\n"),
  );
});
