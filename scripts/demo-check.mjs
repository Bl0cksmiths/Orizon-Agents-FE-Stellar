#!/usr/bin/env node
/**
 * Checks the demo manifest, content/demo/demo.json, by the same rules
 * `next build` applies (lib/demo/validate.mjs), and optionally a local video
 * file's running time.
 *
 *   npm run demo:check
 *   npm run demo:check -- --video ~/renders/orizon-demo.mp4
 *
 * With --video, ffprobe measures the file. It must run 180–300 s inclusive
 * (the story's 3–5 minutes), and when the manifest is published its
 * `duration_seconds` must match the file to the second. Without ffprobe the
 * duration is NOT verified: the script says so and exits 3, never 0, so a
 * missing tool cannot read as a pass.
 *
 * DEMO_CONTENT_DIR and DEMO_PUBLIC_DIR point it elsewhere, as for the page.
 *
 * Exit codes: 0 all checks passed · 1 a check failed · 2 bad usage ·
 * 3 the video's duration could not be verified.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  validateDemoManifest,
} from "../lib/demo/validate.mjs";

const USAGE = "usage: demo-check [--video <file>]";

function parseArgs(argv) {
  const args = { video: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--video") {
      const file = argv[++i];
      if (!file || file.startsWith("--")) return null;
      args.video = file;
    } else if (argv[i].startsWith("--video=")) {
      args.video = argv[i].slice("--video=".length);
      if (!args.video) return null;
    } else {
      return null;
    }
  }
  return args;
}

function checkManifest(env) {
  const root = process.cwd();
  const contentDir = path.resolve(
    root,
    env.DEMO_CONTENT_DIR?.trim() || "content/demo",
  );
  const publicDir = path.resolve(root, env.DEMO_PUBLIC_DIR?.trim() || "public");
  const file = path.join(contentDir, "demo.json");
  const shown = path.relative(root, file) || file;
  if (!existsSync(file)) {
    return { shown, problems: ["the manifest is missing"], raw: null };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return {
      shown,
      problems: [`it is not valid JSON: ${error.message}`],
      raw: null,
    };
  }
  const { problems } = validateDemoManifest(raw, {
    root,
    contentDir,
    publicDir,
  });
  return { shown, problems, raw };
}

/** The file's duration in seconds, "missing-tool", or an error message. */
function probe(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { encoding: "utf8" },
  );
  if (result.error?.code === "ENOENT") return { missingTool: true };
  if (result.error) return { error: result.error.message };
  if (result.status !== 0) {
    return { error: (result.stderr || "ffprobe failed").trim() };
  }
  const seconds = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(seconds)) {
    return { error: `ffprobe reported no duration (${result.stdout.trim()})` };
  }
  return { seconds };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    return 2;
  }

  const { shown, problems, raw } = checkManifest(process.env);
  if (problems.length) {
    console.error(`FAIL  ${shown}: the demo page cannot be published.`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  if (raw.status === "published") {
    const { video, chapters, evidence } = raw;
    console.log(
      `  ok  ${shown}: published — youtube ${video.id}, ${video.duration_seconds} s, ${chapters.length} chapters, ${evidence.items.length} evidence items`,
    );
  } else {
    console.log(
      `  ok  ${shown}: unpublished — no video and no evidence, so the page shows neither`,
    );
  }

  if (!args.video) return 0;

  const file = path.resolve(args.video);
  if (!existsSync(file)) {
    console.error(`FAIL  video: ${args.video} does not exist`);
    return 1;
  }
  const measured = probe(file);
  if (measured.missingTool) {
    console.error(
      `NOT VERIFIED  video: ffprobe is not installed, so the running time of ${args.video} was not checked. Install ffmpeg and run this again.`,
    );
    return 3;
  }
  if (measured.error) {
    console.error(
      `FAIL  video: ffprobe could not read ${args.video}: ${measured.error}`,
    );
    return 1;
  }
  const { seconds } = measured;
  const shownSeconds = seconds.toFixed(2);
  if (seconds < MIN_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) {
    console.error(
      `FAIL  video: ${args.video} runs ${shownSeconds} s; the demo must run 3 to 5 minutes (${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} s inclusive)`,
    );
    return 1;
  }
  if (
    raw.status === "published" &&
    Math.abs(seconds - raw.video.duration_seconds) > 1
  ) {
    console.error(
      `FAIL  video: ${args.video} runs ${shownSeconds} s but the manifest says ${raw.video.duration_seconds} s`,
    );
    return 1;
  }
  console.log(`  ok  video: ${args.video} runs ${shownSeconds} s`);
  return 0;
}

process.exitCode = main();
