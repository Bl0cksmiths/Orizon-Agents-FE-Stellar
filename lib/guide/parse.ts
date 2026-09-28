/**
 * The guide parser: Markdown in the guide dialect → a sanitised hast tree, a
 * table of contents and the frontmatter, all at build time.
 *
 * The pipeline is unified: remark-parse and remark-gfm read the Markdown,
 * remark-rehype turns it into HTML's syntax tree WITHOUT raw HTML (the dialect
 * has none; any that appears is dropped here and reported as a warning), and
 * rehype-sanitize runs GitHub's schema over the result so a `javascript:` link
 * or anything else unsafe cannot reach the page. Only then do the dialect's
 * own transforms run, on the sanitised tree, adding structure the sanitiser
 * would otherwise have to be told to trust:
 *
 *   - `##`/`###` headings get GitHub-slugger ids and feed the contents list;
 *   - fenced code becomes a `guide-code` element carrying its parsed info
 *     string, and an expected-response block joins the sample before it;
 *   - a blockquote opening with **Note:**, **Warning:** or **Limitation:**
 *     becomes a `guide-callout`;
 *   - a table is wrapped in a labelled `guide-table` scroll region;
 *   - a task-list checkbox becomes a `guide-check`, since a disabled,
 *     unlabelled form control is noise to a screen reader.
 *
 * Every content problem is collected and thrown as one GuideContentError, so
 * `next build` fails once with the full list.
 */

import GithubSlugger from "github-slugger";
import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import type { Root as MdastRoot } from "mdast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { parseFenceInfo, type FenceMeta } from "./fence";
import {
  GuideContentError,
  parseFrontmatter,
  splitFrontmatter,
  type GuideMeta,
} from "./frontmatter";

export type CalloutKind = "note" | "warning" | "limitation";

export type CodeBlock = {
  fence: FenceMeta;
  /** The code exactly as written, without the fence's trailing newline. */
  code: string;
  /** Expected responses shown attached to this sample. */
  responses: CodeBlock[];
  /** A response separated from its sample by prose points back to it. */
  responseTo: { id: string; title: string } | null;
};

export type TocEntry = { depth: 2 | 3; id: string; text: string };

declare module "hast" {
  interface ElementData {
    guideCode?: CodeBlock;
    guideCallout?: CalloutKind;
    guideTable?: { label: string };
    guideCheck?: { checked: boolean };
    guideHeading?: { id: string; text: string };
  }
}

export type ParsedGuide = {
  meta: GuideMeta;
  tree: Root;
  toc: TocEntry[];
  /** Non-fatal content notes (stripped raw HTML), logged at build. */
  warnings: string[];
};

const CALLOUT_LABELS: Record<string, CalloutKind> = {
  "Note:": "note",
  "Warning:": "warning",
  "Limitation:": "limitation",
};

type Parent = Root | Element;

function isElement(node: unknown, tagName?: string): node is Element {
  return (
    !!node &&
    (node as Element).type === "element" &&
    (tagName === undefined || (node as Element).tagName === tagName)
  );
}

function isBlank(node: RootContent | ElementContent): boolean {
  return node.type === "text" && !node.value.trim();
}

/** The text of a node, as a screen reader or the slugger would see it. */
export function textOf(node: RootContent | ElementContent | Root): string {
  if (node.type === "text") return node.value;
  if ("children" in node) {
    return (node.children as (RootContent | ElementContent)[])
      .map(textOf)
      .join("");
  }
  return "";
}

/**
 * Depth-first, document order. `visit` may replace the node it is on (the
 * walk then descends into the replacement) but must not detach it.
 */
function walk(
  parent: Parent,
  visit: (node: Element, parent: Parent, index: number) => void,
): void {
  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children[index];
    if (child.type !== "element") continue;
    visit(child, parent, index);
    // Descend into whatever now sits here, so a replacement's children are
    // visited too.
    const current = parent.children[index];
    if (current.type === "element") walk(current, visit);
  }
}

const HEADING = /^h([1-6])$/;

function headingDepth(node: Element): number | null {
  const m = HEADING.exec(node.tagName);
  return m ? Number(m[1]) : null;
}

