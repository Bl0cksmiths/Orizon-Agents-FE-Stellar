/**
 * Renders a parsed guide's tree as React, on the server. No client JavaScript
 * is involved in the content: headings, prose, tables and callouts are plain
 * HTML, and only each code block's copy button hydrates.
 *
 * The tree has already been sanitised by lib/guide/parse.ts; this file only
 * decides how each element looks.
 */

import type { Element, Root } from "hast";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { focusRing, inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Callout } from "./callout";
import { GuideCodeBlock } from "./code-block";

type WithNode<T extends keyof JSX.IntrinsicElements> =
  ComponentPropsWithoutRef<T> & { node?: Element };

/**
 * Each table cell's column name, for the label a phone shows above it. Keyed
 * by the cell's node, so the tree itself is left as the parser made it.
 */
const cellLabels = new WeakMap<Element, string>();

const isElement = (n: unknown): n is Element =>
  typeof n === "object" && n !== null && (n as Element).type === "element";

function textOf(n: Element | Root): string {
  return n.children
    .map((c) => (c.type === "text" ? c.value : isElement(c) ? textOf(c) : ""))
    .join("");
}

function labelCells(n: Element | Root): void {
  for (const child of n.children) {
    if (!isElement(child)) continue;
    if (child.tagName !== "table") {
      labelCells(child);
      continue;
    }
    const sections = child.children.filter(isElement);
    const head = sections.find((e) => e.tagName === "thead");
    const headRow = head?.children.filter(isElement)[0];
    const names = (headRow?.children.filter(isElement) ?? []).map((th) =>
      textOf(th).trim(),
    );
    for (const body of sections.filter((e) => e.tagName === "tbody")) {
      for (const row of body.children.filter(isElement)) {
        row.children.filter(isElement).forEach((cell, i) => {
          if (names[i]) cellLabels.set(cell, names[i]);
        });
      }
    }
  }
}

/**
 * A heading with its GitHub-slugger id and a visible anchor link. The link
 * sits beside the heading, not inside it, so the heading's accessible name is
 * just its text. Preflight makes headings inherit their size and weight, so
 * the wrapper carries the type styles.
 */
function heading(Tag: "h2" | "h3" | "h4" | "h5" | "h6", className: string) {
  function Heading({ node, children, id }: WithNode<typeof Tag>) {
    const info = node?.data?.guideHeading;
    return (
      <div className={cn("flex items-baseline gap-2", className)}>
        <Tag id={id} className="scroll-mt-24">
          {children}
        </Tag>
        {info && (
          <a
            href={`#${info.id}`}
            className={cn(
              "shrink-0 font-mono text-[0.8em] font-normal text-muted no-underline transition-colors hover:text-cyan [@media(pointer:coarse)]:-my-2 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:justify-center",
              focusRing,
            )}
          >
            <span aria-hidden="true">#</span>
            <span className="sr-only">Link to the section {info.text}</span>
          </a>
        )}
      </div>
    );
  }
  Heading.displayName = `Guide${Tag.toUpperCase()}`;
  return Heading;
}

function Link({ node: _node, href, children, ...rest }: WithNode<"a">) {
  void _node;
  // The sanitiser removes an unsafe target (javascript: and the like); the
  // words stay, but they are no longer a link.
  if (!href) return <span>{children}</span>;
  const external = /^https?:\/\//.test(href);
  return (
    <a
      {...rest}
      href={href}
      rel={external ? "noreferrer" : undefined}
      className={cn(inlineLink, "break-words")}
    >
      {children}
    </a>
  );
}

function InlineCode({ children }: WithNode<"code">) {
  return (
    <code className="break-words border border-border bg-surface-2/80 px-1 py-px font-mono text-[0.85em] text-text">
      {children}
    </code>
  );
}

function GuideTable({
  node,
  children,
}: {
  node?: Element;
  children?: ReactNode;
}) {
  const label = node?.data?.guideTable?.label ?? "Table";
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("my-6 overflow-x-auto border border-border", focusRing)}
    >
      {children}
    </div>
  );
}

function GuideCheck({ node }: { node?: Element }) {
  const checked = !!node?.data?.guideCheck?.checked;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn("mr-2 font-mono", checked ? "text-cyan" : "text-muted")}
      >
        {checked ? "☑" : "☐"}
      </span>
      <span className="sr-only">{checked ? "Done: " : "To do: "}</span>
    </>
  );
}

