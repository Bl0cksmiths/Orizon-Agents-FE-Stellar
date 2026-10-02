/**
 * The demo manifest's rules: content/demo/demo.json, checked at build.
 *
 * This lives in `.mjs` (not `.ts`) so `scripts/demo-check.mjs` can run the
 * very same checks under plain Node that `next build` runs through
 * lib/demo/load.ts. There is one rule book, not two that drift.
 *
 * The page's whole claim is that everything on it is real, so the rules are
 * about honesty first:
 *
 *   - an unpublished manifest carries no video and no evidence, so the page
 *     cannot show a player or a transaction before there is one;
 *   - a published one runs 3–5 minutes (the story's first acceptance
 *     criterion), its chapters sit inside the video, each chapter's
 *     deliverable tag names only what it shows (a deliverable the video does
 *     not show gets no chapter rather than a false one), and its evidence is the
 *     evidence tool's output verbatim: testnet only, every hash a real-looking
 *     transaction hash, every link the testnet Stellar Expert page for that
 *     exact hash, every item re-read on the network (`verified: true`), and at
 *     least one settlement, one dispute rating and one refund among them (the
 *     third acceptance criterion);
 *   - the transcript and captions it names exist where the page reads them.
 *
 * Every problem is collected, never just the first, so a failed build lists
 * everything that needs fixing at once. Unknown keys are problems too: the
 * contract is frozen, and a misspelt key would otherwise be silently ignored.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const DEMO_STATUSES = ["unpublished", "published"];
export const DELIVERABLES = ["D1", "D2", "D3", "D4"];
export const CHAPTER_DELIVERABLES = [...DELIVERABLES, "all"];
export const EVIDENCE_KINDS = [
  "register",
  "authorize",
  "settle",
  "seal",
  "rating",
  "dispute_rating",
  "refund",
  "other",
];
/** Kinds a published demo must evidence at least once (acceptance criterion 3). */
export const REQUIRED_KINDS = ["settle", "dispute_rating", "refund"];

/** The story's length rule, inclusive: 3 to 5 minutes. */
export const MIN_DURATION_SECONDS = 180;
export const MAX_DURATION_SECONDS = 300;

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const TX_HASH = /^[0-9a-f]{64}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TRANSCRIPT_EXTENSIONS = [".md", ".txt"];

const TOP_KEYS = [
  "status",
  "video",
  "chapters",
  "evidence",
  "transcript_file",
  "captions_file",
];
const VIDEO_KEYS = [
  "provider",
  "id",
  "title",
  "duration_seconds",
  "published_at",
];
const CHAPTER_KEYS = ["t", "title", "deliverable"];
const EVIDENCE_KEYS = ["generated_at", "network", "items"];
const ITEM_KEYS = [
  "label",
  "deliverable",
  "kind",
  "tx_hash",
  "explorer",
  "verified",
];

/** The one explorer link an evidence item may carry for `hash`. */
export function testnetTxUrl(hash) {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `${String(value)} (${typeof value})`;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownKeys(where, value, allowed, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      problems.push(
        `${where} has an unknown key "${key}"; allowed: ${allowed.join(", ")}`,
      );
    }
  }
}

function isRealDate(iso) {
  const m = ISO_DATE.exec(iso);
  if (!m) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3])
  );
}

/** Is `child` strictly inside the directory `parent` (both absolute)? */
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * @typedef {object} ValidateOptions
 * @property {string} root          the repository root manifest paths are relative to
 * @property {string} contentDir    the directory the manifest lives in; the transcript must be inside it
 * @property {string} publicDir     Next's static directory; captions must be inside its `demo/`
 */

function checkVideo(video, problems) {
  if (!isObject(video)) {
    problems.push(`video must be an object when published, not ${show(video)}`);
    return null;
  }
  unknownKeys("video", video, VIDEO_KEYS, problems);
  if (video.provider !== "youtube") {
    problems.push(
      `video.provider must be "youtube", not ${show(video.provider)}`,
    );
  }
  if (typeof video.id !== "string" || !YOUTUBE_ID.test(video.id)) {
    problems.push(
      `video.id must be an 11-character YouTube id (letters, digits, - and _), not ${show(video.id)}`,
    );
  }
  if (!nonEmptyString(video.title)) {
    problems.push(
      `video.title must be a non-empty string, not ${show(video.title)}`,
    );
  }
  const d = video.duration_seconds;
  let duration = null;
  if (!Number.isInteger(d)) {
    problems.push(
      `video.duration_seconds must be a whole number of seconds, not ${show(d)}`,
    );
  } else if (d < MIN_DURATION_SECONDS || d > MAX_DURATION_SECONDS) {
    problems.push(
      `video.duration_seconds is ${d}; the demo must run 3 to 5 minutes (${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} s inclusive)`,
    );
  } else {
    duration = d;
  }
  if (
    typeof video.published_at !== "string" ||
    !isRealDate(video.published_at)
  ) {
    problems.push(
      `video.published_at must be a calendar date like 2026-10-02, not ${show(video.published_at)}`,
    );
  }
  return duration;
}

