/**
 * The transcript of each part, in order, each under its own heading,
 * rendered from its already-sanitised tree on the server.
 * No client JavaScript: it is plain HTML in the page, readable with scripts
 * off and findable by search.
 */

import type { Root } from "hast";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import type { ComponentPropsWithoutRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { partHeading } from "@/lib/demo/display";
import type { DemoRole } from "@/lib/demo/load";
import { inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Props<T extends keyof JSX.IntrinsicElements> =
  ComponentPropsWithoutRef<T> & { node?: unknown };

function strip<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node: _node, ...rest } = props;
  void _node;
  return rest;
}

const components = {
  h3: (p: Props<"h3">) => (
    <h3 {...strip(p)} className="mt-8 mb-2 text-lg font-semibold text-text" />
  ),
  h4: (p: Props<"h4">) => (
    <h4 {...strip(p)} className="mt-6 mb-2 font-semibold text-text" />
  ),
  h5: (p: Props<"h5">) => (
    <h5 {...strip(p)} className="mt-6 mb-2 text-sm font-semibold text-text" />
  ),
  h6: (p: Props<"h6">) => (
    <h6 {...strip(p)} className="mt-6 mb-2 text-sm font-semibold text-muted" />
  ),
  p: (p: Props<"p">) => (
    <p {...strip(p)} className="my-4 leading-7 text-text/90" />
  ),
  a: ({ href, children, ...rest }: Props<"a">) => {
    // The sanitiser removes an unsafe target; the words stay, unlinked.
    if (!href) return <span>{children}</span>;
    return (
      <a
        {...strip(rest)}
        href={href}
        rel={/^https?:\/\//.test(href) ? "noreferrer" : undefined}
        className={cn(inlineLink, "break-words")}
      >
        {children}
      </a>
    );
  },
  ul: (p: Props<"ul">) => (
    <ul {...strip(p)} className="my-4 list-disc space-y-2 pl-6" />
  ),
  ol: (p: Props<"ol">) => (
    <ol {...strip(p)} className="my-4 list-decimal space-y-2 pl-6" />
  ),
  li: (p: Props<"li">) => (
    <li {...strip(p)} className="leading-7 text-text/90" />
  ),
  blockquote: (p: Props<"blockquote">) => (
    <blockquote
      {...strip(p)}
      className="my-6 border-l-2 border-border pl-4 text-muted"
    />
  ),
  code: (p: Props<"code">) => (
    <code
      {...strip(p)}
      className="break-words border border-border bg-surface-2/80 px-1 py-px font-mono text-[0.85em] text-text"
    />
  ),
  pre: (p: Props<"pre">) => (
    <pre
      {...strip(p)}
      className="my-4 overflow-x-auto border border-border bg-surface/60 p-3 text-sm [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0"
    />
  ),
  table: (p: Props<"table">) => (
    <div className="my-6 overflow-x-auto border border-border">
      <table {...strip(p)} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: (p: Props<"th">) => (
    <th
      {...strip(p)}
      className="border-b border-border px-3 py-2 text-left font-semibold"
    />
  ),
  td: (p: Props<"td">) => (
    <td {...strip(p)} className="border-b border-border px-3 py-2" />
  ),
  hr: () => <hr className="my-8 border-border" />,
} as unknown as Components;

export function DemoTranscript({
  parts,
}: {
  parts: { role: DemoRole; title: string; transcript: Root }[];
}) {
  return (
    <section aria-labelledby="demo-transcript">
      <h2
        id="demo-transcript"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Transcript
      </h2>
      {parts.map((part, i) => (
        <section
          key={i}
          aria-labelledby={`demo-transcript-${i + 1}`}
          className="mt-6 min-w-0"
        >
          <h3
            id={`demo-transcript-${i + 1}`}
            className="text-lg font-semibold tracking-tight text-text"
          >
            {partHeading(i, part.role)}
          </h3>
          <p className="mt-1 text-sm text-muted">{part.title}</p>
          {toJsxRuntime(part.transcript, {
            Fragment,
            jsx,
            jsxs,
            components,
            passNode: true,
          })}
        </section>
      ))}
    </section>
  );
}
