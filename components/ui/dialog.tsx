"use client";

/**
 * Modal dialog primitive, built on the native `<dialog>` element.
 *
 * `showModal()` already does the hard parts more correctly than any userland
 * trap can: a modal focus trap, a page behind it that is inert to clicks,
 * focus AND the accessibility tree, Escape as a close request, and a
 * `::backdrop`. What it lacks is a React-shaped API, so this component owns
 * the rest.
 *
 * `open` is the single source of truth. The browser never closes the dialog
 * on its own authority here: Escape becomes a request (`onClose`) that the
 * caller answers by flipping `open`, and a close the browser forces anyway is
 * reconciled back to the prop.
 *
 * `dismissible={false}` vetoes every dismissal path at once — Escape, the
 * close button, the backdrop and a close the browser forces — for the moments
 * a dialog must not be abandoned, such as a wallet signature in flight.
 */

import { m } from "framer-motion";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type DialogProps = {
  /** Whether the dialog is shown. The dialog never changes this itself. */
  open: boolean;
  /**
   * The user asked to dismiss: Escape, the close button or a click on the
   * backdrop. The caller closes the dialog by setting `open` to false;
   * ignoring the call keeps it open.
   */
  onClose: () => void;
  /** The accessible name, rendered as the dialog's heading. */
  title: ReactNode;
  /** One line under the title, wired up as the accessible description. */
  description?: ReactNode;
  /** Small label above the title, in the console's mono eyebrow style. */
  eyebrow?: ReactNode;
  /** The scrollable body. */
  children: ReactNode;
  /**
   * Pinned below the body and never scrolled away, so the primary action stays
   * reachable on a short phone screen however long the body grows.
   */
  footer?: ReactNode;
  /**
   * Where focus lands on open. Defaults to the title: the APG's advice for a
   * dialog whose body must be read before acting, since landing on the first
   * control would scroll the explanation above it out of view.
   */
  initialFocusRef?: RefObject<HTMLElement>;
  /**
   * Where focus lands on close when the opener cannot take it back. On a
   * happy path the opener is often gone by then — the control that raised a
   * dispute is replaced by the dispute's own receipt before the buyer presses
   * Done — and focus would otherwise be left on `document.body`, from which
   * the first Tab does nothing and the whole page has to be walked again
   * (WCAG 2.4.3). Point this at something that survives the transition and
   * takes focus by script, such as a heading with `tabIndex={-1}`.
   */
  returnFocusRef?: RefObject<HTMLElement>;
  /**
   * The veto. While false, nothing the user does dismisses the dialog: Escape
   * and backdrop clicks are ignored, the close button is disabled, and a close
   * the browser forces anyway is undone. Defaults to true.
   */
  dismissible?: boolean;
  /** Accessible name of the visible close button. */
  closeLabel?: string;
  className?: string;
};

/**
 * How many dialogs currently hold the page still, and how to put the page back
 * once the last lets go. Counted rather than toggled so a dialog opened from
 * inside another cannot unlock the page underneath both when it closes.
 */
let scrollLocks = 0;
let restorePageScroll: (() => void) | null = null;

/**
 * Stops the page behind a modal from scrolling, returning the release.
 *
 * A modal dialog makes the page inert but not still: a wheel or a swipe over
 * the backdrop scrolls it. Both the root and the body are locked because the
 * global stylesheet gives BOTH an `overflow-x`, which leaves the root as the
 * real scroller — locking only the body, the usual recipe, does nothing here.
 * The vanished scrollbar's width is paid back as padding so the page does not
 * shift sideways under the backdrop.
 */
