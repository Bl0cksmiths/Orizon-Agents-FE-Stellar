/**
 * The OpenAPI schema subset validator, against schemas taken from the real
 * snapshot, and its refusal of keywords it does not implement.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createValidator,
  docWildcards,
  UnsupportedSchemaError,
} from "./schema.mjs";

const MINI = JSON.parse(
  readFileSync(
    new URL("./fixtures/openapi.mini.json", import.meta.url),
    "utf8",
  ),
);
const REAL = JSON.parse(
  readFileSync(
    new URL("../../content/guides/openapi.snapshot.json", import.meta.url),
    "utf8",
  ),
);
const v = createValidator(MINI);
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const messages = (schema, value, options) =>
  v
    .validate(schema, value, options)
    .errors.map((e) => `${e.path} ${e.message}`);

const OWNER = `G${"A".repeat(55)}`;
const GOOD_REGISTER = {
  owner: OWNER,
  agent_id: "my_agent",
  name: "My agent",
  skills: ["research"],
  price_usdc: 0.05,
};

test("a request body that matches the contract passes", () => {
  assert.deepEqual(messages(ref("RegisterAgentReq"), GOOD_REGISTER), []);
});

test("a request body that breaks the contract fails, naming the path and rule", () => {
  const cases = [
    [
      { ...GOOD_REGISTER, owner: "GABC" },
      '$.owner "GABC" does not match ^G[A-Z2-7]{55}$',
    ],
    [
      { ...GOOD_REGISTER, price_usdc: 0 },
      "$.price_usdc 0 must be greater than 0",
    ],
    [
      { ...GOOD_REGISTER, price_usdc: 10001 },
      "$.price_usdc 10001 is above the maximum 10000",
    ],
    [
      { ...GOOD_REGISTER, price_usdc: "0.05" },
      "$.price_usdc expected number, got string",
    ],
    [{ ...GOOD_REGISTER, name: "" }, "$.name shorter than 1 characters"],
    [
      { ...GOOD_REGISTER, skills: Array(17).fill("s") },
      "$.skills more than 16 items",
    ],
    [
      { ...GOOD_REGISTER, skills: ["no spaces"] },
      '$.skills[0] "no spaces" does not match ^[A-Za-z0-9_]{1,32}$',
    ],
    [
      (({ name: _n, ...rest }) => rest)(GOOD_REGISTER),
      "$.name required property is missing",
    ],
  ];
  for (const [body, expected] of cases) {
    assert.ok(
      messages(ref("RegisterAgentReq"), body).includes(expected),
      `${expected}\n${messages(ref("RegisterAgentReq"), body)}`,
    );
  }
});

const NETWORK = {
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: OWNER,
  dispatch_signer: null,
  asset: "native",
  asset_sac: `C${"S".repeat(55)}`,
  contracts: { agent_registry: `C${"R".repeat(55)}` },
};

test("a documented response that matches the contract passes", () => {
  assert.deepEqual(messages(ref("NetworkInfo"), NETWORK), []);
  assert.deepEqual(
    messages(ref("NetworkInfo"), { ...NETWORK, dispatch_signer: OWNER }),
    [],
  );
});

test("a documented response that breaks the contract fails", () => {
  assert.ok(
    messages(ref("NetworkInfo"), { ...NETWORK, contracts: { a: 1 } }).includes(
      "$.contracts.a expected string, got integer",
    ),
  );
  const { asset_sac: _a, ...missing } = NETWORK;
  assert.ok(
    messages(ref("NetworkInfo"), missing).includes(
      "$.asset_sac required property is missing",
    ),
  );
  const nullable = messages(ref("NetworkInfo"), {
    ...NETWORK,
    dispatch_signer: 5,
  });
  assert.ok(
    nullable.some((m) =>
      m.startsWith("$.dispatch_signer matches none of 2 alternatives"),
    ),
    nullable.join("\n"),
  );
});

test("prefixItems, const, enum and additionalProperties: false", () => {
  const schema = {
    type: "object",
    properties: {
      pair: {
        type: "array",
        prefixItems: [{ type: "string" }, { type: "integer" }],
        minItems: 2,
      },
      kind: { const: "platform" },
      side: { enum: ["buy", "sell"] },
    },
    additionalProperties: false,
  };
  assert.deepEqual(
    messages(schema, { pair: ["a", 1], kind: "platform", side: "buy" }),
    [],
  );
  const bad = messages(schema, {
    pair: ["a", "b"],
    kind: "other",
    side: "hold",
    extra: 1,
  });
  assert.deepEqual(
    bad.sort(),
    [
      '$.kind expected "platform"',
      "$.extra property is not in the contract",
      "$.pair[1] expected integer, got string",
      '$.side "hold" is not one of ["buy","sell"]',
    ].sort(),
  );
  assert.ok(
    messages(schema, { pair: ["a"] }).includes("$.pair fewer than 2 items"),
  );
});

test("an untagged wildcard takes the contract's type at its position", () => {
  const doc = {
    agent_id: "<agent id>",
    nonce: "<nonce>",
    message: "<m>",
    expires_at: "<unix seconds>",
    ttl_seconds: 300,
  };
  const { errors, wildcards } = v.validate(ref("BindChallengeResponse"), doc, {
    wildcard: docWildcards,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual([...wildcards.get("$.expires_at")].sort(), [
    "integer",
    "number",
  ]);
  assert.deepEqual([...wildcards.get("$.nonce")], ["string"]);
  const nullable = v.validate(
    ref("AgentIdAvailability"),
    { available: true, reason: "<why>" },
    { wildcard: docWildcards },
  );
  assert.deepEqual([...nullable.wildcards.get("$.reason")].sort(), [
    "null",
    "string",
  ]);
  const freeForm = v.validate(
    { type: "object", additionalProperties: true },
    { hash: "<tx hash>" },
    { wildcard: docWildcards },
  );
  assert.deepEqual([...freeForm.wildcards.get("$.hash")], ["string"]);
});

test("a tagged wildcard must fit the contract", () => {
  const wrong = messages(
    ref("BindChallengeResponse"),
    {
      agent_id: "a",
      nonce: "n",
      message: "m",
      expires_at: "<string: when>",
      ttl_seconds: 1,
    },
    { wildcard: docWildcards },
  );
  assert.deepEqual(wrong, [
    "$.expires_at <string: when> is string, but the contract says number | integer",
  ]);
  const narrowed = v.validate(
    ref("BindChallengeResponse"),
    {
      agent_id: "a",
      nonce: "n",
      message: "m",
      expires_at: 1,
      ttl_seconds: "<number>",
    },
    { wildcard: docWildcards },
  );
  assert.deepEqual(narrowed.errors, []);
  assert.deepEqual([...narrowed.wildcards.get("$.ttl_seconds")], ["integer"]);
});

test("a keyword outside the subset is refused, not ignored", () => {
  assert.throws(
    () => v.validate({ type: "string", format: "email" }, "x"),
    UnsupportedSchemaError,
  );
  assert.throws(
    () => v.validate({ oneOf: [{ type: "string" }] }, "x"),
    /unsupported schema keyword "oneOf"/,
  );
  const bad = createValidator({
    components: { schemas: { A: { type: "object", discriminator: {} } } },
    paths: {},
  });
  assert.throws(() => bad.assertSupported(), /discriminator/);
});

test("the committed snapshot uses only the implemented subset", () => {
  assert.ok(createValidator(REAL).assertSupported() > 100);
});

test("a template string is checked as a string, not against the pattern it sketches", () => {
  const schema = {
    type: "object",
    properties: {
      owner: { type: "string", pattern: "^G[A-Z2-7]{55}$" },
      n: { type: "integer" },
    },
  };
  assert.deepEqual(
    messages(
      schema,
      { owner: "G<rest of your address>" },
      { wildcard: docWildcards },
    ),
    [],
  );
  assert.deepEqual(
    messages(schema, { n: "about <n>" }, { wildcard: docWildcards }),
    ['$.n "about <n>" is string, but the contract says integer'],
  );
});
