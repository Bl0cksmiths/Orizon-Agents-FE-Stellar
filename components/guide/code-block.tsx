/**
 * A guide code block: caption, verify badge, copy button, and any expected
 * responses attached to it. A server component; only the copy button hydrates.
 *
 * The block's fence id is its DOM id, so a step can be linked. The code
 * scrolls sideways inside its own frame and is focusable, so a keyboard user
 * can scroll it too; the page itself never scrolls sideways.
 */

import type { FenceLang } from "@/lib/guide/fence";
import type { CodeBlock } from "@/lib/guide/parse";
import { VERIFY_TEXT } from "@/lib/guide/display";
import { focusRing, inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

const LANG_LABEL: Record<FenceLang, string> = {
  bash: "bash",
  json: "json",
  python: "python",
  js: "javascript",
  text: "text",
  env: ".env",
};

const caption =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-surface/70 px-4 py-2";

function Code({ block }: { block: CodeBlock }) {
  return (
    <pre
      tabIndex={0}
      className={cn(
        "overflow-x-auto px-4 py-4 font-mono text-xs leading-6 text-text/90",
        focusRing,
      )}
    >
      <code id={`${block.fence.id}-code`}>{block.code}</code>
    </pre>
  );
}

function AnchorLink({ id, title }: { id: string; title: string }) {
  return (
    <a
      href={`#${id}`}
      className={cn(
        "font-mono text-xs text-muted transition-colors hover:text-cyan",
        focusRing,
      )}
    >
      <span aria-hidden="true">#</span>
      <span className="sr-only">Link to {title}</span>
    </a>
  );
}

function VerifyBadge({ block }: { block: CodeBlock }) {
  const verify = block.fence.verify;
  if (!verify) return null;
  return (
    <span
      data-verify={verify}
      className={cn(
        "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        verify === "live" && "border-cyan/40 bg-cyan/10 text-cyan",
        verify === "offline" &&
          "border-violet/40 bg-violet/15 text-violet-readable",
        verify === "manual" && "border-magenta/40 bg-magenta/15 text-magenta",
      )}
    >
      {VERIFY_TEXT[verify].label}
    </span>
  );
}

function Response({ block }: { block: CodeBlock }) {
  const { id, title } = block.fence;
  return (
    <div id={id} className="scroll-mt-24 border-t border-border">
      <div className={caption}>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
            Expected response
          </span>
          <span className="text-muted">{title}</span>
          <AnchorLink id={id} title={`the expected response: ${title}`} />
        </p>
        <CopyButton
          targetId={`${id}-code`}
          title={`expected response: ${title}`}
        />
      </div>
      <Code block={block} />
    </div>
  );
}

export function GuideCodeBlock({ block }: { block: CodeBlock }) {
  const { id, title, lang, response } = block.fence;
  const titleId = `${id}-title`;
  return (
    <figure
      id={id}
      aria-labelledby={titleId}
      data-lang={lang}
      className="my-6 scroll-mt-24 border border-border bg-[#070010]"
    >
      <figcaption className={caption}>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {response ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
              Expected response
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {LANG_LABEL[lang]}
            </span>
          )}
          <span id={titleId} className="text-sm font-medium text-text">
            {title}
          </span>
          <AnchorLink id={id} title={title} />
          {!response && <VerifyBadge block={block} />}
        </span>
        <CopyButton targetId={`${id}-code`} title={title} />
      </figcaption>
      {block.responseTo && (
        <p className="border-b border-border px-4 py-2 font-mono text-[11px] text-muted">
          Response to{" "}
          <a href={`#${block.responseTo.id}`} className={inlineLink}>
            {block.responseTo.title}
          </a>
        </p>
      )}
      <Code block={block} />
      {block.responses.map((r) => (
        <Response key={r.fence.id} block={r} />
      ))}
    </figure>
  );
}