function lockPageScroll(): () => void {
  if (scrollLocks === 0) {
    const root = document.documentElement;
    const body = document.body;
    const saved = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    // clientWidth is 0 where nothing is laid out; there is no scrollbar then.
    const scrollbar = root.clientWidth
      ? window.innerWidth - root.clientWidth
      : 0;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    restorePageScroll = () => {
      root.style.overflow = saved.rootOverflow;
      body.style.overflow = saved.bodyOverflow;
      body.style.paddingRight = saved.bodyPaddingRight;
    };
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks === 0) {
      restorePageScroll?.();
      restorePageScroll = null;
    }
  };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  initialFocusRef,
  returnFocusRef,
  dismissible = true,
  closeLabel = "Close",
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pressedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Captured before showModal() moves focus inside. Browsers disagree on
    // whether closing restores it (and jsdom does nothing), so it is returned
    // explicitly: a keyboard user must land back on the control they used.
    const opener =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    if (!dialog.open) dialog.showModal();
    (initialFocusRef?.current ?? titleRef.current)?.focus();
    const releaseScroll = lockPageScroll();
    return () => {
      releaseScroll();
      if (dialog.open) dialog.close();
      // An opener the page has since removed (a button swapped for a result)
      // cannot take focus. The page names its own fallback for exactly that
      // case; with none, focus is left where it is rather than guessed at,
      // which is the old behaviour and still better than a wrong landing.
      if (opener?.isConnected) opener.focus();
      else returnFocusRef?.current?.focus();
    };
  }, [open, initialFocusRef, returnFocusRef]);

  // Escape (and the Android back gesture) arrive as `cancel`. The native
  // default would close the element behind React's back, leaving `open` true
  // with nothing on screen; turning it into a request keeps the prop in charge.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (dismissible) onClose();
  }

  // Cancelling the keydown stops Escape before it becomes a close request at
  // all. `cancel` alone is not enough for the veto: Chrome lets a page refuse
  // one close request, then closes regardless on the next Escape unless the
  // user has interacted in between.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape" && !dismissible) event.preventDefault();
  }

  // `close` fires for our own close() too — that one is already in sync. Only
  // a close the browser made while the prop still says open needs handling:
  // reported as a dismissal when that is allowed, undone when it is vetoed.
  function handleNativeClose() {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.open) return;
    if (dismissible) {
      onClose();
      return;
    }
    dialog.showModal();
    (initialFocusRef?.current ?? titleRef.current)?.focus();
  }

  // A click on `::backdrop` is dispatched to the <dialog> itself, and the
  // panel fills the element edge to edge, so "target is the dialog" means
  // "outside the panel". The press must START there too: selecting text in the
  // form and releasing past its edge also yields a click on the dialog, and
  // that must not throw away what the user was typing.
  function handlePointerDown(event: PointerEvent<HTMLDialogElement>) {
    pressedOnBackdrop.current = event.target === event.currentTarget;
  }

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    const fromBackdrop =
      pressedOnBackdrop.current && event.target === event.currentTarget;
    pressedOnBackdrop.current = false;
    if (fromBackdrop && dismissible) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={cn(
        // Below `sm` the dialog is a full-width bottom sheet; from `sm` up it is
        // a centred panel. The UA sheet centres with `margin: auto`, so the
        // sheet only has to give up its bottom margin to sit on the edge. The
        // margins are !important because the element still sits wherever the
        // page renders it: a parent's `space-y-*` reaches it through a more
        // specific sibling selector and would lift the sheet off the bottom
        // edge, or push the centred panel down.
        "!m-0 !mt-auto w-full max-w-none max-h-none overflow-visible border-0 bg-transparent p-0 text-text",
        "backdrop:bg-bg/80 backdrop:backdrop-blur-sm",
        "sm:!m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg",
        className,
      )}
    >
      {/* Content mounts only while open: a closed dialog holds no stale form
          in the DOM, and every open starts from the top and replays the
          entrance. Entrance only — an exit animation would have to hold the
          element open past `open` going false, the very drift the prop exists
          to prevent. The app's MotionConfig (reducedMotion="user") drops the
          slide for anyone who asked for less motion, leaving a plain fade. */}
      {open && (
        <m.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="clip-cyber relative flex max-h-[calc(100dvh-0.75rem)] flex-col border border-border bg-surface sm:max-h-[min(46rem,calc(100dvh-4rem))]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet/10 via-transparent to-cyan/5"
          />
          <header className="relative flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {eyebrow && (
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
                  {eyebrow}
                </p>
              )}
              {/* tabIndex -1: focusable by script as the landing point on
                  open, never a Tab stop. */}
              <h2
                id={titleId}
                ref={titleRef}
                tabIndex={-1}
                className="mt-1 text-lg font-semibold tracking-tight focus:outline-none"
              >
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label={closeLabel}
              className={cn(
                "clip-cyber-sm grid h-9 w-9 shrink-0 place-items-center border border-border font-mono text-sm text-muted transition hover:border-violet/60 hover:text-text disabled:pointer-events-none disabled:opacity-40",
                focusRing,
              )}
            >
              <span aria-hidden>✕</span>
            </button>
          </header>
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {children}
          </div>
          {footer && (
            <div className="relative border-t border-border bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
              {footer}
            </div>
          )}
        </m.div>
      )}
    </dialog>
  );
}
