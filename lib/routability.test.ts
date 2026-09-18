import { describe, expect, it } from "vitest";

import { isListed } from "./routability";

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
});
