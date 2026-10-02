#!/usr/bin/env node
/**
 * Checks the demo manifest, content/demo/demo.json, by the same rules
 * `next build` applies (lib/demo/validate.mjs), and optionally the running
 * time of the local video files, one per part.
 *
 *   npm run demo:check
 *   npm run demo:check -- --video ~/renders/operator.mp4 --video ~/renders/buyer.mp4
 *
 * With --video, ffprobe measures each file. Together they must run 180–300 s
 * inclusive (the story's 3–5 minutes), and when the manifest is published
 * there is one file per part, in order, and each part's `duration_seconds`
 * must match its file to the second. Without ffprobe the duration is NOT
 * verified: the script says so and exits 3, never 0, so a missing tool cannot
 * read as a pass.
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

const USAGE = "usage: demo-check [--video <file>]...";

function parseArgs(argv) {
  /** @type {{ videos: string[] }} */
  const args = { videos: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--video") {
      const file = argv[++i];
      if (!file || file.startsWith("--")) return null;
      args.videos.push(file);
    } else if (argv[i].startsWith("--video=")) {
      const file = argv[i].slice("--video=".length);
      if (!file) return null;
      args.videos.push(file);
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
    const { parts, evidence } = raw;
    const each = parts
      .map(
        (p, i) =>
          `part ${i + 1} ${p.role}: youtube ${p.id}, ${p.duration_seconds} s, ${p.chapters.length} chapters`,
      )
      .join("; ");
    const total = parts.reduce((sum, p) => sum + p.duration_seconds, 0);
    console.log(
      `  ok  ${shown}: published — ${each}; ${total} s together, ${evidence.items.length} evidence items`,
    );
  } else {
    console.log(
      `  ok  ${shown}: unpublished — no part and no evidence, so the page shows neither`,
    );
  }

  if (args.videos.length === 0) return 0;

  const parts = raw.status === "published" ? raw.parts : null;
  if (parts && args.videos.length !== parts.length) {
    console.error(
      `FAIL  video: give one --video per part, in order; the manifest has ${parts.length} parts and ${args.videos.length} files were given`,
    );
    return 1;
  }

  let total = 0;
  for (const [i, video] of args.videos.entries()) {
    const file = path.resolve(video);
    if (!existsSync(file)) {
      console.error(`FAIL  video: ${video} does not exist`);
      return 1;
    }
    const measured = probe(file);
    if (measured.missingTool) {
      console.error(
        `NOT VERIFIED  video: ffprobe is not installed, so the running time of ${video} was not checked. Install ffmpeg and run this again.`,
      );
      return 3;
    }
    if (measured.error) {
      console.error(
        `FAIL  video: ffprobe could not read ${video}: ${measured.error}`,
      );
      return 1;
    }
    const { seconds } = measured;
    const shownSeconds = seconds.toFixed(2);
    if (parts && Math.abs(seconds - parts[i].duration_seconds) > 1) {
      console.error(
        `FAIL  video: ${video} runs ${shownSeconds} s but the manifest says part ${i + 1} runs ${parts[i].duration_seconds} s`,
      );
      return 1;
    }
    console.log(`  ok  video: ${video} runs ${shownSeconds} s`);
    total += seconds;
  }
  const shownTotal = total.toFixed(2);
  if (total < MIN_DURATION_SECONDS || total > MAX_DURATION_SECONDS) {
    console.error(
      `FAIL  video: the files run ${shownTotal} s together; the demo must run 3 to 5 minutes (${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} s inclusive)`,
    );
    return 1;
  }
  console.log(`  ok  video: the files run ${shownTotal} s together`);
  return 0;
}

process.exitCode = main();
