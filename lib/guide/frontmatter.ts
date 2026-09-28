/**
 * The guide's YAML frontmatter: split it off the body and validate it.
 *
 * Validation runs at build time (the guide route is statically rendered), so
 * every problem here fails `next build` with one message that names the file
 * and lists every bad field at once. A guide that renders with a missing
 * version or an unparseable date would publish a page that claims nothing
 * about which API it was checked against, which is the one thing it must say.
 */

import { parse as parseYaml } from "yaml";

export type GuideStatus = "draft" | "validated";

export type GuideMeta = {
  title: string;
  description: string;
  /** Semver, e.g. "1.0.0". */
  version: string;
  /** The backend commit the guide was last verified against (7–40 hex). */
  api_verified_against: string;
  network: string;
  /** ISO calendar date, YYYY-MM-DD. */
  updated: string;
  status: GuideStatus;
};

/** A content problem that must stop the build. The message is for authors. */
export class GuideContentError extends Error {
  constructor(file: string, problems: string[]) {
    super(
      `${file}: the guide cannot be published.\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "GuideContentError";
  }
}

const FIELDS = [
  "title",
  "description",
  "version",
  "api_verified_against",
  "network",
  "updated",
  "status",
] as const;

// semver.org's grammar, minus the leading-zero and build-metadata subtleties
// nobody writes by hand.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA = /^[0-9a-f]{7,40}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Split `---`-fenced YAML off the top of the file. */
export function splitFrontmatter(
  source: string,
  file: string,
): { yaml: string; body: string } {
  const text = source.replace(/^﻿/, "");
  const match = FRONTMATTER.exec(text);
  if (!match) {
    throw new GuideContentError(file, [
      "it must start with a YAML frontmatter block between two `---` lines",
    ]);
  }
  return { yaml: match[1], body: text.slice(match[0].length) };
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return `${String(value)} (${typeof value})`;
}

function isRealDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

/** Parse and validate the frontmatter, reporting every problem together. */
export function parseFrontmatter(yaml: string, file: string): GuideMeta {
  let data: unknown;
  try {
    data = parseYaml(yaml);
  } catch (err) {
    throw new GuideContentError(file, [
      `the frontmatter is not valid YAML: ${(err as Error).message.split("\n")[0]}`,
    ]);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GuideContentError(file, [
      "the frontmatter must be a YAML mapping of fields",
    ]);
  }
  const record = data as Record<string, unknown>;
  const problems: string[] = [];

  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      problems.push(
        `${key}: not a guide field (expected only ${FIELDS.join(", ")})`,
      );
    }
  }

  const str = (key: (typeof FIELDS)[number]): string | null => {
    const value = record[key];
    if (value === undefined) {
      problems.push(`${key}: missing`);
      return null;
    }
    if (typeof value !== "string") {
      problems.push(
        `${key}: expected text, got ${describeValue(value)}. Quote the value so YAML keeps it as text`,
      );
      return null;
    }
    if (!value.trim()) {
      problems.push(`${key}: empty`);
      return null;
    }
    return value.trim();
  };

  const title = str("title");
  const description = str("description");
  const network = str("network");

  const version = str("version");
  if (version !== null && !SEMVER.test(version)) {
    problems.push(
      `version: expected semver like "1.0.0", got ${describeValue(version)}`,
    );
  }

  const sha = str("api_verified_against");
  if (sha !== null && !SHA.test(sha)) {
    problems.push(
      `api_verified_against: expected a git commit sha (7 to 40 lowercase hex characters), got ${describeValue(sha)}`,
    );
  }

  const updated = str("updated");
  if (updated !== null && !isRealDate(updated)) {
    problems.push(
      `updated: expected an ISO date like "2026-09-29", got ${describeValue(updated)}`,
    );
  }

  const status = str("status");
  if (status !== null && status !== "draft" && status !== "validated") {
    problems.push(
      `status: expected "draft" or "validated", got ${describeValue(status)}`,
    );
  }

  if (problems.length) throw new GuideContentError(file, problems);

  return {
    title: title!,
    description: description!,
    version: version!,
    api_verified_against: sha!,
    network: network!,
    updated: updated!,
    status: status as GuideStatus,
  };
}
