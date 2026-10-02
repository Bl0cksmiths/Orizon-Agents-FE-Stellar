/**
 * scripts/demo-check.mjs, run as a reviewer would run it. ffprobe is faked
 * with a one-line shell script on PATH, so the duration rules are tested
 * without a real video, and its absence is tested by leaving it off PATH.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/**
 * A PATH holding only a fake ffprobe that reports `seconds` for every file,
 * or, given a map, the seconds for each file's name (its last argument).
 */
function fakeFfprobe(seconds: string | Record<string, string>): string {
  const bin = path.join(tmp, "bin");
  mkdirSync(bin, { recursive: true });
  const exe = path.join(bin, "ffprobe");
  const body =
    typeof seconds === "string"
      ? `echo ${seconds}`
      : [
          "for f; do :; done",
          'case "${f##*/}" in',
          ...Object.entries(seconds).map(
            ([name, s]) => `  ${name}) echo ${s} ;;`,
          ),
          "esac",
        ].join("\n");
  writeFileSync(exe, `#!/bin/sh\n${body}\n`);
  chmodSync(exe, 0o755);
  return bin;
}

/** A stand-in video file named `name` in the temp directory. */
function file(name: string): string {
  const p = path.join(tmp, name);
  writeFileSync(p, "not really a video");
  return p;
}

function run(
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      // An empty PATH by default: no ffprobe, whatever the machine has.
      PATH: path.join(tmp, "empty"),
      // The unpublished fixture by default, so a lone --video is measured
      // against the length rule alone, not held to the committed parts.
      DEMO_CONTENT_DIR: path.join(FIXTURES, "unpublished"),
      ...env,
    },
  });
  return { status: result.status, out: result.stdout + result.stderr };
}

const published = {
  DEMO_CONTENT_DIR: path.join(FIXTURES, "published"),
  DEMO_PUBLIC_DIR: path.join(FIXTURES, "public"),
};

describe("demo-check: the manifest", () => {
  it("passes the committed manifest, published in two parts", () => {
    // An empty DEMO_CONTENT_DIR falls back to content/demo.
    const { status, out } = run([], { DEMO_CONTENT_DIR: "" });
    expect(status).toBe(0);
    expect(out).toContain(
      "content/demo/demo.json: published — part 1 operator: youtube LM7iecSviSI, 189 s, 6 chapters; part 2 buyer: youtube 6NfblJwVEXg, 71 s, 8 chapters; 260 s together, 14 evidence items",
    );
  });

  it("passes an unpublished manifest", () => {
    const { status, out } = run([]);
    expect(status).toBe(0);
    expect(out).toContain(
      "unpublished — no part and no evidence, so the page shows neither",
    );
  });

  it("passes a complete published manifest", () => {
    const { status, out } = run([], published);
    expect(status).toBe(0);
    expect(out).toContain(
      "published — part 1 operator: youtube fixtureOpr1, 150 s, 3 chapters; part 2 buyer: youtube fixtureBuy2, 102 s, 3 chapters; 252 s together, 5 evidence items",
    );
  });

  it("fails with every problem listed, by the build's own rules", () => {
    writeFileSync(
      path.join(tmp, "demo.json"),
      JSON.stringify({
        status: "unpublished",
        parts: [{ id: "x" }],
        evidence: { generated_at: null, network: "public", items: [{}] },
      }),
    );
    const { status, out } = run([], { DEMO_CONTENT_DIR: tmp });
    expect(status).toBe(1);
    expect(out).toContain("the demo page cannot be published");
    expect(out).toContain(
      "  - parts must be empty while the demo is unpublished; it has 1",
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

  it("adds the files' running times together", () => {
    const a = file("a.mp4");
    const b = file("b.mp4");
    const PATH = fakeFfprobe({ "a.mp4": "189.2", "b.mp4": "70.8" });
    const { status, out } = run(["--video", a, `--video=${b}`], { PATH });
    expect(status).toBe(0);
    expect(out).toContain("the files run 260.00 s together");

    // One part alone is too short to be the demo.
    const short = run(["--video", b], { PATH });
    expect(short.status).toBe(1);
    expect(short.out).toContain(
      "the files run 70.80 s together; the demo must run 3 to 5 minutes",
    );
  });

  it("holds each published part's duration to its own file, in order", () => {
    const operator = file("operator.mp4");
    const buyer = file("buyer.mp4");
    const PATH = fakeFfprobe({ "operator.mp4": "150.4", "buyer.mp4": "101.6" });

    const on = run(["--video", operator, "--video", buyer], {
      ...published,
      PATH,
    });
    expect(on.status).toBe(0);
    expect(on.out).toContain("the files run 252.00 s together");

    const swapped = run(["--video", buyer, "--video", operator], {
      ...published,
      PATH,
    });
    expect(swapped.status).toBe(1);
    expect(swapped.out).toContain(
      "runs 101.60 s but the manifest says part 1 runs 150 s",
    );
  });

  it("wants one file per published part", () => {
    const { status, out } = run(["--video", video], {
      ...published,
      PATH: fakeFfprobe("252"),
    });
    expect(status).toBe(1);
    expect(out).toContain(
      "give one --video per part, in order; the manifest has 2 parts and 1 files were given",
    );
  });

  it("fails on a file that is not there", () => {
    const { status, out } = run(["--video", path.join(tmp, "nope.mp4")], {
      PATH: fakeFfprobe("240"),
    });
    expect(status).toBe(1);
    expect(out).toContain("does not exist");
  });
});
