import { describe, expect, it } from "vitest";
import {
  LITEPAPER_PATH,
  LITEPAPER_SOURCE_URL,
  LITEPAPER_URL,
  formatBytes,
} from "./display";

describe("formatBytes", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [680, "680 bytes"],
    [1023, "1023 bytes"],
    [1024, "1 KB"],
    [86_000, "84 KB"],
    [1_048_000, "1023 KB"],
    [1_048_575, "1.0 MB"],
    [2_102_382, "2.0 MB"],
    [3_561_945, "3.4 MB"],
  ])("%d bytes reads %s", (bytes, words) => {
    expect(formatBytes(bytes)).toBe(words);
  });

  it("refuses a size that is not one", () => {
    expect(() => formatBytes(-1)).toThrow(RangeError);
    expect(() => formatBytes(Number.NaN)).toThrow(RangeError);
  });
});

describe("litepaper addresses", () => {
  it("serves the page at /litepaper on orizons.xyz, its source under litepaper/ on main", () => {
    expect(LITEPAPER_PATH).toBe("/litepaper");
    expect(LITEPAPER_URL).toBe("https://orizons.xyz/litepaper");
    expect(LITEPAPER_SOURCE_URL).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/tree/main/litepaper",
    );
  });
});