/** Collect raw HTML from the Markdown tree: it is dropped, never rendered. */
function rawHtmlWarnings(mdast: MdastRoot): string[] {
  const found: string[] = [];
  const visit = (node: {
    type: string;
    value?: string;
    children?: unknown[];
  }) => {
    if (node.type === "html" && node.value?.trim()) {
      const snippet = node.value.trim().replace(/\s+/g, " ");
      found.push(
        `raw HTML is not part of the guide dialect and was removed: ${snippet.length > 60 ? `${snippet.slice(0, 57)}...` : snippet}`,
      );
    }
    for (const child of (node.children ?? []) as (typeof node)[]) visit(child);
  };
  visit(mdast as unknown as Parameters<typeof visit>[0]);
  return found;
}

function markdownToSafeHast(body: string): { tree: Root; warnings: string[] } {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    // No allowDangerousHtml: raw HTML nodes are dropped here.
    .use(remarkRehype)
    .use(rehypeSanitize, defaultSchema);
  const mdast = processor.parse(body);
  const warnings = rawHtmlWarnings(mdast);
  const tree = processor.runSync(mdast) as Root;
  return { tree, warnings };
}

/** Headings: GitHub-slugger ids, the contents list, and one h1 rule. */
function transformHeadings(
  tree: Root,
  problems: string[],
  ids: Map<string, string>,
): TocEntry[] {
  const slugger = new GithubSlugger();
  const toc: TocEntry[] = [];
  walk(tree, (node) => {
    const depth = headingDepth(node);
    if (depth === null) return;
    const text = textOf(node).trim();
    if (depth === 1) {
      problems.push(
        `"# ${text}": the page title comes from the frontmatter; start sections at ##`,
      );
      return;
    }
    if (!text) {
      problems.push(`an empty ${"#".repeat(depth)} heading has no text`);
      return;
    }
    const id = slugger.slug(text);
    node.properties = { ...node.properties, id };
    node.data = { ...node.data, guideHeading: { id, text } };
    ids.set(id, `the heading "${text}"`);
    if (depth === 2 || depth === 3) toc.push({ depth, id, text });
  });
  return toc;
}

/** Fenced code → `guide-code`, carrying the parsed info string. */
function transformCode(
  tree: Root,
  problems: string[],
  ids: Map<string, string>,
): void {
  walk(tree, (node, parent, index) => {
    if (node.tagName !== "pre") return;
    const code = node.children.find((c): c is Element => isElement(c, "code"));
    if (!code) return;
    const className = code.properties?.className;
    const langClass = (Array.isArray(className) ? className : [])
      .map(String)
      .find((c) => c.startsWith("language-"));
    const lang = langClass ? langClass.slice("language-".length) : null;
    const meta = (code.data as { meta?: string } | undefined)?.meta ?? null;
    const parsed = parseFenceInfo(lang, meta);
    if (!parsed.ok) {
      problems.push(...parsed.problems);
      return;
    }
    const { fence } = parsed;
    const taken = ids.get(fence.id);
    if (taken) {
      problems.push(
        `code block id "${fence.id}" is already used by ${taken}; ids must be unique on the page`,
      );
    }
    ids.set(fence.id, `the code block "${fence.title}"`);
    const replacement: Element = {
      type: "element",
      tagName: "guide-code",
      properties: {},
      children: [],
      data: {
        guideCode: {
          fence,
          code: textOf(code).replace(/\n$/, ""),
          responses: [],
          responseTo: null,
        },
      },
    };
    parent.children[index] = replacement;
  });
}

/**
 * An expected-response block belongs to the nearest sample before it in the
 * same section. Directly after its sample, it is drawn inside the sample's
 * frame; with prose in between, it stays where the author put it and names
 * its sample instead, so reading order never changes.
 */
