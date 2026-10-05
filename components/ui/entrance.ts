import type { CSSProperties } from "react";

/**
 * Timing for one `.enter` or `.reveal` entrance (app/globals.css), as the CSS
 * custom properties those classes read. Server components animate with these
 * instead of a motion library, so an entrance costs no JavaScript.
 *
 *   <div className="reveal" style={entrance({ delay: i * 0.08 })}>
 */
export function entrance({
  delay = 0,
  duration,
  from,
  fade = true,
}: {
  /** Seconds before it starts. */
  delay?: number;
  /** Seconds it runs; the stylesheet's default is 0.5. */
  duration?: number;
  /** The transform it starts from; the stylesheet's default is 24px below. */
  from?: string;
  /**
   * Whether an `.enter` fades in as it moves. Not for a page's largest text:
   * Chrome counts an element as painted, for Largest Contentful Paint, only
   * once an opacity animation on it has run, so a fade-in holds LCP back by
   * the whole entrance.
   */
  fade?: boolean;
} = {}): CSSProperties {
  const vars: Record<string, string> = {};
  if (delay) vars["--motion-delay"] = `${delay}s`;
  if (duration !== undefined) vars["--motion-duration"] = `${duration}s`;
  if (from !== undefined) vars["--motion-from"] = from;
  if (!fade) vars["--motion-opacity"] = "1";
  return vars as CSSProperties;
}
