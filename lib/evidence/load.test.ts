/**
 * The loader reads the index from EVIDENCE_CONTENT_DIR (default
 * content/evidence) and refuses to hand the page anything the validator
 * rejects: a bad index fails the build with every problem listed.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceContentError, evidencePaths, loadEvidence } from "./load";

const FIXTURE_DIR = path.resolve(__dirname, "../../test/fixtures/evidence");
let scratch: string | null = null;

function writeIndex(contents: string) {
  scratch = mkdtempSync(path.join(tmpdir(), "evidence-"));
  writeFileSync(path.join(scratch, "index.json"), contents);
  return evidencePaths({ EVIDENCE_CONTENT_DIR: scratch });
}

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

describe("evidencePaths", () => {
  it("defaults to content/evidence/index.json", () => {
    expect(evidencePaths({}).file).toBe(
      path.resolve(process.cwd(), "content/evidence/index.json"),
    );
  });

  it("follows EVIDENCE_CONTENT_DIR, ignoring a blank one", () => {
    expect(
      evidencePaths({ EVIDENCE_CONTENT_DIR: "test/fixtures/evidence" }).file,
    ).toBe(path.join(FIXTURE_DIR, "index.json"));
    expect(evidencePaths({ EVIDENCE_CONTENT_DIR: "  " }).file).toBe(
      path.resolve(process.cwd(), "content/evidence/index.json"),
    );
  });
});

describe("loadEvidence", () => {
  it("loads the fixture", () => {
    const index = loadEvidence(
      evidencePaths({ EVIDENCE_CONTENT_DIR: FIXTURE_DIR }),
    );
    expect(index.title).toBe("Fixture evidence index");
    expect(index.deliverables.map((d) => d.id)).toEqual([
      "D1",
      "D2",
      "D3",
      "D4",
      "RD",
    ]);
  });

  it("loads the committed index by default", () => {
    expect(loadEvidence().schema).toBe("orizon.evidence-index/1");
  });

  it("fails on a missing index", () => {
    expect(() =>
      loadEvidence(evidencePaths({ EVIDENCE_CONTENT_DIR: "no-such-dir" })),
    ).toThrow(
      /no-such-dir\/index\.json: the evidence page cannot be published\.\n {2}- the index is missing$/,
    );
  });

  it("fails on invalid JSON", () => {
    const paths = writeIndex("{ nope");
    expect(() => loadEvidence(paths)).toThrow(/it is not valid JSON/);
  });

  it("lists every problem in the error", () => {
    const paths = writeIndex(
      JSON.stringify({ schema: "wrong", title: "", extra: 1 }),
    );
    let error: unknown;
    try {
      loadEvidence(paths);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EvidenceContentError);
    const { problems, message } = error as EvidenceContentError;
    expect(problems.length).toBeGreaterThan(5);
    expect(problems).toContain(
      'the index has an unknown key "extra"; allowed: schema, title, sow, snapshot, deliverables, metrics, disclosures, notes, removed_metrics',
    );
    for (const p of problems) expect(message).toContain(`  - ${p}`);
  });
});
