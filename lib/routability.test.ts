import { describe, expect, it } from "vitest";

import { isListed } from "./routability";
import type { Agent } from "./types";

describe("isListed", () => {
  it("is true for an online agent", () => {
    expect(isListed({ status: "online" })).toBe(true);
  });

  it("is true for an idle agent", () => {
    // The mistake the backend comment warns about by name. "idle" is "nothing
    // in flight right now", and the seeded catalog ships two idle agents that
    // are routed every day; reading it as withdrawn would hide them.
    expect(isListed({ status: "idle" })).toBe(true);
  });

  it("is false for an offline agent — the synced form of a delisting", () => {
    // `registry_sync` maps `set_active(id, false)` to "offline", and that is
    // the only thing that ever produces it.
    expect(isListed({ status: "offline" })).toBe(false);
  });

  it("reads nothing but the status", () => {
    // Binding and reputation are separate gates with their own predicates; a
    // delisted agent that is bound and well rated is still delisted, and a
    // listed one that is neither is still listed.
    const delisted: Agent = {
      id: "paused_bot",
      name: "Paused Bot",
      skills: ["translation"],
      price: 0.04,
      rep: 4.9,
      status: "offline",
      runs: 57,
      source: "onchain",
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      bound: true,
    };
    expect(isListed(delisted)).toBe(false);
    const listedUnbound: Agent = {
      ...delisted,
      status: "online",
      bound: false,
    };
    expect(isListed(listedUnbound)).toBe(true);
  });
});
