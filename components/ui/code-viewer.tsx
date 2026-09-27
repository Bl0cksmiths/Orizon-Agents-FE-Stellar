"use client";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import html from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

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

const LANG_MAP: Record<string, string> = {
  html: "markup",
  js: "javascript",
  ts: "typescript",
  tsx: "tsx",
  css: "css",
  python: "python",
  py: "python",
};

export function CodeViewer({
  language,
  code,
  maxHeight = 560,
}: {
  language: string;
  code: string;
  maxHeight?: number;
}) {
  const lang = LANG_MAP[language.toLowerCase()] ?? "markup";
  return (
    <div
      className="relative overflow-auto rounded-sm border border-border bg-[#060010]"
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