function checkChapters(chapters, duration, problems) {
  if (!Array.isArray(chapters)) {
    problems.push(`chapters must be an array, not ${show(chapters)}`);
    return;
  }
  if (chapters.length === 0) {
    problems.push("chapters must list at least one chapter when published");
    return;
  }
  let previous = null;
  chapters.forEach((chapter, i) => {
    const where = `chapters[${i}]`;
    if (!isObject(chapter)) {
      problems.push(`${where} must be an object, not ${show(chapter)}`);
      return;
    }
    unknownKeys(where, chapter, CHAPTER_KEYS, problems);
    const t = chapter.t;
    if (!Number.isInteger(t) || t < 0) {
      problems.push(
        `${where}.t must be a whole number of seconds from 0, not ${show(t)}`,
      );
    } else {
      if (i === 0 && t !== 0) {
        problems.push(`chapters must start at 0; the first starts at ${t}`);
      }
      if (previous !== null && t <= previous) {
        problems.push(
          `${where}.t is ${t}, not after the chapter before it (${previous}); chapters must be in ascending order`,
        );
      }
      if (duration !== null && t >= duration) {
        problems.push(
          `${where}.t is ${t}, at or past the end of the ${duration} s video`,
        );
      }
      previous = t;
    }
    if (!nonEmptyString(chapter.title)) {
      problems.push(
        `${where}.title must be a non-empty string, not ${show(chapter.title)}`,
      );
    }
    if (!CHAPTER_DELIVERABLES.includes(chapter.deliverable)) {
      problems.push(
        `${where}.deliverable must be one of ${CHAPTER_DELIVERABLES.join(", ")}, not ${show(chapter.deliverable)}`,
      );
    }
  });
  // A tag says what the chapter shows on screen, so no deliverable is owed a
  // chapter: one the video does not show is left untagged, never faked. Its
  // proof lives on the evidence page instead.
}

function checkEvidence(evidence, published, problems) {
  if (!isObject(evidence)) {
    problems.push(`evidence must be an object, not ${show(evidence)}`);
    return;
  }
  unknownKeys("evidence", evidence, EVIDENCE_KEYS, problems);
  if (evidence.network !== "testnet") {
    problems.push(
      `evidence.network must be "testnet"; the demo is testnet only, not ${show(evidence.network)}`,
    );
  }
  const items = evidence.items;
  if (!Array.isArray(items)) {
    problems.push(`evidence.items must be an array, not ${show(items)}`);
    return;
  }
  if (!published) {
    if (items.length > 0) {
      problems.push(
        `evidence.items must be empty while the demo is unpublished; it has ${items.length}. Nothing may be shown as real before the video is`,
      );
    }
    return;
  }

  const g = evidence.generated_at;
  if (!Number.isInteger(g) || g <= 0) {
    problems.push(
      `evidence.generated_at must be the evidence run's Unix time in seconds, not ${show(g)}`,
    );
  }
  if (items.length === 0) {
    problems.push("evidence.items must not be empty when published");
  }
  const kinds = new Set();
  items.forEach((item, i) => {
    const where = `evidence.items[${i}]`;
    if (!isObject(item)) {
      problems.push(`${where} must be an object, not ${show(item)}`);
      return;
    }
    unknownKeys(where, item, ITEM_KEYS, problems);
    if (!nonEmptyString(item.label)) {
      problems.push(
        `${where}.label must be a non-empty string, not ${show(item.label)}`,
      );
    }
    if (!DELIVERABLES.includes(item.deliverable)) {
      problems.push(
        `${where}.deliverable must be one of ${DELIVERABLES.join(", ")}, not ${show(item.deliverable)}`,
      );
    }
    if (!EVIDENCE_KINDS.includes(item.kind)) {
      problems.push(
        `${where}.kind must be one of ${EVIDENCE_KINDS.join(", ")}, not ${show(item.kind)}`,
      );
    } else {
      kinds.add(item.kind);
    }
    const hashOk =
      typeof item.tx_hash === "string" && TX_HASH.test(item.tx_hash);
    if (!hashOk) {
      problems.push(
        `${where}.tx_hash must be 64 lowercase hex characters, not ${show(item.tx_hash)}`,
      );
    } else if (item.explorer !== testnetTxUrl(item.tx_hash)) {
      problems.push(
        `${where}.explorer must be exactly ${testnetTxUrl(item.tx_hash)}, not ${show(item.explorer)}`,
      );
    }
    if (item.verified !== true) {
      problems.push(
        `${where}.verified must be true (re-read on the network), not ${show(item.verified)}`,
      );
    }
  });
  const missing = REQUIRED_KINDS.filter((k) => !kinds.has(k));
  if (missing.length) {
    problems.push(
      `evidence.items must include at least one of each of ${REQUIRED_KINDS.join(", ")}; missing ${missing.join(", ")}`,
    );
  }
}

