/**
 * Unit tests for lib/guide/load.ts: finding and reading guides on disk.
 */

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideContentError } from "./frontmatter";
import {
  DEFAULT_GUIDE_DIR,
  guideDir,
  listGuideSlugs,
  loadAllGuides,
  loadGuide,
} from "./load";

const GUIDE = (title: string) => `---
title: ${title}
description: D
version: "1.0.0"
api_verified_against: abcdef1
network: testnet
updated: "2026-09-29"
status: validated
---

## Start
`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "guides-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("guideDir", () => {
  it("defaults to content/guides under the project", () => {
    expect(guideDir({})).toBe(path.resolve(process.cwd(), DEFAULT_GUIDE_DIR));
  });

  it("follows GUIDE_CONTENT_DIR", () => {
    expect(guideDir({ GUIDE_CONTENT_DIR: "test/fixtures/guides" })).toBe(
      path.resolve(process.cwd(), "test/fixtures/guides"),
    );
  });
});

describe("listGuideSlugs", () => {
  it("lists .md files by slug, sorted, ignoring anything else", () => {
    writeFileSync(path.join(dir, "zeta.md"), GUIDE("Z"));
    writeFileSync(path.join(dir, "list-your-agent.md"), GUIDE("L"));
    writeFileSync(path.join(dir, "notes.txt"), "not a guide");
    expect(listGuideSlugs(dir)).toEqual(["list-your-agent", "zeta"]);
  });

  it("has none when the directory does not exist", () => {
    expect(listGuideSlugs(path.join(dir, "missing"))).toEqual([]);
  });

  it("rejects a file name that cannot be a URL segment", () => {
    writeFileSync(path.join(dir, "List Your Agent.md"), GUIDE("L"));
    expect(() => listGuideSlugs(dir)).toThrow(GuideContentError);
    expect(() => listGuideSlugs(dir)).toThrow(/must be kebab-case/);
  });
});

describe("loadGuide", () => {
  it("parses a guide and tags it with its slug", () => {
    writeFileSync(path.join(dir, "list-your-agent.md"), GUIDE("List it"));
    const guide = loadGuide("list-your-agent", dir);
    expect(guide?.slug).toBe("list-your-agent");
    expect(guide?.meta.title).toBe("List it");
    expect(guide?.toc).toEqual([{ depth: 2, id: "start", text: "Start" }]);
  });

  it("returns null for a missing guide or a slug that is not kebab-case", () => {
    expect(loadGuide("nope", dir)).toBeNull();
    expect(loadGuide("../etc/passwd", dir)).toBeNull();
  });

  it("re-reads a file only when it changes", () => {
    const file = path.join(dir, "g.md");
    writeFileSync(file, GUIDE("First"));
    const first = loadGuide("g", dir);
    expect(loadGuide("g", dir)).toBe(first);
    writeFileSync(file, GUIDE("Second"));
    const later = new Date(Date.now() + 5_000);
    utimesSync(file, later, later);
    expect(loadGuide("g", dir)?.meta.title).toBe("Second");
  });

  it("logs stripped raw HTML, naming the file", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(path.join(dir, "h.md"), GUIDE("H") + "\n<div>hi</div>\n");
    loadGuide("h", dir);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /h\.md: raw HTML is not part of the guide dialect and was removed: <div>hi<\/div>$/,
      ),
    );
  });

  it("fails loudly on invalid content", () => {
    writeFileSync(path.join(dir, "bad.md"), "## No frontmatter\n");
    expect(() => loadAllGuides(dir)).toThrow(
      /bad\.md: the guide cannot be published/,
    );
  });
});
