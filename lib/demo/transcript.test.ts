/**
 * Unit tests for lib/demo/transcript.ts: both transcript formats, and the
 * guarantee that nothing unsafe in the file reaches the page.
 */

import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { parseTranscript, transcriptFormat } from "./transcript";

function tags(tree: Root | Element): string[] {
  return tree.children.flatMap((c) =>
    c.type === "element" ? [c.tagName, ...tags(c)] : [],
  );
}

function html(tree: Root): string {
  return JSON.stringify(tree);
}

describe("transcriptFormat", () => {
  it("reads .txt as text and anything else as Markdown", () => {
    expect(transcriptFormat("content/demo/narration.txt")).toBe("text");
    expect(transcriptFormat("content/demo/transcript.md")).toBe("markdown");
  });
});

describe("a Markdown transcript", () => {
  it("pushes headings three levels down, under its part's h3", () => {
    const tree = parseTranscript(
      "# One\n\n## Two\n\n### Three\n\n###### Six\n",
      "markdown",
    );
    expect(tags(tree)).toEqual(["h4", "h5", "h6", "h6"]);
  });

  it("drops raw HTML and unsafe links", () => {
    const tree = parseTranscript(
      '<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror="alert(1)">\n',
      "markdown",
    );
    expect(tags(tree)).not.toContain("script");
    expect(tags(tree)).not.toContain("img");
    expect(html(tree)).not.toContain("javascript:");
    expect(html(tree)).not.toContain("onerror");
  });
});

describe("a plain-text transcript", () => {
  it("becomes paragraphs at blank lines and keeps line breaks", () => {
    const tree = parseTranscript(
      "Line one\nline two\r\n\r\n\nNext <b>para</b>\n",
      "text",
    );
    expect(tags(tree)).toEqual(["p", "br", "p"]);
    const [first, second] = tree.children as Element[];
    expect(first.children).toEqual([
      { type: "text", value: "Line one" },
      expect.objectContaining({ tagName: "br" }),
      { type: "text", value: "line two" },
    ]);
    // Angle brackets in text are text, never markup.
    expect(second.children).toEqual([
      { type: "text", value: "Next <b>para</b>" },
    ]);
  });
});
