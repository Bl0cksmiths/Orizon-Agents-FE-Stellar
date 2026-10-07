"use client";

/**
 * The marketing nav below `lg`: a toggle, and the sheet it opens.
 *
 * The sheet is a native modal `<dialog>`, for the parts a userland overlay
 * gets wrong: the page behind it is inert to clicks, focus and the
 * accessibility tree, and Escape arrives as a close request. On top of that:
 *
 * - focus lands on the first link, and Tab wraps inside the sheet both ways;
 * - the page behind cannot scroll (the shared counted lock);
 * - Escape, the close button, a press on the backdrop (from `sm`, where the
 *   sheet is a side panel), a followed link and a route change all close it,
 *   and focus goes back to the toggle;
 * - growing the window past `lg`, where the desktop bar takes over, closes it.
 *
 * The sheet is always in the DOM — a closed dialog is not rendered — so its
 * links are in the server HTML; `open` alone decides whether it is shown.
 */

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type SyntheticEvent,
} from "react";
import { ButtonLink } from "@/components/ui/button";
import { Isolate } from "@/components/isolate";
import {
  ConnectWallet,
  WalletUnavailableNote,
} from "@/components/ui/connect-wallet";
import { Logo } from "@/components/ui/logo";
import { lockPageScroll } from "@/lib/scroll-lock";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { isCurrent, SHEET_SECTIONS, type NavLink } from "./links";

export const MOBILE_MENU_ID = "marketing-mobile-menu";

/** Where the desktop bar takes over; the sheet closes past it. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sheet's entrance, played on the panel each time it opens. The panel's
 * own style is already the end state, so the animation only ever adds
 * motion: a browser without the Web Animations API, a reader who asked for
 * less motion, or an open that races the page's hydration all still get a
 * fully visible sheet — never one stuck at its first frame.
 */
