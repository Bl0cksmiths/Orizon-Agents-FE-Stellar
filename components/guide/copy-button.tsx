"use client";
/**
 * The copy button on a guide code block: the only JavaScript the guide ships
 * for its content.
 *
 * It copies the text of the `<code>` element it points at, rather than taking
 * the code as a prop, so the code is not serialised into the page a second
 * time. Rendered disabled on the server and enabled once hydrated, so with
 * JavaScript off it reads as the inert control it is instead of a button that
 * does nothing. The result is announced in a polite live region that stays
 * mounted, since a region that appears together with its text is often not
 * read. If the clipboard is unavailable, the code is selected instead so the
 * reader can copy it by hand.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/ui";

const RESET_MS = 2_000;

export function CopyButton({
  targetId,
  title,
}: {
  /** The id of the element whose text is copied. */
  targetId: string;
  /** The block's caption, which names the button. */
  title: string;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setReady(true);
    return () => clearTimeout(timer.current);
  }, []);

  const say = (text: string) => {
    clearTimeout(timer.current);
    setStatus(text);
    timer.current = setTimeout(() => setStatus(""), RESET_MS);
  };

  const onCopy = async () => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const text = target.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      say("Copied");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      say("Selected — press Ctrl+C or ⌘C to copy");
    }
  };

  return (
    <span className="flex items-center gap-2">
      <span
        role="status"
        aria-live="polite"
        className="font-mono text-[10px] uppercase tracking-widest text-cyan"
      >
        {status}
      </span>
      <button
        type="button"
        onClick={onCopy}
        disabled={!ready}
        aria-label={`Copy ${title}`}
        className={cn(
          "border border-input px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-text transition-colors hover:border-cyan hover:text-cyan disabled:cursor-not-allowed disabled:opacity-50",
          focusRing,
        )}
      >
        Copy
      </button>
    </span>
  );
}
