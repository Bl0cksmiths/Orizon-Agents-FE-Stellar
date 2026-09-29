/**
 * The published "List your agent on Orizon" guide (story 5.03), held to the
 * acceptance criteria a later edit could otherwise quietly break: the trust
 * boundaries it must state, the 1.03 error codes with a remedy each, the link
 * to the reference agent, and full coverage of the operator friction log.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_GUIDE_DIR, loadGuide } from "./load";
import { textOf } from "./parse";

const SLUG = "list-your-agent";
const SOURCE = readFileSync(path.join(DEFAULT_GUIDE_DIR, `${SLUG}.md`), "utf8");
const FRICTION_MAP: Record<string, string> = JSON.parse(
  readFileSync(
    path.join(DEFAULT_GUIDE_DIR, `${SLUG}.friction-map.json`),
    "utf8",
  ),
);

function guide() {
  const loaded = loadGuide(SLUG, DEFAULT_GUIDE_DIR);
  if (!loaded) throw new Error(`${SLUG} did not load`);
  return loaded;
}

function section(heading: string, next: RegExp): string {
  const start = SOURCE.indexOf(heading);
  expect(start, `missing section ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = SOURCE.slice(start + heading.length);
  const end = rest.search(next);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the published operator guide", () => {
  it("parses cleanly for testnet, pinned to one backend commit", () => {
    const { meta, warnings } = guide();
    expect(warnings).toEqual([]);
    expect(meta.network).toBe("testnet");
    expect(meta.api_verified_against).toMatch(/^[0-9a-f]{40}$/);
  });

  it("states every trust boundary the story names", () => {
    const toc = guide().toc.map((entry) => entry.id);
    expect(toc).toContain("trust-boundaries");
    const trust = section("## Trust boundaries", /^## /m);
    expect(trust).toMatch(/\*\*off-chain\*\*/);
    expect(trust).toMatch(/settler/);
    expect(trust).toMatch(/scorer/);
    expect(trust).toMatch(/sealer/);
    expect(trust).toMatch(/The platform decides disputes/);
    expect(trust).toMatch(/funds every credit/);
  });

  it("names which key holds which role, with the v1 settler as the admin", () => {
    const trust = section("## Trust boundaries", /^## /m);
    expect(trust).toContain(
      "The platform's signing key (`GDB4N25…CDHP`) writes ratings (scorer), seals attestations (sealer) and pays " +
        "dispute credits, and it becomes the escrow's settler once escrow v2 is deployed. The deployed v1 escrow's " +
        "settler is the admin key (`GA7AI5…5OQV`).",
    );
    // The live v1 escrow's settler is the admin key, so no line anywhere may
    // say one key signs settling, rating and sealing alike.
    expect(SOURCE).not.toMatch(/one (platform )?key signs all three/i);
    expect(SOURCE).not.toMatch(/same key is the escrow's settler/i);
  });

  it.each(["id_malformed", "id_reserved", "id_taken"])(
    "documents %s with what it means and what to do",
    (code) => {
      const table = section("### Choose an agent id", /^### /m);
      const row = table
        .split("\n")
        .find((line) => line.startsWith(`| \`${code}\``));
      expect(row, `no table row for ${code}`).toBeDefined();
      const [, meaning, remedy] = row!
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      expect(meaning.length).toBeGreaterThan(10);
      expect(remedy.length).toBeGreaterThan(10);
    },
  );

  it("links the reference agent as the fastest path", () => {
    expect(SOURCE).toContain(
      "https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar",
    );
  });

  it("covers every friction log entry, each at a section that exists", () => {
    const ids = Object.keys(FRICTION_MAP).sort();
    const expected = ids.map((_, i) => `F-${String(i + 1).padStart(3, "0")}`);
    expect(ids).toEqual(expected);

    const anchors = new Set(guide().toc.map((entry) => `#${entry.id}`));
    const coverage = section("## Friction log coverage", /^## /m);
    for (const [id, where] of Object.entries(FRICTION_MAP)) {
      expect(coverage, `${id} missing from the coverage table`).toContain(
        `| ${id} |`,
      );
      if (where !== "known-issues")
        expect(anchors, `${id} → ${where}`).toContain(where);
    }
    const unresolved = Object.entries(FRICTION_MAP).filter(
      ([, where]) => where === "known-issues",
    );
    const known = section("## Known issues", /^## /m);
    for (const [id] of unresolved)
      expect(known, `${id} not in Known issues`).toContain(id);
  });

  it("reads as the full guide once rendered, with no wallet or session involved", () => {
    const text = textOf(guide().tree);
    expect(text).toContain("Trust boundaries");
    expect(text).toContain("id_taken");
    expect(text.length).toBeGreaterThan(20_000);
  });
});