/**
 * A file the manifest names, checked: a relative path, inside `dir`, with one
 * of `extensions`, present and not empty. Returns its absolute path or null.
 */
function checkFile(key, value, dir, dirLabel, extensions, options, problems) {
  if (typeof value !== "string" || !value.trim()) {
    problems.push(`${key} must name a file when published, not ${show(value)}`);
    return null;
  }
  if (path.isAbsolute(value)) {
    problems.push(
      `${key} must be a repository-relative path, not ${show(value)}`,
    );
    return null;
  }
  const file = path.resolve(options.root, value);
  if (!isInside(dir, file)) {
    problems.push(
      `${key} must be a file under ${dirLabel}, not ${show(value)}`,
    );
    return null;
  }
  if (!extensions.includes(path.extname(file).toLowerCase())) {
    problems.push(
      `${key} must end in ${extensions.join(" or ")}, not ${show(value)}`,
    );
    return null;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    problems.push(`${key} names ${show(value)}, which does not exist`);
    return null;
  }
  if (!readFileSync(file, "utf8").trim()) {
    problems.push(`${key} names ${show(value)}, which is empty`);
    return null;
  }
  return file;
}

function label(dir, root) {
  const rel = path.relative(root, dir);
  return `${(rel || ".").split(path.sep).join("/")}/`;
}

/**
 * Check a parsed manifest. Returns every problem found; an empty list means
 * the manifest may be published as it stands.
 *
 * @param {unknown} raw the parsed demo.json
 * @param {ValidateOptions} options
 * @returns {{ problems: string[], transcriptPath: string | null, captionsPath: string | null }}
 */
export function validateDemoManifest(raw, options) {
  /** @type {string[]} */
  const problems = [];
  const none = { problems, transcriptPath: null, captionsPath: null };
  if (!isObject(raw)) {
    problems.push(`the manifest must be a JSON object, not ${show(raw)}`);
    return none;
  }
  unknownKeys("the manifest", raw, TOP_KEYS, problems);
  if (!DEMO_STATUSES.includes(raw.status)) {
    problems.push(
      `status must be "unpublished" or "published", not ${show(raw.status)}`,
    );
    return none;
  }
  const published = raw.status === "published";

  if (!published) {
    if (raw.video !== null) {
      problems.push(
        `video must be null while the demo is unpublished, not ${show(raw.video)}; publish it only once it is uploaded`,
      );
    }
    if (!Array.isArray(raw.chapters)) {
      problems.push(`chapters must be an array, not ${show(raw.chapters)}`);
    }
    checkEvidence(raw.evidence, false, problems);
    for (const key of ["transcript_file", "captions_file"]) {
      if (raw[key] !== null && typeof raw[key] !== "string") {
        problems.push(`${key} must be null or a path, not ${show(raw[key])}`);
      }
    }
    return none;
  }

  const duration = checkVideo(raw.video, problems);
  checkChapters(raw.chapters, duration, problems);
  checkEvidence(raw.evidence, true, problems);
  const transcriptPath = checkFile(
    "transcript_file",
    raw.transcript_file,
    options.contentDir,
    label(options.contentDir, options.root),
    TRANSCRIPT_EXTENSIONS,
    options,
    problems,
  );
  const captionsDir = path.join(options.publicDir, "demo");
  let captionsPath = checkFile(
    "captions_file",
    raw.captions_file,
    captionsDir,
    label(captionsDir, options.root),
    [".vtt"],
    options,
    problems,
  );
  if (
    captionsPath &&
    !/^(?:\uFEFF)?WEBVTT(?:[ \t]|\r?\n|$)/.test(
      readFileSync(captionsPath, "utf8"),
    )
  ) {
    problems.push(
      `captions_file names ${show(raw.captions_file)}, which is not WebVTT (it must start with "WEBVTT")`,
    );
    captionsPath = null;
  }
  return { problems, transcriptPath, captionsPath };
}
