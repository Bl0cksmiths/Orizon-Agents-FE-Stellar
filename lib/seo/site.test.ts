import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SiteContentError, loadSite } from "./site";

function siteFile(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "site-"));
  const file = path.join(dir, "site.json");
  writeFileSync(file, contents);
  return file;
}

describe("loadSite", () => {
  it("reads the home page's updated day from content/site.json", () => {
    expect(loadSite().home.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads the day as written", () => {
    const file = siteFile('{"home":{"updated":"2026-10-02"}}');
    expect(loadSite(file)).toEqual({ home: { updated: "2026-10-02" } });
  });

  it.each([
    ["a missing file", null, /is missing/],
    ["invalid JSON", "{", /not valid JSON/],
    ["no home date", "{}", /home\.updated must be a YYYY-MM-DD day/],
    [
      "a timestamp",
      '{"home":{"updated":"2026-10-02T00:00:00Z"}}',
      /YYYY-MM-DD/,
    ],
    [
      "a day that does not exist",
      '{"home":{"updated":"2026-02-30"}}',
      /YYYY-MM-DD/,
    ],
  ])("fails the build on %s", (_, contents, message) => {
    const file =
      contents === null
        ? path.join(tmpdir(), "no-such-dir", "site.json")
        : siteFile(contents);
    expect(() => loadSite(file)).toThrow(SiteContentError);
    expect(() => loadSite(file)).toThrow(message);
  });
});
