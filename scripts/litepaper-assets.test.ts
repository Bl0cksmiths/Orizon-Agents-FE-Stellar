/**
 * scripts/litepaper-assets.mjs, run as `prebuild` runs it: a plain `node`
 * process in a working directory. Each run gets a scratch directory as its
 * root, so the real public/ is never touched.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "litepaper-assets.mjs");
const FIXTURE = path.resolve(__dirname, "../test/fixtures/litepaper");

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "litepaper-assets-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    // A blank LITEPAPER_DIR is the default, whatever the suite was run with.
    env: { ...process.env, LITEPAPER_DIR: "", ...env },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const published = () =>
  readdirSync(path.join(root, "public/litepaper"), { recursive: true })
    .map(String)
    .sort();

describe("litepaper-assets", () => {
  it("copies from LITEPAPER_DIR to public/litepaper under clean names", () => {
    const { code, out } = run({ LITEPAPER_DIR: FIXTURE });
    expect(code).toBe(0);
    expect(out).toContain("litepaper v0.5 (2026-09-27): published 5 files");
    expect(published()).toEqual([
      "figures",
      "figures/figure-1.png",
      "orizon-agents-litepaper.docx",
      "orizon-agents-litepaper.html",
      "orizon-agents-litepaper.md",
      "orizon-agents-litepaper.pdf",
    ]);
    expect(
      readFileSync(
        path.join(root, "public/litepaper/orizon-agents-litepaper.pdf"),
      ),
    ).toEqual(readFileSync(path.join(FIXTURE, "Orizon-Agents-Litepaper.pdf")));
  });

  it("reads litepaper/ under the working directory by default", () => {
    cpSync(FIXTURE, path.join(root, "litepaper"), { recursive: true });
    const { code, out } = run();
    expect(code).toBe(0);
    expect(out).toContain("from litepaper to public/litepaper/");
  });

  it("fails the build, writing nothing, when litepaper/ is missing", () => {
    const { code, err } = run();
    expect(code).toBe(1);
    expect(err).toContain("litepaper: the litepaper cannot be published.");
    expect(err).toContain("the folder is missing");
    expect(existsSync(path.join(root, "public/litepaper"))).toBe(false);
  });

  it("fails the build, and keeps the last copy, when an artifact is missing", () => {
    expect(run({ LITEPAPER_DIR: FIXTURE }).code).toBe(0);
    const source = path.join(root, "book");
    cpSync(FIXTURE, source, { recursive: true });
    rmSync(path.join(source, "Orizon-Agents-Litepaper.docx"));
    const { code, err } = run({ LITEPAPER_DIR: source });
    expect(code).toBe(1);
    expect(err).toContain(
      "the DOCX file Orizon-Agents-Litepaper.docx is missing or empty",
    );
    expect(published()).toContain("orizon-agents-litepaper.docx");
  });

  it("clears a stale file from the last copy", () => {
    mkdirSync(path.join(root, "public/litepaper/figures"), { recursive: true });
    writeFileSync(path.join(root, "public/litepaper/figures/old.png"), "x");
    expect(run({ LITEPAPER_DIR: FIXTURE }).code).toBe(0);
    expect(published()).not.toContain("figures/old.png");
  });
});
