/**
 * Unit tests for lib/guide/parse.ts: Markdown in the guide dialect → the tree
 * the page renders.
 *
 * The rules under test are the ones a reader relies on without seeing: a
 * heading's id matching the one GitHub would give it (so links written
 * against the Markdown still land), raw HTML never reaching the page, a
 * callout recognised only by its exact bold label, and an expected response
 * staying attached to the sample it answers.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { GuideContentError } from "./frontmatter";
import { parseGuide, textOf, type CodeBlock } from "./parse";

const FILE = "content/guides/test.md";
const FRONT = `---
title: T
description: D
version: "1.0.0"
api_verified_against: abcdef1
network: testnet
updated: "2026-09-29"
status: draft
---
`;

const FIXTURE = path.resolve(
  __dirname,
  "../../test/fixtures/guides/list-your-agent.md",
);

function parse(body: string) {
  return parseGuide(FRONT + body, FILE);
}

function problemsOf(body: string): string {
  try {
    parse(body);
  } catch (err) {
    expect(err).toBeInstanceOf(GuideContentError);
    return (err as Error).message;
  }
  throw new Error("expected a GuideContentError");
}

function elements(tree: Root | Element): Element[] {
  const out: Element[] = [];
  const visit = (node: Root | Element) => {
    for (const child of node.children as RootContent[]) {
      if (child.type === "element") {
        out.push(child);
        visit(child);
      }
    }
  };
  visit(tree);
  return out;
}

const byTag = (tree: Root, tag: string) =>
  elements(tree).filter((e) => e.tagName === tag);

function codeBlocks(tree: Root): CodeBlock[] {
  return byTag(tree, "guide-code").map((e) => e.data!.guideCode!);
}

const bash = (id: string, title = id) =>
  `\`\`\`bash id="${id}" verify="live" title="${title}"\necho ${id}\n\`\`\`\n`;
const json = (id: string, title = id) =>
  `\`\`\`json id="${id}" title="${title}"\n{"ok": true}\n\`\`\`\n`;

describe("parseGuide: frontmatter", () => {
  it("returns the validated frontmatter", () => {
    expect(parse("Hello.\n").meta).toEqual({
      title: "T",
      description: "D",
      version: "1.0.0",
      api_verified_against: "abcdef1",
      network: "testnet",
      updated: "2026-09-29",
      status: "draft",
    });
  });

  it("fails on bad frontmatter before reading the body", () => {
    expect(() => parseGuide(FRONT.replace('"1.0.0"', '"one"'), FILE)).toThrow(
      `version: expected semver like "1.0.0", got "one"`,
    );
  });
});

describe("parseGuide: headings", () => {
  it("gives ## and ### GitHub-slugger ids and lists them as contents", () => {
    const { tree, toc } = parse(
      "## Before you start\n\n### Check `the` network!\n\n## Before you start\n\n#### Deep detail\n",
    );
    expect(toc).toEqual([
      { depth: 2, id: "before-you-start", text: "Before you start" },
      { depth: 3, id: "check-the-network", text: "Check the network!" },
      { depth: 2, id: "before-you-start-1", text: "Before you start" },
    ]);
    // A deeper heading is linkable, but not part of the contents.
    expect(byTag(tree, "h4")[0].properties.id).toBe("deep-detail");
    expect(byTag(tree, "h2").map((h) => h.properties.id)).toEqual([
      "before-you-start",
      "before-you-start-1",
    ]);
  });

  it("rejects an h1, since the title comes from the frontmatter", () => {
    expect(problemsOf("# A second title\n")).toContain(
      '"# A second title": the page title comes from the frontmatter; start sections at ##',
    );
  });
});

describe("parseGuide: code fences", () => {
  it("turns each fence into a guide-code block with its parsed info", () => {
    const [block] = codeBlocks(
      parse(
        '```python id="sign-it" verify="offline" title="Sign it"\nprint(1)\n\n```\n',
      ).tree,
    );
    expect(block).toEqual({
      fence: {
        lang: "python",
        id: "sign-it",
        title: "Sign it",
        verify: "offline",
        response: false,
      },
      code: "print(1)\n",
      responses: [],
      responseTo: null,
    });
  });

  it("keeps inline code as code", () => {
    const { tree } = parse("Send `X-API-Key` with it.\n");
    expect(byTag(tree, "code").map((c) => textOf(c))).toEqual(["X-API-Key"]);
  });

  it("fails the build on a fence outside the dialect, listing every one", () => {
    const message = problemsOf(
      '```\nplain\n```\n\n```ts id="a" verify="live" title="t"\nx\n```\n',
    );
    expect(message).toContain("a code fence has no info string");
    expect(message).toContain('language "ts" is not one of');
  });

  it("rejects a fence id used twice, or taken by a heading", () => {
    expect(problemsOf(bash("run") + "\n" + bash("run"))).toContain(
      'code block id "run" is already used by the code block "run"; ids must be unique on the page',
    );
    expect(problemsOf("## Run it\n\n" + bash("run-it"))).toContain(
      'code block id "run-it" is already used by the heading "Run it"',
    );
  });
});

describe("parseGuide: expected responses", () => {
  it("attaches a response written directly after its sample", () => {
    const { tree } = parse(bash("call") + "\n" + json("call-response"));
    const blocks = codeBlocks(tree);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fence.id).toBe("call");
    expect(blocks[0].responses.map((r) => r.fence.id)).toEqual([
      "call-response",
    ]);
  });

  it("attaches several responses in a row to the same sample", () => {
    const { tree } = parse(
      bash("call") + "\n" + json("ok-response") + "\n" + json("err-response"),
    );
    const [block] = codeBlocks(tree);
    expect(block.responses.map((r) => r.fence.id)).toEqual([
      "ok-response",
      "err-response",
    ]);
  });

  it("leaves a response after prose in place, naming its sample", () => {
    const { tree } = parse(
      bash("call", "Call it") + "\nIt answers:\n\n" + json("call-response"),
    );
    const blocks = codeBlocks(tree);
    expect(blocks.map((b) => b.fence.id)).toEqual(["call", "call-response"]);
    expect(blocks[0].responses).toEqual([]);
    expect(blocks[1].responseTo).toEqual({ id: "call", title: "Call it" });
  });

  it("attaches inside a list item, where steps usually live", () => {
    const { tree } = parse(
      "1. Run it:\n\n   " +
        bash("step").replace(/\n(?!$)/g, "\n   ") +
        "\n   " +
        json("step-response").replace(/\n(?!$)/g, "\n   "),
    );
    const [block] = codeBlocks(tree);
    expect(block.responses.map((r) => r.fence.id)).toEqual(["step-response"]);
  });

  it("fails when a response has no sample earlier in its section", () => {
    expect(
      problemsOf(bash("call") + "\n## Next\n\n" + json("orphan-response")),
    ).toContain(
      'response block "orphan-response" has no sample before it in its section',
    );
  });
});

describe("parseGuide: callouts", () => {
  it.each([
    ["Note", "note"],
    ["Warning", "warning"],
    ["Limitation", "limitation"],
  ])("turns a **%s:** blockquote into a %s callout", (label, kind) => {
    const { tree } = parse(`> **${label}:** Mind the gap.\n> Second line.\n`);
    const [callout] = byTag(tree, "guide-callout");
    expect(callout.data?.guideCallout).toBe(kind);
    // The label is drawn by the component; the body keeps the rest.
    expect(textOf(callout)).toBe("Mind the gap.\nSecond line.");
    expect(byTag(tree, "blockquote")).toEqual([]);
  });

  it("keeps a callout's later paragraphs", () => {
    const { tree } = parse("> **Note:** One.\n>\n> Two.\n");
    const [callout] = byTag(tree, "guide-callout");
    expect(
      byTag(callout as unknown as Root, "p").map((p) => textOf(p)),
    ).toEqual(["One.", "Two."]);
  });

  it.each([
    ["> A plain quotation.\n", "no label"],
    ["> **Tip:** Not a dialect label.\n", "an unknown label"],
    ["> **note:** Lowercase.\n", "a lowercase label"],
    ["> Say **Note:** later.\n", "a label that is not first"],
    ["> *Note:* Emphasis, not bold.\n", "emphasis instead of bold"],
  ])("leaves %j a blockquote (%s)", (source) => {
    const { tree } = parse(source);
    expect(byTag(tree, "guide-callout")).toEqual([]);
    expect(byTag(tree, "blockquote")).toHaveLength(1);
  });
});

describe("parseGuide: raw HTML and unsafe links", () => {
  it("drops raw HTML, keeps its text, and reports it as a warning", () => {
    const { tree, warnings } = parse(
      '<script>alert(1)</script>\n\nSome <b onclick="x()">bold</b> text.\n\n<img src=x onerror="alert(1)">\n',
    );
    const tags = elements(tree).map((e) => e.tagName);
    expect(tags).not.toContain("script");
    expect(tags).not.toContain("b");
    expect(tags).not.toContain("img");
    expect(textOf(tree)).not.toContain("alert");
    expect(textOf(tree)).toContain("Some bold text.");
    expect(warnings).toEqual([
      "raw HTML is not part of the guide dialect and was removed: <script>alert(1)</script>",
      'raw HTML is not part of the guide dialect and was removed: <b onclick="x()">',
      "raw HTML is not part of the guide dialect and was removed: </b>",
      'raw HTML is not part of the guide dialect and was removed: <img src=x onerror="alert(1)">',
    ]);
  });

  it("strips a javascript: link target but keeps http, mailto and anchors", () => {
    const { tree } = parse(
      "[bad](javascript:alert(1)) [web](https://orizons.xyz) [mail](mailto:a@b.co) [here](#top)\n",
    );
    expect(byTag(tree, "a").map((a) => a.properties.href ?? null)).toEqual([
      null,
      "https://orizons.xyz",
      "mailto:a@b.co",
      "#top",
    ]);
  });

  it("autolinks a bare URL (GFM)", () => {
    const { tree } = parse("See https://orizons.xyz today.\n");
    expect(byTag(tree, "a")[0].properties.href).toBe("https://orizons.xyz");
  });
});

describe("parseGuide: tables and task lists", () => {
  it("wraps each table in a region named for its section", () => {
    const table = "| a | b |\n| - | - |\n| 1 | 2 |\n";
    const { tree } = parse(`${table}\n## Error codes\n\n${table}\n${table}`);
    expect(
      byTag(tree, "guide-table").map((t) => t.data?.guideTable?.label),
    ).toEqual(["Table 1", "Error codes table", "Error codes table 2"]);
    // Wrapped once each, not recursively.
    expect(byTag(tree, "table")).toHaveLength(3);
  });

  it("replaces task-list checkboxes with their state", () => {
    const { tree } = parse("- [x] Funded\n- [ ] Endpoint\n");
    expect(byTag(tree, "input")).toEqual([]);
    expect(
      byTag(tree, "guide-check").map((c) => c.data?.guideCheck?.checked),
    ).toEqual([true, false]);
  });
});

describe("the fixture guide", () => {
  const guide = parseGuide(readFileSync(FIXTURE, "utf8"), FIXTURE);

  it("parses, with every construct present", () => {
    const tags = new Set(elements(guide.tree).map((e) => e.tagName));
    for (const tag of [
      "guide-code",
      "guide-callout",
      "guide-table",
      "guide-check",
      "blockquote",
      "h2",
      "h3",
      "a",
    ]) {
      expect(tags).toContain(tag);
    }
    expect(guide.toc.map((t) => t.id)).toContain("trust-boundaries");
    expect(guide.toc.map((t) => t.id)).toContain("error-codes");
  });
});
