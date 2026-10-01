"use client";

/**
 * One of the desktop bar's menus: a disclosure button and the panel of links
 * it shows (the APG disclosure pattern, not an ARIA `menu` — these are plain
 * page links, and a screen reader should hear them as links).
 *
 * - Click (or Enter/Space) toggles it; there is no hover-only path.
 * - ArrowDown/ArrowUp on the button open it and land on the first/last link;
 *   inside, the arrows move between links (wrapping) and Home/End jump.
 * - Escape closes it and returns focus to the button. A press outside it, or
 *   Tab moving focus out of it, closes it too.
 * - Which menu is open is the bar's state, so opening one closes the other.
 */

import Link from "next/link";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { isCurrent, groupIsCurrent, type NavGroup } from "./links";

export type NavMenuProps = {
  group: NavGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string | null;
};

export function NavMenu({ group, open, onOpenChange, pathname }: NavMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `nav-menu-${group.id}`;
  const current = groupIsCurrent(group, pathname);

  // Dismissal from anywhere on the page while open: Escape, or a press that
  // starts outside the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const hadFocus = rootRef.current?.contains(document.activeElement);
      onOpenChange(false);
      if (hadFocus) buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const links = () => Array.from(panelRef.current?.querySelectorAll("a") ?? []);

  /** Moves focus to a link by index, wrapping at both ends. */
  function focusLink(index: number) {
    const all = links();
    if (all.length === 0) return;
    all[(index + all.length) % all.length].focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    // Shown synchronously, so the link is visible — and focusable — by the
    // time focus moves to it.
    flushSync(() => onOpenChange(true));
    focusLink(event.key === "ArrowDown" ? 0 : -1);
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = links();
    const index = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (index === -1) return;
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: all.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusLink(moves[event.key]);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // Tab past the last link (or back past the button) closes the menu.
        // A blur to nowhere — the window losing focus — leaves it open.
        const next = event.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) {
          onOpenChange(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onButtonKeyDown}
        data-current={current || undefined}
        className={cn(
          "group relative flex h-9 items-center gap-1.5 whitespace-nowrap px-3 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors [@media(pointer:coarse)]:min-h-11",
          open || current ? "text-text" : "text-muted hover:text-text",
          focusRing,
        )}
      >
        {group.label}
        <svg
          viewBox="0 0 10 6"
          aria-hidden="true"
          className={cn(
            "h-1.5 w-2.5 transition-transform duration-200 motion-reduce:transition-none",
            open ? "rotate-180 text-cyan" : "text-muted",
          )}
        >
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <CurrentMark show={current} />
      </button>

      {/* Always rendered, only hidden: the links stay in the server HTML,
          and the panel can fade as well as appear. `invisible` takes it out
          of the tab order and the accessibility tree while closed. */}
      <div
        ref={panelRef}
        id={panelId}
        data-state={open ? "open" : "closed"}
        onKeyDown={onPanelKeyDown}
        className={cn(
          "absolute left-1/2 top-full z-10 -translate-x-1/2 pt-3",
          "duration-150 ease-out motion-reduce:transition-none",
          // Visibility flips at once on the way in — a transition would hold
          // it at `hidden` for the first frame, where focus() on a link fails
          // — and waits out the fade on the way out.
          open
            ? "visible translate-y-0 opacity-100 transition-[opacity,transform]"
            : "pointer-events-none invisible -translate-y-1 opacity-0 transition-[opacity,transform,visibility]",
        )}
      >
        {/* Opaque, not frosted: the header's own backdrop-filter becomes the
            panel's backdrop root, so a blur here would see only the header
            and the hero's headline would read straight through. */}
        <div className="clip-cyber relative w-[24rem] border border-border bg-surface p-2 shadow-inner-glow">
          <div
            aria-hidden
            data-decor
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet/10 via-transparent to-cyan/5"
          />
          <ul className="relative">
            {group.links.map((link, i) => (
              <li key={link.href}>
                <MenuLink
                  link={link}
                  index={i}
                  current={isCurrent(link, pathname)}
                  onNavigate={() => onOpenChange(false)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The short cyan bar under a top-level item whose page is open. */
export function CurrentMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="absolute inset-x-3 -bottom-0.5 h-px bg-cyan shadow-[0_0_8px_rgba(0,255,209,0.8)]"
    />
  );
}

function MenuLink({
  link,
  index,
  current,
  onNavigate,
}: {
  link: NavGroup["links"][number];
  index: number;
  current: boolean;
  onNavigate: () => void;
}) {
  // Named by its label alone, described by its one line: "Litepaper", not
  // "Litepaper The protocol in full…", is what a screen reader reads first
  // and what a voice user says.
  const id = useId();
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      className={cn(
        "group/link flex gap-3 px-3 py-2.5 transition-colors hover:bg-white/5",
        current && "bg-cyan/5",
        focusRing,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pt-px font-mono text-[10px] tracking-[0.2em]",
          current ? "text-cyan" : "text-violet-readable",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0">
        <span
          id={`${id}-label`}
          className={cn(
            "block font-mono text-[11px] uppercase tracking-[0.22em] transition-colors",
            current ? "text-cyan" : "text-text group-hover/link:text-cyan",
          )}
        >
          {link.label}
        </span>
        <span
          id={`${id}-description`}
          className="mt-1 block text-[13px] leading-snug text-muted"
        >
          {link.description}
        </span>
      </span>
    </Link>
  );
}