function attachResponses(tree: Root, problems: string[]): void {
  type Item = { node: Element; parent: Parent };
  const order: Item[] = [];
  walk(tree, (node, parent) => {
    if (headingDepth(node) !== null || node.data?.guideCode) {
      order.push({ node, parent });
    }
  });

  const detach: Item[] = [];
  let sample: Item | null = null;
  // The last block that is still "open" for an adjacent response: the
  // sample, or the response most recently attached to it.
  let tail: Item | null = null;
  for (const item of order) {
    const block = item.node.data?.guideCode;
    if (!block) {
      sample = null;
      tail = null;
      continue;
    }
    if (!block.fence.response) {
      sample = item;
      tail = item;
      continue;
    }
    if (!sample) {
      problems.push(
        `response block "${block.fence.id}" has no sample before it in its section`,
      );
      continue;
    }
    const target = sample.node.data!.guideCode!;
    if (
      tail &&
      tail.parent === item.parent &&
      adjacent(item.parent, tail.node, item.node)
    ) {
      target.responses.push(block);
      detach.push(item);
      tail = item;
    } else {
      block.responseTo = { id: target.fence.id, title: target.fence.title };
      tail = null;
    }
  }
  for (const { node, parent } of detach) {
    const i = parent.children.indexOf(node);
    parent.children.splice(i, 1);
  }
}

function adjacent(parent: Parent, before: Element, after: Element): boolean {
  const from = parent.children.indexOf(before);
  const to = parent.children.indexOf(after);
  if (from < 0 || to <= from) return false;
  return parent.children.slice(from + 1, to).every(isBlank);
}

/** A blockquote opening with a bold **Note:** (etc.) becomes a callout. */
function transformCallouts(tree: Root): void {
  walk(tree, (node, parent, index) => {
    if (node.tagName !== "blockquote") return;
    const first = node.children.find((c) => !isBlank(c));
    if (!isElement(first, "p")) return;
    const [label, ...rest] = first.children;
    if (!isElement(label, "strong")) return;
    const kind = CALLOUT_LABELS[textOf(label)];
    if (!kind || label.children.some((c) => c.type !== "text")) return;

    const next = rest[0];
    if (next?.type === "text") {
      (next as Text).value = next.value.replace(/^\s+/, "");
    }
    const body = rest.filter((c) => !(c.type === "text" && !c.value));
    const children = node.children.filter((c) => c !== first);
    if (body.length) {
      children.unshift({ ...first, children: body });
    }
    parent.children[index] = {
      type: "element",
      tagName: "guide-callout",
      properties: {},
      children: children.filter((c) => !isBlank(c)),
      data: { guideCallout: kind },
    };
  });
}

/** Tables scroll inside a region named for the section they sit in. */
function transformTables(tree: Root): void {
  let heading = "";
  const perHeading = new Map<string, number>();
  let untitled = 0;
  walk(tree, (node, parent, index) => {
    const info = node.data?.guideHeading;
    if (info) {
      heading = info.text;
      return;
    }
    if (node.tagName !== "table" || isElement(parent, "guide-table")) return;
    let label: string;
    if (heading) {
      const n = (perHeading.get(heading) ?? 0) + 1;
      perHeading.set(heading, n);
      label = n === 1 ? `${heading} table` : `${heading} table ${n}`;
    } else {
      label = `Table ${++untitled}`;
    }
    parent.children[index] = {
      type: "element",
      tagName: "guide-table",
      properties: {},
      children: [node],
      data: { guideTable: { label } },
    };
  });
}

/** Task-list checkboxes → a glyph with its state in words. */
function transformTaskLists(tree: Root): void {
  walk(tree, (node, parent, index) => {
    if (node.tagName !== "input" || node.properties?.type !== "checkbox") {
      return;
    }
    parent.children[index] = {
      type: "element",
      tagName: "guide-check",
      properties: {},
      children: [],
      data: { guideCheck: { checked: !!node.properties.checked } },
    };
  });
}

/** Parse a guide file's text. `file` names it in every error message. */
export function parseGuide(source: string, file: string): ParsedGuide {
  const { yaml, body } = splitFrontmatter(source, file);
  const meta = parseFrontmatter(yaml, file);
  const { tree, warnings } = markdownToSafeHast(body);

  const problems: string[] = [];
  const ids = new Map<string, string>();
  const toc = transformHeadings(tree, problems, ids);
  transformCode(tree, problems, ids);
  attachResponses(tree, problems);
  transformCallouts(tree);
  transformTables(tree);
  transformTaskLists(tree);

  if (problems.length) throw new GuideContentError(file, problems);
  return { meta, tree, toc, warnings };
}
