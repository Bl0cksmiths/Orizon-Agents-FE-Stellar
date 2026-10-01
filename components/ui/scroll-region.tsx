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

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={ref}
          role="region"
          aria-label={label}
          tabIndex={0}
          data-scroll-region
          data-overflowing={overflowing ? "true" : "false"}
          // `relative` keeps absolutely positioned descendants (every sr-only
          // header label) inside the scroller. Without it they took the card
          // as their containing block, escaped the clip, and widened the page
          // to the table's full width behind the body's overflow-x: hidden.
          className={cn(
            "relative overflow-x-auto",
            focusRing,
            scrollerClassName,
          )}
        >
          {children}
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent transition-opacity",
            edges.left ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent transition-opacity",
            edges.right ? "opacity-100" : "opacity-0",
          )}
        />
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
