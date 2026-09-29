/**
 * The demo's transcript file → a sanitised hast tree, at build time.
 *
 * A Markdown transcript goes through the guide's pipeline (remark-parse and
 * remark-gfm, remark-rehype with raw HTML dropped, then rehype-sanitize with
 * GitHub's schema), so nothing in it can put script or an unsafe link on the
 * page. Its headings are pushed down two levels: the page already has its h1
 * and the transcript sits under an h2, so a "# Transcript" in the file
 * becomes an h3 and the outline stays whole.
 *
 * A plain-text transcript becomes paragraphs at blank lines, with each line
 * break kept, which is how narration is usually written.
 */

import type { Element, ElementContent, Root } from "hast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export type TranscriptFormat = "markdown" | "text";

export function transcriptFormat(file: string): TranscriptFormat {
  return /\.txt$/i.test(file) ? "text" : "markdown";
}

const HEADING = /^h([1-6])$/;

function demoteHeadings(node: Root | Element): void {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    const m = HEADING.exec(child.tagName);
    if (m) child.tagName = `h${Math.min(6, Number(m[1]) + 2)}`;
    demoteHeadings(child);
  }
}

function markdownTree(source: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    // No allowDangerousHtml: raw HTML in the transcript is dropped.
    .use(remarkRehype)
    .use(rehypeSanitize, defaultSchema);
  const tree = processor.runSync(processor.parse(source)) as Root;
  demoteHeadings(tree);
  return tree;
}

function textTree(source: string): Root {
  const paragraphs = source
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    type: "root",
    children: paragraphs.map((p): Element => {
      const children: ElementContent[] = [];
      p.split("\n").forEach((line, i) => {
        if (i > 0) {
          children.push({
            type: "element",
            tagName: "br",
            properties: {},
            children: [],
          });
        }
        children.push({ type: "text", value: line });
      });
      return { type: "element", tagName: "p", properties: {}, children };
    }),
  };
}

export function parseTranscript(
  source: string,
  format: TranscriptFormat,
): Root {
  return format === "text" ? textTree(source) : markdownTree(source);
}
