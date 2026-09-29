/**
 * The page's loader, against the fixture book in test/fixtures/litepaper/:
 * the cover it reads, the sizes it computes, the §6 link it derives, and the
 * build failures it raises.
 */

import { cpSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGES_VERSION, LITEPAPER_CHANGES } from "./changes";
import { formatBytes } from "./display";
import { loadLitepaper } from "./load";
import { LitepaperSourceError } from "./source.mjs";

const FIXTURE = path.resolve(__dirname, "../../test/fixtures/litepaper");
const env = { LITEPAPER_DIR: FIXTURE };

describe("loadLitepaper", () => {
  it("reads the title, version and date from the cover", () => {
    const paper = loadLitepaper(env);
    expect(paper.title).toBe("The Orizon Agents Protocol Litepaper (fixture)");
    expect(paper.version).toBe("0.5");
    expect(paper.date).toBe("2026-09-27");
  });

  it("offers the four files at clean URLs, each with its size on disk", () => {
    const { downloads } = loadLitepaper(env);
    expect(downloads.map((d) => [d.href, d.type])).toEqual([
      ["/litepaper/orizon-agents-litepaper.pdf", "PDF"],
      ["/litepaper/orizon-agents-litepaper.html", "HTML"],
      ["/litepaper/orizon-agents-litepaper.docx", "DOCX"],
      ["/litepaper/orizon-agents-litepaper.md", "MD"],
    ]);
    for (const d of downloads) {
      const bytes = statSync(path.join(FIXTURE, d.source)).size;
      expect(d.bytes).toBe(bytes);
      expect(d.size).toBe(formatBytes(bytes));
    }
  });

  it("links §6 in the HTML book by the anchor pandoc gave it", () => {
    expect(loadLitepaper(env).chapter6).toEqual({
      href: "/litepaper/orizon-agents-litepaper.html#operations-and-governance",
      title: "§6 · Operations and Governance",
    });
  });

  it("carries the committed list of changes", () => {
    expect(loadLitepaper(env).changes).toBe(LITEPAPER_CHANGES);
    expect(CHANGES_VERSION).toBe("0.5");
  });

  it("fails the build when the folder is missing", () => {
    expect(() =>
      loadLitepaper({ LITEPAPER_DIR: path.join(FIXTURE, "no-such-dir") }),
    ).toThrow(LitepaperSourceError);
    expect(() =>
      loadLitepaper({ LITEPAPER_DIR: path.join(FIXTURE, "no-such-dir") }),
    ).toThrow(/the litepaper cannot be published[\s\S]*the folder is missing/);
  });

  it("fails the build when the cover's version is not the one the changes describe", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "litepaper-load-"));
    try {
      cpSync(FIXTURE, scratch, { recursive: true });
      writeFileSync(
        path.join(scratch, "sections/00-front-matter.md"),
        "# A title\n\n**Version** 0.6 · **Date** 2026-10-15\n",
      );
      expect(() => loadLitepaper({ LITEPAPER_DIR: scratch })).toThrow(
        "the cover says version 0.6, but lib/litepaper/changes.ts lists the changes in 0.5; update the list for 0.6",
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
