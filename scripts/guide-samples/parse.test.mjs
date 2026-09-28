/**
 * The guide dialect parser: the fixture guide uses every construct, and each
 * way of breaking the dialect is reported against the line and id it is on.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseGuide } from "./parse.mjs";

const FIXTURE = readFileSync(
  new URL("./fixtures/guide.md", import.meta.url),
  "utf8",
);

const FRONT = `---
title: T
description: D
version: 1.0.0
api_verified_against: aaaaaaa
network: testnet
updated: 2026-09-28
status: draft
---
`;

/** A guide made of the standard frontmatter and the given body. */
const guide = (body) => `${FRONT}\n${body}`;
const fence = (info, code) => `\`\`\`${info}\n${code}\n\`\`\`\n`;
const API = fence(
  'bash id="set-api" verify="manual"',
  "export ORIZON_API=https://orizons.xyz/api",
);
const messages = (text) => parseGuide(text).errors.map((e) => e.message);

test("the fixture guide parses with no errors and every construct in it", () => {
  const parsed = parseGuide(FIXTURE);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.apiBase, "https://orizons.xyz/api");
  assert.equal(parsed.frontmatter.network, "testnet");
  const byMode = (mode) =>
    parsed.samples.filter((s) => s.verify === mode).map((s) => s.id);
  assert.deepEqual(byMode("live"), [
    "get-network",
    "check-id",
    "endpoint-check",
    "build-register",
    "bind-challenge",
  ]);
  assert.deepEqual(byMode("offline"), [
    "set-api",
    "sign-challenge",
    "digest-message",
  ]);
  assert.deepEqual(byMode("manual"), [
    "bind",
    "bind-bad",
    "read-binding",
    "register-body",
    "agent-env",
    "message-format",
  ]);
  const langs = new Set(parsed.samples.map((s) => s.lang));
  assert.deepEqual([...langs].sort(), [
    "bash",
    "env",
    "js",
    "json",
    "python",
    "text",
  ]);
  const http = parsed.samples.filter((s) => s.http);
  assert.ok(http.every((s) => s.response?.id === `${s.id}-response`));
  assert.equal(
    parsed.samples.find((s) => s.id === "sign-challenge")?.output?.id,
    "sign-challenge-output",
  );
  assert.equal(
    parsed.samples.find((s) => s.id === "bind-bad")?.response?.attrs.status,
    "422",
  );
});

test("frontmatter: every key is required and each has a shape", () => {
  const missing = messages(FRONT.replace("status: draft\n", "") + "\n" + API);
  assert.ok(
    missing.includes("frontmatter is missing status"),
    missing.join("\n"),
  );
  const mainnet = messages(
    FRONT.replace("network: testnet", "network: mainnet") + "\n" + API,
  );
  assert.ok(
    mainnet.some((m) => m.startsWith("frontmatter network is")),
    mainnet.join("\n"),
  );
  const badSha = messages(FRONT.replace("aaaaaaa", "main") + "\n" + API);
  assert.ok(
    badSha.some((m) => m.startsWith("frontmatter api_verified_against")),
    badSha.join("\n"),
  );
  const typo = messages(
    FRONT.replace("status: draft", "status: draft\nstatsu: x") + "\n" + API,
  );
  assert.ok(typo.includes("unknown frontmatter key statsu"), typo.join("\n"));
  const nested = messages(
    FRONT.replace("status: draft", "status: draft\n  nested: x") + "\n" + API,
  );
  assert.ok(
    nested.some((m) => m.startsWith("unsupported frontmatter line")),
    nested.join("\n"),
  );
  assert.ok(messages(API).includes("the guide must open with --- frontmatter"));
  assert.ok(
    messages(FRONT.replace("2026-09-28", "2026-13-45") + "\n" + API).includes(
      "frontmatter updated is not a real date",
    ),
  );
});

test("fence meta: language, id, verify and attributes are required and checked", () => {
  const cases = [
    [fence("", "x"), "code fence has no language"],
    [
      fence('ruby id="x" verify="manual"', "x"),
      'language "ruby" is not one of bash, json, python, js, text, env',
    ],
    [fence('text verify="manual"', "x"), "code fence has no id"],
    [
      fence('text id="Not_Kebab" verify="manual"', "x"),
      'id "Not_Kebab" is not kebab-case',
    ],
    [fence('text id="x"', "x"), 'sample has no verify="live|offline|manual"'],
    [
      fence('text id="x" verify="sometimes"', "x"),
      'verify="sometimes" is not one of live, offline, manual',
    ],
    [
      fence('text id="x" verify="manual" colour="red"', "x"),
      "unknown fence attribute colour",
    ],
    [
      fence('json id="x" verify="offline"', "{}"),
      'verify="offline" cannot apply to a json fence',
    ],
    [
      fence('python id="x" verify="live"', "print(1)"),
      'verify="live" cannot apply to a python fence',
    ],
    [fence('json id="x" verify="manual"', "{nope"), "invalid JSON"],
  ];
  for (const [body, expected] of cases) {
    const got = messages(guide(body));
    assert.ok(
      got.some((m) => m.startsWith(expected)),
      `expected ${JSON.stringify(expected)} in ${JSON.stringify(got)}`,
    );
  }
});

