import { describe, expect, it } from "vitest";

import {
  bindHref,
  isOwnedBy,
  needsBinding,
  TRUST_BOUNDARY,
  TWO_SIGNATURES,
  UNBOUND_WARNING,
} from "./binding-status";

const OWNER = "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV";

describe("needsBinding", () => {
  it("is true only for an on-chain agent", () => {
    expect(needsBinding({ owner: OWNER })).toBe(true);
  });

  it("is false for a seeded catalog agent", () => {
    // The whole point of the predicate. A seeded agent runs on a worker inside
    // the backend and has no endpoint, so flagging it "unbound" would mark the
    // entire twelve-agent catalog as broken.
    expect(needsBinding({ owner: null })).toBe(false);
    expect(needsBinding({})).toBe(false);
  });
});

describe("isOwnedBy", () => {
  it("matches the connected wallet against the on-chain owner", () => {
    expect(isOwnedBy({ owner: OWNER }, OWNER)).toBe(true);
  });

  it("is false when no wallet is connected", () => {
    expect(isOwnedBy({ owner: OWNER }, null)).toBe(false);
  });

  it("is false for a seeded agent even with a wallet connected", () => {
    // A seeded agent has no owner; a null owner must never match a null-ish
    // address into a truthy result.
    expect(isOwnedBy({ owner: null }, OWNER)).toBe(false);
  });

  it("does not match a different wallet", () => {
    expect(isOwnedBy({ owner: OWNER }, "GBBBBBB")).toBe(false);
  });
});

describe("bindHref", () => {
  it("carries the agent id so the operator never retypes it", () => {
    expect(bindHref("weather_bot")).toBe("/app/bind?agent=weather_bot");
  });

  it("encodes the id, which arrives from the chain rather than our form", () => {
    expect(bindHref("a b&c=d")).toBe("/app/bind?agent=a%20b%26c%3Dd");
  });
});

describe("the copy", () => {
  it("never claims an unbound agent fails routed work", () => {
    // It is not routed to at all — the backend filters it out of the planner
    // in three places. "Will fail" would be a factually wrong warning.
    expect(UNBOUND_WARNING).not.toMatch(/fail/i);
    expect(UNBOUND_WARNING).toMatch(/cannot be selected/i);
  });

  it("warns about the second signature and says it moves no funds", () => {
    expect(TWO_SIGNATURES).toMatch(/two signatures/i);
    expect(TWO_SIGNATURES).toMatch(/moves no funds/i);
  });

  it("states both halves of the trust boundary", () => {
    expect(TRUST_BOUNDARY).toMatch(/on-chain/i);
    expect(TRUST_BOUNDARY).toMatch(/off-chain/i);
  });
});
