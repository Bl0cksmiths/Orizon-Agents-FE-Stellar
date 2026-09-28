/**
 * Reading a curl sample the way a reader's shell would, without a shell.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  marker,
  parseCurlSample,
  parseJsonWithMarkers,
  parseShell,
  resolveWord,
  sessionEnv,
  ShellParseError,
} from "./shell.mjs";

const req = (code) => parseCurlSample(code).request;
const env = { ORIZON_API: "https://orizons.xyz/api", ID: "my_agent" };

test("quoting: single quotes are literal, double quotes expand, quotes splice", () => {
  const r = req(`curl -s "$ORIZON_API/agents/\${ID}" -d '{"a": "$NOT"}'`);
  assert.equal(
    resolveWord(r.url, env),
    "https://orizons.xyz/api/agents/my_agent",
  );
  assert.equal(r.body, '{"a": "$NOT"}');
  const spliced = req(
    `curl "$ORIZON_API/x" -H 'Content-Type: application/json' -d '{"owner": "'"$OWNER"'"}'`,
  );
  assert.equal(spliced.body, `{"owner": "${marker("OWNER")}"}`);
  assert.equal(
    resolveWord(spliced.body, { OWNER: "GABC" }),
    '{"owner": "GABC"}',
  );
});

test("line continuations, comments and a trailing | jq . are a single curl", () => {
  const r = req(
    `# read the network\ncurl -s \\\n  "$ORIZON_API/stellar/network" \\\n  | jq .`,
  );
  assert.equal(r.method, "GET");
  assert.equal(
    resolveWord(r.url, env),
    "https://orizons.xyz/api/stellar/network",
  );
});

test("method: explicit, POST by default with data, GET with -G", () => {
  assert.equal(req(`curl -X DELETE "$ORIZON_API/a"`).method, "DELETE");
  assert.equal(req(`curl -sSX POST "$ORIZON_API/a"`).method, "POST");
  assert.equal(req(`curl --request=PUT "$ORIZON_API/a"`).method, "PUT");
  assert.equal(req(`curl "$ORIZON_API/a" -d '{}'`).method, "POST");
  const get = req(
    `curl -sG "$ORIZON_API/check" --data-urlencode "url=https://a.example/x y" -d limit=5`,
  );
  assert.equal(get.method, "GET");
  assert.equal(get.body, null);
  assert.equal(
    resolveWord(get.url, env),
    "https://orizons.xyz/api/check?limit=5&url=https%3A%2F%2Fa.example%2Fx%20y",
  );
});

test("headers and --json", () => {
  const r = req(
    `curl "$ORIZON_API/a" -H "X-API-Key: $KEY" --header 'Accept: application/json'`,
  );
  assert.deepEqual(r.headers, [
    ["X-API-Key", marker("KEY")],
    ["Accept", "application/json"],
  ]);
  const json = req(`curl "$ORIZON_API/a" --json '{"a":1}'`);
  assert.equal(json.method, "POST");
  assert.deepEqual(json.headers[0], ["Content-Type", "application/json"]);
});

test("assignments before the curl are allowed and applied", () => {
  const { request, assignments } = parseCurlSample(
    `AGENT=my_agent\nexport X=1\ncurl "$ORIZON_API/agents/$AGENT"`,
  );
  assert.equal(assignments.length, 2);
  assert.equal(
    resolveWord(request.url, env),
    `https://orizons.xyz/api/agents/${marker("AGENT")}`,
  );
  const session = sessionEnv([
    `export ORIZON_API=https://orizons.xyz/api`,
    `AGENT=a_$SUFFIX`,
    `B="$ORIZON_API/b"`,
  ]);
  assert.deepEqual(session, {
    ORIZON_API: "https://orizons.xyz/api",
    B: "https://orizons.xyz/api/b",
  });
  const pinned = sessionEnv(
    [`export ORIZON_API=https://orizons.xyz/api`],
    { ORIZON_API: "http://127.0.0.1:1/api" },
    new Set(["ORIZON_API"]),
  );
  assert.equal(pinned.ORIZON_API, "http://127.0.0.1:1/api");
});

test("anything that is not one copy-paste curl is rejected", () => {
  const rejects = [
    [`curl "$ORIZON_API/a" | grep ok`, /only `\| jq \.` may follow the curl/],
    [`curl "$ORIZON_API/a" && echo done`, /&& is not supported/],
    [`curl "$ORIZON_API/a" -o out.json`, /unsupported curl option -o/],
    [`curl "$ORIZON_API/a" --user me:pw`, /unsupported curl option --user/],
    [`curl "$ORIZON_API/a" -d @body.json`, /reading the body from a file/],
    [`curl "$ORIZON_API/a" > out.json`, /redirection/],
    [`echo hi`, /runs one curl and nothing else/],
    [`curl "$ORIZON_API/a"\ncurl "$ORIZON_API/b"`, /a second curl/],
    [`curl -s`, /curl has no URL/],
    [`curl "$ORIZON_API/a`, /unterminated "/],
  ];
  for (const [code, pattern] of rejects) {
    assert.throws(
      () => parseCurlSample(code),
      (err) => err instanceof ShellParseError && pattern.test(err.message),
      code,
    );
  }
});

test("resolveWord: lenient keeps unknown expansions, strict refuses them", () => {
  const word = `${marker("ORIZON_API")}/agents/${marker("MISSING")}`;
  assert.equal(
    resolveWord(word, env),
    `https://orizons.xyz/api/agents/${marker("MISSING")}`,
  );
  assert.throws(
    () => resolveWord(word, env, { strict: true }),
    /\$MISSING is not set/,
  );
  const sub = parseShell(`curl "$(cat sig.txt)"`).pipelines[0].commands[0]
    .words[1];
  assert.throws(
    () => resolveWord(sub, env, { strict: true }),
    /command substitution/,
  );
});

test("parseJsonWithMarkers: an expansion can stand in for any JSON value", () => {
  const text = `{"price": ${marker("PRICE")}, "owner": "G${marker("REST")}", "n": 1}`;
  assert.deepEqual(parseJsonWithMarkers(text), {
    price: marker("PRICE"),
    owner: `G${marker("REST")}`,
    n: 1,
  });
});

test("a <placeholder> assignment is the reader's to fill in, so it leaves the name unset", () => {
  const session = sessionEnv([
    `export AGENT_ID='<the agent id you register in Step 3>'\nexport NAME=literal`,
  ]);
  assert.deepEqual(session, { NAME: "literal" });
});
