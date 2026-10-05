import { describe, expect, it } from "vitest";

import { entrance } from "./entrance";

describe("entrance", () => {
  it("leaves every timing to the stylesheet's defaults when given none", () => {
    expect(entrance()).toEqual({});
    expect(entrance({ delay: 0 })).toEqual({});
  });

  it("states delay and duration in seconds", () => {
    expect(entrance({ delay: 0.16, duration: 0.4 })).toEqual({
      "--motion-delay": "0.16s",
      "--motion-duration": "0.4s",
    });
  });

  it("passes the start transform through as written", () => {
    expect(entrance({ from: "translateX(-12px)" })).toEqual({
      "--motion-from": "translateX(-12px)",
    });
  });
});
