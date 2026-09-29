/**
 * scripts/demo-check.mjs, run as a reviewer would run it. ffprobe is faked
 * with a one-line shell script on PATH, so the duration rules are tested
 * without a real video, and its absence is tested by leaving it off PATH.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "demo-check.mjs");
const FIXTURES = path.resolve(__dirname, "../test/fixtures/demo");

let tmp: string;
let video: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "demo-check-"));
  video = path.join(tmp, "demo.mp4");
  writeFileSync(video, "not really a video");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A PATH holding only a fake ffprobe that reports `seconds`. */
function fakeFfprobe(seconds: string): string {
  const bin = path.join(tmp, "bin");
  spawnSync("mkdir", ["-p", bin]);
  const exe = path.join(bin, "ffprobe");
  writeFileSync(exe, `#!/bin/sh\necho ${seconds}\n`);
  chmodSync(exe, 0o755);
  return bin;
}

function run(
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    // An empty PATH by default: no ffprobe, whatever the machine has.
    env: { PATH: path.join(tmp, "empty"), ...env },
  });
  return { status: result.status, out: result.stdout + result.stderr };
}

const published = {
  DEMO_CONTENT_DIR: path.join(FIXTURES, "published"),
  DEMO_PUBLIC_DIR: path.join(FIXTURES, "public"),
};

describe("demo-check: the manifest", () => {
  it("passes the committed, unpublished manifest", () => {
    const { status, out } = run([]);
    expect(status).toBe(0);
    expect(out).toContain("content/demo/demo.json: unpublished");
  });

  it("passes a complete published manifest", () => {
    const { status, out } = run([], published);
    expect(status).toBe(0);
    expect(out).toContain(
      "published — youtube fixtureVid0, 252 s, 6 chapters, 5 evidence items",
    );
  });

  it("fails with every problem listed, by the build's own rules", () => {
    writeFileSync(
      path.join(tmp, "demo.json"),
      JSON.stringify({
        status: "unpublished",
        video: { id: "x" },
        chapters: [],
        evidence: { generated_at: null, network: "public", items: [{}] },
        transcript_file: null,
        captions_file: null,
      }),
    );
    const { status, out } = run([], { DEMO_CONTENT_DIR: tmp });
    expect(status).toBe(1);
    expect(out).toContain("the demo page cannot be published");
    expect(out).toContain(
      "  - video must be null while the demo is unpublished",
    );
    expect(out).toContain('  - evidence.network must be "testnet"');
    expect(out).toContain("  - evidence.items must be empty");
  });

  it("rejects an unknown argument", () => {
    expect(run(["--vdeo", video]).status).toBe(2);
    expect(run(["--video"]).status).toBe(2);
  });
});

describe("demo-check: the video's running time", () => {
  it("says NOT VERIFIED and exits 3, never 0, without ffprobe", () => {
    const { status, out } = run(["--video", video]);
    expect(status).toBe(3);
    expect(out).toContain("NOT VERIFIED");
    expect(out).toContain("ffprobe is not installed");
  });

  it.each(["180", "240.3", "300"])("accepts %s s", (seconds) => {
    const { status, out } = run(["--video", video], {
      PATH: fakeFfprobe(seconds),
    });
    expect(status).toBe(0);
    expect(out).toContain(`runs ${Number(seconds).toFixed(2)} s`);
  });

  it.each(["179.9", "300.5"])("rejects %s s", (seconds) => {
    const { status, out } = run(["--video", video], {
      PATH: fakeFfprobe(seconds),
    });
    expect(status).toBe(1);
    expect(out).toContain("the demo must run 3 to 5 minutes");
  });

  it("holds a published manifest's duration to the file's", () => {
    const off = run(["--video", video], {
      ...published,
      PATH: fakeFfprobe("240"),
    });
    expect(off.status).toBe(1);
    expect(off.out).toContain("runs 240.00 s but the manifest says 252 s");

    const on = run(["--video", video], {
      ...published,
      PATH: fakeFfprobe("252.4"),
    });
    expect(on.status).toBe(0);
  });

  it("fails on a file that is not there", () => {
    const { status, out } = run(["--video", path.join(tmp, "nope.mp4")], {
      PATH: fakeFfprobe("240"),
    });
    expect(status).toBe(1);
    expect(out).toContain("does not exist");
  });
});
