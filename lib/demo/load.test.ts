/**
 * Unit tests for lib/demo/load.ts: reading the manifest, failing the build on
 * a bad one, and handing the page only what a state allows.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_DIR,
  DemoContentError,
  demoPaths,
  loadDemo,
  type DemoPaths,
} from "./load";

const FIXTURES = path.resolve(__dirname, "../../test/fixtures/demo");
const fixture = (state: "published" | "unpublished") =>
  demoPaths({
    DEMO_CONTENT_DIR: path.join(FIXTURES, state),
    DEMO_PUBLIC_DIR: path.join(FIXTURES, "public"),
  });

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

function tmpManifest(contents: string): DemoPaths {
  tmp = mkdtempSync(path.join(tmpdir(), "demo-load-"));
  writeFileSync(path.join(tmp, "demo.json"), contents);
  return demoPaths({ DEMO_CONTENT_DIR: tmp });
}

describe("demoPaths", () => {
  it("defaults to content/demo and public under the project", () => {
    const paths = demoPaths({});
    expect(paths.contentDir).toBe(path.resolve(DEFAULT_DEMO_DIR));
    expect(paths.publicDir).toBe(path.resolve("public"));
    expect(paths.manifest).toBe(path.resolve("content/demo/demo.json"));
  });

  it("follows DEMO_CONTENT_DIR and DEMO_PUBLIC_DIR", () => {
    const paths = demoPaths({
      DEMO_CONTENT_DIR: "test/fixtures/demo/published",
      DEMO_PUBLIC_DIR: "test/fixtures/demo/public",
    });
    expect(paths.manifest).toBe(
      path.resolve("test/fixtures/demo/published/demo.json"),
    );
    expect(paths.publicDir).toBe(path.resolve("test/fixtures/demo/public"));
  });
});

describe("loadDemo", () => {
  it("passes the committed manifest, which is unpublished until the video exists", () => {
    expect(loadDemo(demoPaths({}))).toEqual({ status: "unpublished" });
  });

  it("hands an unpublished page nothing but its state", () => {
    expect(loadDemo(fixture("unpublished"))).toEqual({ status: "unpublished" });
  });

  it("loads a published manifest with its transcript and captions", () => {
    const demo = loadDemo(fixture("published"));
    if (demo.status !== "published") throw new Error("expected published");
    expect(demo.video.id).toBe("fixtureVid0");
    expect(demo.chapters).toHaveLength(6);
    expect(demo.evidence.items.map((i) => i.kind)).toEqual([
      "register",
      "authorize",
      "settle",
      "dispute_rating",
      "refund",
    ]);
    expect(demo.captionsHref).toBe("/demo/demo.en.vtt");
    expect(demo.transcript.type).toBe("root");
    expect(demo.transcript.children.length).toBeGreaterThan(0);
  });

  it("fails the build when the manifest is missing", () => {
    tmp = mkdtempSync(path.join(tmpdir(), "demo-load-"));
    expect(() => loadDemo(demoPaths({ DEMO_CONTENT_DIR: tmp! }))).toThrow(
      /demo\.json: the demo page cannot be published\.\n {2}- the manifest is missing/,
    );
  });

  it("fails the build on JSON that does not parse", () => {
    expect(() => loadDemo(tmpManifest("{ status: "))).toThrow(
      /the demo page cannot be published\.\n {2}- it is not valid JSON/,
    );
  });

  it("fails the build with every problem listed", () => {
    const paths = tmpManifest(
      JSON.stringify({
        status: "unpublished",
        video: { id: "x" },
        chapters: [],
        evidence: { generated_at: null, network: "mainnet", items: [{}] },
        transcript_file: null,
        captions_file: null,
      }),
    );
    let error: unknown;
    try {
      loadDemo(paths);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DemoContentError);
    const { problems, message } = error as DemoContentError;
    expect(problems).toHaveLength(3);
    for (const p of problems) expect(message).toContain(`  - ${p}`);
    expect(problems[0]).toMatch(/^video must be null/);
    expect(problems[1]).toMatch(/^evidence\.network must be "testnet"/);
    expect(problems[2]).toMatch(/^evidence\.items must be empty/);
  });
});
