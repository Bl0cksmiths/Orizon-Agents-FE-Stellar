/**
 * The litepaper source checks: the cover line the version and date come
 * from, the §6 anchor in the HTML book, and the folder's required files.
 * Each is a build gate, so each failure is asserted by name.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ARTIFACTS,
  LitepaperSourceError,
  checkSource,
  findChapterAnchor,
  litepaperDir,
  parseCover,
  publishedHref,
} from "./source.mjs";

const FIXTURE = path.resolve(__dirname, "../../test/fixtures/litepaper");

const COVER = [
  "# The Orizon Agents Protocol Litepaper",
  "",
  "> Pay-per-workflow agent commerce on Stellar.",
  "",
  "**Version** 0.5 · **Date** 2026-09-29",
  "**Network** Stellar (Protocol 22+) · **Settlement** USDC",
].join("\n");

describe("parseCover", () => {
  it("reads the title, version and date from the cover line", () => {
    expect(parseCover(COVER)).toEqual({
      ok: true,
      cover: {
        title: "The Orizon Agents Protocol Litepaper",
        version: "0.5",
        date: "2026-09-29",
      },
    });
  });

  it("fails without the cover line", () => {
    const result = parseCover(COVER.replace(/^\*\*Version\*\*.*$/m, ""));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems).toEqual([
      'sections/00-front-matter.md has no cover line like "**Version** 0.5 · **Date** 2026-09-29"',
    ]);
  });

  it("fails on a version that is not numbers and dots, or a date that is not a day", () => {
    const result = parseCover(
      COVER.replace("0.5 · **Date** 2026-09-29", "v0.5 · **Date** 2026-02-30"),
    );
    expect(!result.ok && result.problems).toEqual([
      'the cover\'s version must be numbers and dots, like 0.5, not "v0.5"',
      'the cover\'s date must be a calendar date like 2026-09-29, not "2026-02-30"',
    ]);
  });

  it("fails without a title heading", () => {
    const result = parseCover(COVER.replace(/^# .*$/m, ""));
    expect(!result.ok && result.problems).toEqual([
      'sections/00-front-matter.md has no "# " title heading',
    ]);
  });
});

describe("findChapterAnchor", () => {
  const html = [
    '<nav id="TOC"><a href="#operations-and-governance">§6 · Operations</a></nav>',
    '<h1 id="technical-details">§5 · Technical Details</h1>',
    '<h2 id="six-point-one">6.1 · Roles</h2>',
    '<h1 id="sixty">§60 · Not this one</h1>',
    '<h1 id="operations-and-governance">§6 · Operations and <em>Governance</em> &amp; more</h1>',
  ].join("\n");

  it("finds the §6 heading's id and words, not a TOC link or §60", () => {
    expect(findChapterAnchor(html, 6)).toEqual({
      id: "operations-and-governance",
      title: "§6 · Operations and Governance & more",
    });
  });

  it("is null when no heading starts with the chapter", () => {
    expect(findChapterAnchor(html, 7)).toBeNull();
    expect(
      findChapterAnchor("<h1>§6 · A heading with no id</h1>", 6),
    ).toBeNull();
  });
});

describe("litepaperDir", () => {
  it("is litepaper/ unless LITEPAPER_DIR says otherwise, ignoring a blank one", () => {
    expect(litepaperDir({}, "/repo")).toBe("/repo/litepaper");
    expect(litepaperDir({ LITEPAPER_DIR: "  " }, "/repo")).toBe(
      "/repo/litepaper",
    );
    expect(
      litepaperDir({ LITEPAPER_DIR: "test/fixtures/litepaper" }, "/repo"),
    ).toBe("/repo/test/fixtures/litepaper");
  });
});

describe("publishedHref", () => {
  it("serves every file under /litepaper with a clean lowercase name", () => {
    expect(ARTIFACTS.map((a) => publishedHref(a.file))).toEqual([
      "/litepaper/orizon-agents-litepaper.pdf",
      "/litepaper/orizon-agents-litepaper.html",
      "/litepaper/orizon-agents-litepaper.docx",
      "/litepaper/orizon-agents-litepaper.md",
    ]);
  });
});

describe("checkSource", () => {
  let scratch: string | null = null;
  afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    scratch = null;
  });
  function copyFixture(): string {
    scratch = mkdtempSync(path.join(tmpdir(), "litepaper-source-"));
    const dir = path.join(scratch, "litepaper");
    cpSync(FIXTURE, dir, { recursive: true });
    return dir;
  }

  it("accepts the fixture and returns its cover, §6 anchor and figures", () => {
    expect(checkSource(FIXTURE)).toEqual({
      ok: true,
      cover: {
        title: "The Orizon Agents Protocol Litepaper (fixture)",
        version: "0.5",
        date: "2026-09-27",
      },
      chapter6: {
        id: "operations-and-governance",
        title: "§6 · Operations and Governance",
      },
      figures: ["figure-1.png"],
    });
  });

  it("fails when the folder is missing", () => {
    const result = checkSource(path.join(FIXTURE, "no-such-dir"));
    expect(!result.ok && result.problems).toEqual([
      "the folder is missing; import the litepaper there, or point LITEPAPER_DIR at it",
    ]);
  });

  for (const a of ARTIFACTS) {
    it(`fails when the ${a.type} file is missing`, () => {
      const dir = copyFixture();
      rmSync(path.join(dir, a.source));
      const result = checkSource(dir);
      expect(!result.ok && result.problems).toContain(
        `the ${a.type} file ${a.source} is missing or empty`,
      );
    });
  }

  it("fails on an empty file, no figures, no cover and no §6, all at once", () => {
    const dir = copyFixture();
    writeFileSync(path.join(dir, "Orizon-Agents-Litepaper.pdf"), "");
    rmSync(path.join(dir, "figures"), { recursive: true });
    writeFileSync(path.join(dir, "sections/00-front-matter.md"), "# Title\n");
    writeFileSync(
      path.join(dir, "Orizon-Agents-Litepaper.html"),
      '<h1 id="x">§5 · Only five</h1>',
    );
    const result = checkSource(dir);
    expect(!result.ok && result.problems).toEqual([
      "the PDF file Orizon-Agents-Litepaper.pdf is missing or empty",
      "figures/ has no PNG figures",
      'sections/00-front-matter.md has no cover line like "**Version** 0.5 · **Date** 2026-09-29"',
      'the HTML book has no heading starting "§6" with an id to link to',
    ]);
  });
});

describe("LitepaperSourceError", () => {
  it("lists every problem under the folder's name", () => {
    const error = new LitepaperSourceError("litepaper", ["one", "two"]);
    expect(error.message).toBe(
      "litepaper: the litepaper cannot be published.\n  - one\n  - two",
    );
    expect(error.problems).toEqual(["one", "two"]);
  });
});
