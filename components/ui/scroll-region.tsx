"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * A horizontal scroller that says it scrolls.
 *
 * A wide table in a bare `overflow-x-auto` div looked, on a phone, like a
 * one-column table: the first column filled the card and nothing hinted that
 * the price, reputation and status columns sat to the right of it. While
 * there is more to see, this fades the edge it is hidden behind and prints a
 * hint under the region.
 *
 * Focusable and named because it scrolls: a scroll container a keyboard
 * cannot reach hides its off-screen columns from anyone without a mouse
 * (WCAG 2.1.1, axe `scrollable-region-focusable`).
 */
export function ScrollRegion({
  label,
  children,
  className,
  scrollerClassName,
}: {
  /** The region's accessible name; say that it scrolls. */
  label: string;
  children: ReactNode;
  className?: string;
  scrollerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft < max - 1;
      setEdges((prev) =>
        prev.left === left && prev.right === right ? prev : { left, right },
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // The content widens after mount (rows and reputation land later), and
    // the viewport turns; both change whether there is anything to scroll.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  const overflowing = edges.left || edges.right;
  // The edge fades are a mask on the scroller, not a gradient laid over it.
  // An overlay sat on top of the table's text, so axe measured that text
  // against the overlay and failed its contrast wherever the fade fell; a
  // mask fades the pixels without putting anything in front of them.
  const mask = edges.left
    ? edges.right
      ? "linear-gradient(to right, transparent, #000 2rem, #000 calc(100% - 2.5rem), transparent)"
      : "linear-gradient(to right, transparent, #000 2rem)"
    : edges.right
      ? "linear-gradient(to right, #000 calc(100% - 2.5rem), transparent)"
      : undefined;

  return (
    <div className={className}>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-scroll-region
        data-overflowing={overflowing ? "true" : "false"}
        // Through a variable so focus can drop the mask: a faded edge would
        // fade the focus ring with it.
        style={
          mask ? ({ "--scroll-mask": mask } as React.CSSProperties) : undefined
        }
        // `relative` keeps absolutely positioned descendants (every sr-only
        // header label) inside the scroller. Without it they took the card
        // as their containing block, escaped the clip, and widened the page
        // to the table's full width behind the body's overflow-x: hidden.
        className={cn(
          "relative overflow-x-auto [-webkit-mask-image:var(--scroll-mask,none)] [mask-image:var(--scroll-mask,none)] focus-visible:[-webkit-mask-image:none] focus-visible:[mask-image:none]",
          focusRing,
          scrollerClassName,
        )}
      >
        {children}
      </div>
      {overflowing && (
        <p
          aria-hidden="true"
          data-scroll-hint
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted"
        >
          {edges.right ? "scroll sideways for more →" : "← scroll back"}
        </p>
      )}
    </div>
  );
}
