/**
 * Unit tests for lib/guide/frontmatter.ts.
 *
 * The guide is "versioned with the API": its header names the backend commit
 * it was checked against and the date. So a missing or malformed field must
 * stop the build with a message an author can act on, and every bad field is
 * reported in one go rather than one per rebuild.
 */

import { describe, expect, it } from "vitest";
import {
  GuideContentError,
  parseFrontmatter,
  splitFrontmatter,
} from "./frontmatter";

const FILE = "content/guides/example.md";

const VALID = `title: List your agent on Orizon
description: Register, bind and get paid.
version: "1.2.0"
api_verified_against: 1e3c60d
network: testnet
updated: 2026-09-29
status: draft`;

function errorOf(fn: () => unknown): GuideContentError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GuideContentError);
    return err as GuideContentError;
  }
  throw new Error("expected a GuideContentError");
}

describe("splitFrontmatter", () => {
  it("separates the YAML from the body", () => {
    const { yaml, body } = splitFrontmatter(
      `---\n${VALID}\n---\n\n## Start\n`,
      FILE,
    );
    expect(yaml).toBe(VALID);
    expect(body).toBe("\n## Start\n");
  });

  it("accepts CRLF line endings and a byte-order mark", () => {
    const { body } = splitFrontmatter(`﻿---\r\ntitle: x\r\n---\r\nbody`, FILE);
    expect(body).toBe("body");
  });

  it("fails naming the file when there is no frontmatter", () => {
    const err = errorOf(() => splitFrontmatter("## Just a body\n", FILE));
    expect(err.message).toBe(
      `${FILE}: the guide cannot be published.\n  - it must start with a YAML frontmatter block between two \`---\` lines`,
    );
  });
});

describe("parseFrontmatter", () => {
  it("returns every field, with the date and sha kept as text", () => {
    expect(parseFrontmatter(VALID, FILE)).toEqual({
      title: "List your agent on Orizon",
      description: "Register, bind and get paid.",
      version: "1.2.0",
      api_verified_against: "1e3c60d",
      network: "testnet",
      updated: "2026-09-29",
      status: "draft",
    });
  });

  it("accepts validated and a full 40-character sha", () => {
    const meta = parseFrontmatter(
      VALID.replace("status: draft", "status: validated").replace(
        "1e3c60d",
        "e56a07a1e3c60de96e6ec758cf65ab59a1db9aa1",
      ),
      FILE,
    );
    expect(meta.status).toBe("validated");
    expect(meta.api_verified_against).toHaveLength(40);
  });

  it("lists every missing field in one message", () => {
    const err = errorOf(() => parseFrontmatter("title: Only a title", FILE));
    expect(err.message).toBe(
      [
        `${FILE}: the guide cannot be published.`,
        "  - description: missing",
        "  - network: missing",
        "  - version: missing",
        "  - api_verified_against: missing",
        "  - updated: missing",
        "  - status: missing",
      ].join("\n"),
    );
  });

  it.each([
    ['version: "1.2"', 'version: expected semver like "1.0.0", got "1.2"'],
    [
      "version: 1.2",
      "version: expected text, got 1.2 (number). Quote the value so YAML keeps it as text",
    ],
    [
      "api_verified_against: main",
      'api_verified_against: expected a git commit sha (7 to 40 lowercase hex characters), got "main"',
    ],
    [
      "api_verified_against: 1234567",
      "api_verified_against: expected text, got 1234567 (number). Quote the value so YAML keeps it as text",
    ],
    [
      "updated: 2026-02-30",
      'updated: expected an ISO date like "2026-09-29", got "2026-02-30"',
    ],
    [
      "updated: 29/09/2026",
      'updated: expected an ISO date like "2026-09-29", got "29/09/2026"',
    ],
    [
      "status: published",
      'status: expected "draft" or "validated", got "published"',
    ],
    ['title: "  "', "title: empty"],
  ])("rejects %s", (line, problem) => {
    const key = line.split(":")[0];
    const yaml = VALID.split("\n")
      .map((l) => (l.startsWith(`${key}:`) ? line : l))
      .join("\n");
    const err = errorOf(() => parseFrontmatter(yaml, FILE));
    expect(err.message).toBe(
      `${FILE}: the guide cannot be published.\n  - ${problem}`,
    );
  });

  it("rejects a field the dialect does not define, catching typos", () => {
    const err = errorOf(() =>
      parseFrontmatter(`${VALID}\napi_verified_againt: abc1234`, FILE),
    );
    expect(err.message).toContain(
      "  - api_verified_againt: not a guide field (expected only title, description, version, api_verified_against, network, updated, status)",
    );
  });

  it("rejects YAML that does not parse, or is not a mapping", () => {
    expect(errorOf(() => parseFrontmatter("title: [", FILE)).message).toMatch(
      /the frontmatter is not valid YAML: /,
    );
    expect(errorOf(() => parseFrontmatter("- a\n- b", FILE)).message).toContain(
      "the frontmatter must be a YAML mapping of fields",
    );
  });
});
