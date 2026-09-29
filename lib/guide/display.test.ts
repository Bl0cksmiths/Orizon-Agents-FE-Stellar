/**
 * Unit tests for lib/guide/display.ts.
 */

import { describe, expect, it } from "vitest";
import {
  LIST_YOUR_AGENT_PATH,
  VERIFY_TEXT,
  backendCommitUrl,
  formatGuideDate,
  guidePath,
  shortSha,
} from "./display";

describe("guide display helpers", () => {
  it("builds the guide's path", () => {
    expect(guidePath("list-your-agent")).toBe("/guide/list-your-agent");
    expect(LIST_YOUR_AGENT_PATH).toBe("/guide/list-your-agent");
  });

  it("links the full sha to the backend commit and shows seven characters", () => {
    const sha = "1e3c60d4b2a9f7e8c6d5b4a3f2e1d0c9b8a7f6e5";
    expect(backendCommitUrl(sha)).toBe(
      "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/commit/1e3c60d4b2a9f7e8c6d5b4a3f2e1d0c9b8a7f6e5",
    );
    expect(shortSha(sha)).toBe("1e3c60d");
  });

  it("formats the date the same whatever the server's time zone", () => {
    expect(formatGuideDate("2026-09-29")).toBe("September 29, 2026");
    expect(formatGuideDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("names each verify mode in words", () => {
    expect(Object.values(VERIFY_TEXT).map((v) => v.label)).toEqual([
      "Runs live",
      "Runs offline",
      "Needs your key",
    ]);
  });
});