test("ids are unique", () => {
  const got = parseGuide(
    guide(API + fence('text id="set-api" verify="manual"', "again")),
  ).errors;
  assert.ok(
    got.some((e) => e.message.startsWith("duplicate id set-api")),
    JSON.stringify(got),
  );
});

test("an unclosed fence is an error", () => {
  assert.ok(
    messages(guide('```text id="x" verify="manual"\nnever closed\n')).includes(
      "code fence is never closed",
    ),
  );
});

test("every -response and -output is attached to an existing sample, right after it", () => {
  const orphan = messages(guide(API + fence('json id="ghost-response"', "{}")));
  assert.ok(
    orphan.includes("ghost-response is attached to no sample ghost"),
    orphan.join("\n"),
  );

  const curl = fence(
    'bash id="net" verify="live"',
    'curl -s "$ORIZON_API/stellar/network"',
  );
  const late = messages(
    guide(
      API +
        curl +
        fence('text id="other" verify="manual"', "x") +
        fence('json id="net-response"', "{}"),
    ),
  );
  assert.ok(
    late.some((m) =>
      m.startsWith("net-response must be the next code fence after net"),
    ),
    late.join("\n"),
  );

  const wrongKind = messages(
    guide(
      API +
        fence('python id="py" verify="manual"', "print(1)") +
        fence('json id="py-response"', "{}"),
    ),
  );
  assert.ok(
    wrongKind.includes("py is not an HTTP sample; it has no response"),
    wrongKind.join("\n"),
  );

  const outputOnCurl = messages(
    guide(API + curl + fence('text id="net-output"', "x")),
  );
  assert.ok(
    outputOnCurl.includes("net is an HTTP sample; document it with -response"),
    outputOnCurl.join("\n"),
  );

  const verifyOnResponse = messages(
    guide(API + curl + fence('json id="net-response" verify="manual"', "{}")),
  );
  assert.ok(
    verifyOnResponse.includes(
      "a -response fence is never executed; drop verify=",
    ),
    verifyOnResponse.join("\n"),
  );
});

test("every HTTP sample has a response fence, and none is verify=offline", () => {
  const got = messages(
    guide(
      API +
        fence(
          'bash id="net" verify="live"',
          'curl -s "$ORIZON_API/stellar/network"',
        ),
    ),
  );
  assert.ok(
    got.includes("HTTP sample net has no net-response fence"),
    got.join("\n"),
  );
  const offline = messages(
    guide(
      API +
        fence('bash id="net" verify="offline"', 'curl -s "$ORIZON_API/x"') +
        fence('json id="net-response"', "{}"),
    ),
  );
  assert.ok(
    offline.some((m) =>
      m.startsWith('an HTTP sample cannot be verify="offline"'),
    ),
    offline.join("\n"),
  );
  const liveNoCurl = messages(
    guide(fence('bash id="echo" verify="live"', "echo hi")),
  );
  assert.ok(
    liveNoCurl.includes('verify="live" is only for curl samples'),
    liveNoCurl.join("\n"),
  );
});

test("$ORIZON_API is defined before it is used, once", () => {
  const curl =
    fence(
      'bash id="net" verify="live"',
      'curl -s "$ORIZON_API/stellar/network"',
    ) + fence('json id="net-response"', "{}");
  const before = parseGuide(guide(curl + API));
  assert.ok(
    before.errors.some(
      (e) =>
        e.message ===
          "$ORIZON_API is used before any `export ORIZON_API=...`" &&
        e.id === "net",
    ),
    JSON.stringify(before.errors),
  );
  assert.deepEqual(parseGuide(guide(API + curl)).errors, []);
  const braces = messages(
    guide(fence('bash id="x" verify="manual"', 'echo "${ORIZON_API}"') + API),
  );
  assert.ok(
    braces.includes("$ORIZON_API is used before any `export ORIZON_API=...`"),
  );
  const twice = messages(
    guide(
      API +
        fence(
          'bash id="again" verify="manual"',
          "export ORIZON_API=https://elsewhere.example/api",
        ),
    ),
  );
  assert.ok(
    twice.some((m) => m.startsWith("ORIZON_API is redefined")),
    twice.join("\n"),
  );
  const notUrl = messages(
    guide(
      fence('bash id="bad" verify="manual"', "export ORIZON_API=orizons.xyz"),
    ),
  );
  assert.ok(
    notUrl.includes("ORIZON_API=orizons.xyz is not an http(s) URL"),
    notUrl.join("\n"),
  );
});
