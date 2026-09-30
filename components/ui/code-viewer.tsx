"use client";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import html from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

SyntaxHighlighter.registerLanguage("html", html);
SyntaxHighlighter.registerLanguage("markup", html);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("python", python);

/**
 * oneDark, with its grey raised to the console's muted text. That grey
 * (#5c6370) is both the comment colour and — through the `comment` class the
 * highlighter puts on every line number — the gutter's, and it measured
 * 3.42:1 on this panel, under WCAG 1.4.3's 4.5:1.
 */
const MUTED = "#A79FC7";
const theme = {
  ...oneDark,
  comment: { ...oneDark.comment, color: MUTED },
  prolog: { ...oneDark.prolog, color: MUTED },
  cdata: { ...oneDark.cdata, color: MUTED },
};

/**
 * A declared language → the grammar registered above. The keys are what the
 * backend's first-party workers declare — `ArtifactFile.language` in
 * app/agents/workers/code_gen.py documents "html" | "css" | "js" | "tsx" |
 * "python", and both code workers and the demo kits emit "html" — plus the
 * long names a model writing that field is as likely to use.
 */
const LANG_MAP: Record<string, string> = {
  html: "markup",
  htm: "markup",
  markup: "markup",
  js: "javascript",
  javascript: "javascript",
  jsx: "tsx",
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  css: "css",
  python: "python",
  py: "python",
};

/** The grammar a file is highlighted with. A language nobody registered is
 * shown as plain text ("text", the highlighter's no-grammar mode) — colouring
 * it as markup, as this once did, claimed a grammar the file does not have. */
export function grammarFor(language: string | null | undefined): string {
  if (!language) return "text";
  return LANG_MAP[language.trim().toLowerCase()] ?? "text";
}

/**
 * `language` is optional because the backend does not always send one: an
 * external operator's artifact files are rebuilt from `path` and `content`
 * alone (`_parse_files`, app/agents/workers/external_contract.py). A file
 * with no language renders as plain text — "text" is the highlighter's own
 * no-grammar mode, so the code keeps its line numbers and wrapping but gets
 * no token colouring that would claim a language nobody declared.
 */
export function CodeViewer({
  language,
  code,
  label,
  maxHeight = 560,
}: {
  language?: string | null;
  code: string;
  /** Names the scrollable region for assistive tech — the file it shows. */
  label: string;
  maxHeight?: number;
}) {
  const lang = grammarFor(language);
  return (
    <div
      role="region"
      aria-label={label}
      // A region that scrolls must be reachable to scroll: keyboard users
      // otherwise cannot read past the first screen of a long file.
      tabIndex={0}
      className={cn(
        "relative overflow-auto rounded-sm border border-border bg-[#060010]",
        focusRing,
      )}
      style={{ maxHeight }}
    >
      <SyntaxHighlighter
        language={lang}
        style={theme}
        customStyle={{
          margin: 0,
          padding: "1rem 1.25rem",
          background: "transparent",
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
        // oneDark paints its own #282c34 behind the <code>, on which its red
        // tokens measure 4.38:1 — under WCAG 1.4.3's 4.5:1. The panel's own
        // near-black shows through instead, as `customStyle` meant it to.
        codeTagProps={{ style: { background: "transparent" } }}
        wrapLongLines
        showLineNumbers
        // Full strength, not 40% opacity, which measured 1.42:1: a line
        // number is read to find a line, and is held to the code's 4.5:1.
        lineNumberStyle={{
          minWidth: "2.2em",
          userSelect: "none",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
