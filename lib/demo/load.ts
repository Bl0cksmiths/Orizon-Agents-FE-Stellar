/**
 * Loads the demo page's manifest, content/demo/demo.json, at build time.
 *
 * The /demo route is statically generated, so this runs during `next build`
 * and never on a request. A manifest that breaks a rule in
 * lib/demo/validate.mjs throws a DemoContentError listing every problem, which
 * fails the build: the page is never published half-right.
 *
 * Two variables point the loader elsewhere, the way GUIDE_CONTENT_DIR does for
 * the guide. The Playwright suite uses them to serve fixture manifests in each
 * state without touching the real one:
 *
 *   DEMO_CONTENT_DIR  the directory holding demo.json and its transcript
 *                     (default content/demo)
 *   DEMO_PUBLIC_DIR   the static directory whose demo/ holds the captions
 *                     (default public)
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Root } from "hast";
import type { ChapterDeliverable, Deliverable, EvidenceKind } from "./display";
import { parseTranscript, transcriptFormat } from "./transcript";
import { validateDemoManifest } from "./validate.mjs";

export const DEFAULT_DEMO_DIR = "content/demo";
export const DEFAULT_PUBLIC_DIR = "public";
export const MANIFEST_NAME = "demo.json";

export type DemoVideo = {
  provider: "youtube";
  id: string;
  title: string;
  duration_seconds: number;
  published_at: string;
};

export type DemoChapter = {
  t: number;
  title: string;
  deliverable: ChapterDeliverable;
};

export type EvidenceItem = {
  label: string;
  deliverable: Deliverable;
  kind: EvidenceKind;
  tx_hash: string;
  explorer: string;
  verified: true;
};

export type DemoEvidence = {
  generated_at: number;
  network: "testnet";
  items: EvidenceItem[];
};

export type PublishedDemo = {
  status: "published";
  video: DemoVideo;
  chapters: DemoChapter[];
  evidence: DemoEvidence;
  /** The transcript, parsed and sanitised. */
  transcript: Root;
  /** Where the captions are served, e.g. /demo/orizon-demo.en.vtt. */
  captionsHref: string;
};

export type UnpublishedDemo = { status: "unpublished" };

export type LoadedDemo = PublishedDemo | UnpublishedDemo;

/** A manifest problem that must stop the build. The message is for authors. */
export class DemoContentError extends Error {
  constructor(
    file: string,
    /** Each problem on its own, so several checks can report together. */
    readonly problems: string[],
  ) {
    super(
      `${file}: the demo page cannot be published.\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "DemoContentError";
  }
}

export type DemoPaths = {
  root: string;
  contentDir: string;
  publicDir: string;
  manifest: string;
};

/** Where the manifest and its files are read from, all absolute. */
export function demoPaths(
  env: Record<string, string | undefined> = process.env,
): DemoPaths {
  const root = process.cwd();
  const contentDir = path.resolve(
    root,
    env.DEMO_CONTENT_DIR?.trim() || DEFAULT_DEMO_DIR,
  );
  const publicDir = path.resolve(
    root,
    env.DEMO_PUBLIC_DIR?.trim() || DEFAULT_PUBLIC_DIR,
  );
  return {
    root,
    contentDir,
    publicDir,
    manifest: path.join(contentDir, MANIFEST_NAME),
  };
}

/** Read and check the manifest. Throws DemoContentError on any problem. */
export function loadDemo(paths: DemoPaths = demoPaths()): LoadedDemo {
  const shown = path.relative(paths.root, paths.manifest) || paths.manifest;
  if (!existsSync(paths.manifest)) {
    throw new DemoContentError(shown, [
      "the manifest is missing; commit it in the unpublished state until the video exists",
    ]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.manifest, "utf8"));
  } catch (error) {
    throw new DemoContentError(shown, [
      `it is not valid JSON: ${(error as Error).message}`,
    ]);
  }
  const { problems, transcriptPath, captionsPath } = validateDemoManifest(
    raw,
    paths,
  );
  if (problems.length) throw new DemoContentError(shown, problems);

  const manifest = raw as {
    status: "published" | "unpublished";
    video: DemoVideo;
    chapters: DemoChapter[];
    evidence: DemoEvidence;
  };
  if (manifest.status === "unpublished") return { status: "unpublished" };

  // Validation passed, so both files exist inside their directories.
  const transcript = parseTranscript(
    readFileSync(transcriptPath!, "utf8"),
    transcriptFormat(transcriptPath!),
  );
  const captionsHref =
    "/" +
    path.relative(paths.publicDir, captionsPath!).split(path.sep).join("/");
  return {
    status: "published",
    video: manifest.video,
    chapters: manifest.chapters,
    evidence: manifest.evidence,
    transcript,
    captionsHref,
  };
}