function GuideCode({ node }: { node?: Element }) {
  const block = node?.data?.guideCode;
  return block ? <GuideCodeBlock block={block} /> : null;
}

function GuideCallout({
  node,
  children,
}: {
  node?: Element;
  children?: ReactNode;
}) {
  const kind = node?.data?.guideCallout;
  return kind ? <Callout kind={kind}>{children}</Callout> : null;
}

function List({ node: _node, className, ...rest }: WithNode<"ul">) {
  void _node;
  const tasks = String(className ?? "").includes("contains-task-list");
  return (
    <ul
      {...rest}
      className={cn(
        "my-4 space-y-2 pl-6",
        tasks ? "list-none pl-1" : "list-disc marker:text-violet-readable",
      )}
    />
  );
}

const components = {
  h2: heading(
    "h2",
    "mt-14 mb-4 text-2xl font-semibold tracking-tight text-text",
  ),
  h3: heading(
    "h3",
    "mt-10 mb-3 text-lg font-semibold tracking-tight text-text",
  ),
  h4: heading("h4", "mt-8 mb-2 text-base font-semibold text-text"),
  h5: heading("h5", "mt-6 mb-2 text-sm font-semibold text-text"),
  h6: heading("h6", "mt-6 mb-2 text-sm font-semibold text-muted"),
  p: ({ children }: WithNode<"p">) => (
    <p className="my-4 leading-7 text-text/90">{children}</p>
  ),
  a: Link,
  code: InlineCode,
  ul: List,
  ol: ({ children, start }: WithNode<"ol">) => (
    <ol
      start={start}
      className="my-4 list-decimal space-y-2 pl-6 marker:font-mono marker:text-violet-readable"
    >
      {children}
    </ol>
  ),
  li: ({ children }: WithNode<"li">) => (
    <li className="leading-7 text-text/90 [&>p]:my-2">{children}</li>
  ),
  blockquote: ({ children }: WithNode<"blockquote">) => (
    <blockquote className="my-6 border-l-2 border-border pl-4 italic text-muted">
      {children}
    </blockquote>
  ),
  // Below sm a table is a stack of rows, each cell under its column's name,
  // so a phone reads every column instead of scrolling to find the last one.
  // The roles are explicit because changing a table part's display drops its
  // table semantics in some browsers (as in components/ui/stacked-table).
  table: ({ children }: WithNode<"table">) => (
    <table
      role="table"
      className="block w-full border-collapse text-left text-sm sm:table sm:min-w-[32rem]"
    >
      {children}
    </table>
  ),
  thead: ({ children }: WithNode<"thead">) => (
    <thead
      role="rowgroup"
      className="sr-only sm:not-sr-only sm:table-header-group"
    >
      {children}
    </thead>
  ),
  tbody: ({ children }: WithNode<"tbody">) => (
    <tbody role="rowgroup" className="block sm:table-row-group">
      {children}
    </tbody>
  ),
  tr: ({ children }: WithNode<"tr">) => (
    <tr
      role="row"
      className="block border-b border-border py-2 last:border-b-0 sm:table-row sm:py-0 sm:last:border-b"
    >
      {children}
    </tr>
  ),
  th: ({ children, style }: WithNode<"th">) => (
    <th
      role="columnheader"
      scope="col"
      style={style}
      className="border-b border-border bg-surface/70 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted"
    >
      {children}
    </th>
  ),
  td: ({ children, style, node }: WithNode<"td">) => {
    const label = node ? cellLabels.get(node) : undefined;
    return (
      <td
        role="cell"
        style={style}
        className="block px-3 py-1 align-top text-text/90 first:font-semibold sm:table-cell sm:border-b sm:border-border sm:py-2 sm:first:font-normal"
      >
        {label && (
          <span
            aria-hidden="true"
            className="block font-mono text-[10px] uppercase tracking-widest text-muted sm:hidden"
          >
            {label}
          </span>
        )}
        {children}
      </td>
    );
  },
  hr: () => <hr className="my-10 border-border" />,
  strong: ({ children }: WithNode<"strong">) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  "guide-code": GuideCode,
  "guide-callout": GuideCallout,
  "guide-table": GuideTable,
  "guide-check": GuideCheck,
} as unknown as Components;

export function GuideBody({ tree }: { tree: Root }) {
  labelCells(tree);
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components,
    passNode: true,
  });
}