function slideIn(panel: HTMLElement | null) {
  if (!panel || typeof panel.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  panel.animate(
    [
      { opacity: 0, transform: "translateX(24px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

export type MobileMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string | null;
};

export function MobileMenu({ open, onOpenChange, pathname }: MobileMenuProps) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    firstLinkRef.current?.focus();
    slideIn(panelRef.current);
    const releaseScroll = lockPageScroll();
    const toggle = toggleRef.current;
    const desktop = window.matchMedia?.(DESKTOP_QUERY);
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onOpenChange(false);
    };
    desktop?.addEventListener("change", onDesktop);
    return () => {
      desktop?.removeEventListener("change", onDesktop);
      releaseScroll();
      if (dialog.open) dialog.close();
      toggle?.focus();
    };
  }, [open, onOpenChange]);

  // Escape (and the Android back gesture) arrive as `cancel`; the native
  // default would close the element behind React's back.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onOpenChange(false);
  }

  // A close the browser made on its own while `open` still says shown.
  function handleNativeClose() {
    if (open && !dialogRef.current?.open) onOpenChange(false);
  }

  // A modal dialog keeps focus off the page but lets Tab leave for the
  // browser's own controls; wrapping keeps it in the sheet.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const all = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (all.length === 0) return;
    const first = all[0];
    const last = all[all.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // From `sm` the sheet is a side panel and the rest of the dialog box is
  // backdrop. A press that starts and ends there closes the sheet; any link
  // followed inside it does too (a section link on the home page changes
  // only the hash, not the route).
  function handlePointerDown(event: PointerEvent<HTMLDialogElement>) {
    pressedOnBackdrop.current = event.target === event.currentTarget;
  }

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    const fromBackdrop =
      pressedOnBackdrop.current && event.target === event.currentTarget;
    pressedOnBackdrop.current = false;
    if (fromBackdrop || (event.target as Element).closest("a[href]")) {
      onOpenChange(false);
    }
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={MOBILE_MENU_ID}
        aria-label="Open menu"
        onClick={() => onOpenChange(true)}
        className={cn(
          "grid h-9 w-9 place-items-center text-muted transition-colors hover:text-text lg:hidden [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
          focusRing,
        )}
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
          <path
            d="M3 5h14M3 10h14M7 15h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        id={MOBILE_MENU_ID}
        aria-labelledby={titleId}
        onCancel={handleCancel}
        onClose={handleNativeClose}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        className={cn(
          // Full screen on a phone; from `sm`, a panel on the right over a
          // dimmed page. The UA sheet's margin, size caps, padding and border
          // all give way.
          "!m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-transparent p-0 text-text",
          "sm:!ml-auto sm:max-w-sm",
          "backdrop:bg-bg/70 backdrop:backdrop-blur-sm",
        )}
      >
        <div
          ref={panelRef}
          className="relative flex h-full flex-col bg-surface sm:border-l sm:border-border"
        >
          <div
            aria-hidden
            data-decor
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet/10 via-transparent to-cyan/5"
          />

          <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
            <Logo />
            <h2 id={titleId} className="sr-only">
              Menu
            </h2>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => onOpenChange(false)}
              className={cn(
                "chamfer-edges chamfer-edges-sm relative clip-cyber-sm grid h-9 w-9 place-items-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 border border-[color:var(--edge)] text-muted transition [--edge:rgba(176,38,255,0.18)] hover:text-text hover:[--edge:rgba(176,38,255,0.6)]",
                focusRing,
              )}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4"
                aria-hidden
              >
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* The scroller is a plain div around the nav, the shape the axe
              scan in e2e/dispute-axe.ts lays out in full for judging. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <nav aria-label="Site" className="px-6 py-6">
              {SHEET_SECTIONS.map((section, s) => (
                <div key={section.id} className={cn(s > 0 && "mt-8")}>
                  <h3
                    id={`${titleId}-${section.id}`}
                    className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan"
                  >
                    <span aria-hidden className="h-px w-6 bg-cyan/60" />
                    {section.label}
                  </h3>
                  <ul className="space-y-1">
                    {section.links.map((link, i) => (
                      <li key={link.href}>
                        <SheetLink
                          link={link}
                          current={isCurrent(link, pathname)}
                          linkRef={
                            s === 0 && i === 0 ? firstLinkRef : undefined
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="relative grid shrink-0 gap-3 border-t border-border bg-surface px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
            {/* The wallet picker opens over the page, which this modal sheet
                makes inert: the sheet steps aside first. */}
            <div onClickCapture={() => onOpenChange(false)}>
              <Isolate
                name="sheet-wallet"
                fallback={<WalletUnavailableNote className="justify-center" />}
              >
                <ConnectWallet
                  size="md"
                  variant="outline"
                  className="w-full justify-center [&>button]:flex-1 [@media(pointer:coarse)]:[&>button]:min-h-11"
                />
              </Isolate>
            </div>
            <ButtonLink
              href="/app"
              size="md"
              variant="primary"
              className="w-full whitespace-nowrap [@media(pointer:coarse)]:min-h-11"
            >
              Launch App <span aria-hidden>▸</span>
            </ButtonLink>
          </div>
        </div>
      </dialog>
    </>
  );
}

function SheetLink({
  link,
  current,
  linkRef,
}: {
  link: NavLink;
  current: boolean;
  linkRef?: Ref<HTMLAnchorElement>;
}) {
  const id = useId();
  return (
    <Link
      ref={linkRef}
      href={link.href}
      aria-current={current ? "page" : undefined}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-description`}
      className={cn(
        "block border-l-2 px-3 py-2.5 transition-colors hover:bg-white/5",
        current ? "border-cyan bg-cyan/5" : "border-transparent",
        focusRing,
      )}
    >
      <span
        id={`${id}-label`}
        className={cn(
          "block font-mono text-xs uppercase tracking-[0.22em]",
          current ? "text-cyan" : "text-text",
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
    </Link>
  );
}
