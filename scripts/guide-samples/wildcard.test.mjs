/**
 * The wildcard rule and the documented-vs-real comparison.
 *
 * Run: node --test scripts/guide-samples
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareJson,
  compareText,
  formatComparison,
  readWildcard,
} from "./wildcard.mjs";

test("a wildcard is a string wholly in <...>; a leading JSON type word is its tag", () => {
  assert.deepEqual(readWildcard("<unix seconds>"), {
    tag: null,
    text: "unix seconds",
  });
  assert.deepEqual(readWildcard("<number>"), { tag: "number", text: "number" });
  assert.deepEqual(readWildcard("<integer: ledger>"), {
    tag: "integer",
    text: "integer: ledger",
  });
  assert.deepEqual(readWildcard("<any>"), { tag: "any", text: "any" });
  assert.equal(
    readWildcard("<numbered list>")?.tag,
    null,
    "a tag is a whole word",
  );
  assert.equal(readWildcard("a <b>"), null);
  assert.equal(readWildcard("<>"), null);
  assert.equal(readWildcard(5), null);
});

test("an untagged wildcard uses the contract's type: <unix seconds> is any number, never a string", () => {
  const resolved = new Map([["$.expires_at", new Set(["number", "integer"])]]);
  assert.ok(
    compareJson(
      { expires_at: "<unix seconds>" },
      { expires_at: 1712345678 },
      resolved,
    ).ok,
  );
  assert.ok(
    compareJson(
      { expires_at: "<unix seconds>" },
      { expires_at: 1712345678.25 },
      resolved,
    ).ok,
  );
  const asString = compareJson(
    { expires_at: "<unix seconds>" },
    { expires_at: "1712345678" },
    resolved,
  );
  assert.equal(asString.ok, false);
  assert.match(
    asString.mismatched[0].message,
    /documented <unix seconds> \(number \| integer\), got string/,
  );
});

test("without contract information, a tag decides, and an untagged wildcard is a string", () => {
  assert.ok(compareJson({ n: "<integer>" }, { n: 3 }).ok);
  assert.equal(compareJson({ n: "<integer>" }, { n: 3.5 }).ok, false);
  assert.ok(
    compareJson({ n: "<number>" }, { n: 3 }).ok,
    "number includes integers",
  );
  assert.ok(compareJson({ h: "<tx hash>" }, { h: "abc" }).ok);
  assert.equal(compareJson({ h: "<tx hash>" }, { h: 12 }).ok, false);
  assert.ok(compareJson({ x: "<any>" }, { x: { deep: [1] } }).ok);
  assert.ok(compareJson({ x: "<null>" }, { x: null }).ok);
  assert.equal(compareJson({ x: "<object>" }, { x: [] }).ok, false);
  const nullable = new Map([["$.reason", new Set(["string", "null"])]]);
  assert.ok(compareJson({ reason: "<why>" }, { reason: null }, nullable).ok);
});

test("objects: missing keys fail, extra keys pass and are reported", () => {
  const missing = compareJson({ a: 1, b: 2 }, { a: 1 });
  assert.equal(missing.ok, false);
  assert.deepEqual(
    missing.missing.map((d) => d.path),
    ["$.b"],
  );
  const extra = compareJson({ a: 1 }, { a: 1, z: "new", "odd key": true });
  assert.equal(extra.ok, true);
  assert.deepEqual(
    extra.extra.map((d) => d.path),
    ["$.z", '$["odd key"]'],
  );
});

test("types and literal values must match where the documented value is not a wildcard", () => {
  const wrongType = compareJson({ ttl_seconds: 300 }, { ttl_seconds: "300" });
  assert.equal(wrongType.ok, false);
  assert.match(
    wrongType.mismatched[0].message,
    /documented integer 300, got string "300"/,
  );
  const wrongValue = compareJson({ network: "testnet" }, { network: "public" });
  assert.equal(wrongValue.ok, false);
  assert.equal(compareJson({ n: null }, { n: 0 }).ok, false);
  assert.equal(compareJson({ o: {} }, { o: [] }).ok, false);
  assert.ok(compareJson({ n: 1 }, { n: 1.0 }).ok);
});

test("arrays: documented elements by position; shorter fails, longer is reported", () => {
  assert.ok(compareJson([{ id: "<id>" }], [{ id: "a" }, { id: "b" }]).ok);
  assert.equal(
    compareJson([{ id: "<id>" }], [{ id: "a" }, { id: "b" }]).extra.length,
    1,
  );
  const short = compareJson([1, 2], [1]);
  assert.deepEqual(
    short.missing.map((d) => d.path),
    ["$[1]"],
  );
  assert.ok(compareJson([], [1, 2]).ok);
});

test("the diff names every problem with its path", () => {
  const text = formatComparison(
    compareJson({ a: 1, b: "<string>", c: 1 }, { a: 2, b: 3, d: 0 }),
  );
  assert.match(text, /^- \$\.c: documented key is missing/m);
  assert.match(text, /^! \$\.a: documented 1, got 2/m);
  assert.match(text, /^! \$\.b: documented <string>/m);
  assert.match(text, /^\+ \$\.d: undocumented key/m);
});

test("text output: exact lines, trailing whitespace ignored, <...> matches within a line", () => {
  assert.ok(
    compareText(
      "signature: <base64>\nlength: 64\n",
      "signature: q83v==  \nlength: 64\n\n",
    ).ok,
  );
  assert.equal(compareText("length: 64", "length: 65").ok, false);
  assert.equal(
    compareText("id=[<id>]", "id=[]").ok,
    false,
    "a wildcard is non-empty",
  );
  assert.equal(compareText("a\nb", "a").ok, false);
  assert.equal(compareText("a", "a\nb").ok, false);
  assert.ok(
    compareText("cost (<n>) [x]", "cost (5) [x]").ok,
    "literal parts are not regex",
  );
  assert.equal(compareText("a.c", "abc").ok, false);
});
