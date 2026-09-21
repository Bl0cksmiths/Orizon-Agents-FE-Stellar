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
 */

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type DialogProps = {
  /** Whether the dialog is shown. The dialog never changes this itself. */
  open: boolean;
  /**
   * The user asked to dismiss: Escape or the close button. The caller closes
   * the dialog by setting `open` to false; ignoring the call keeps it open.
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
  /** Accessible name of the visible close button. */
  closeLabel?: string;
  className?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  closeLabel = "Close",
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  // Escape (and the Android back gesture) arrive as `cancel`. The native
  // default would close the element behind React's back, leaving `open` true
  // with nothing on screen; turning it into a request keeps the prop in charge.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  // `close` fires for our own close() too — that one is already in sync. Only
  // a close the browser made while the prop still says open needs reporting.
  function handleNativeClose() {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.open) return;
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      className={cn(
        // Below `sm` the dialog is a full-width bottom sheet; from `sm` up it is
        // a centred panel. The UA sheet centres with `margin: auto`, so the
        // sheet only has to give up its bottom margin to sit on the edge.
        "m-0 mt-auto w-full max-w-none max-h-none overflow-visible border-0 bg-transparent p-0 text-text",
        "backdrop:bg-bg/80 backdrop:backdrop-blur-sm",
        "sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg",
        className,
      )}
    >
      {/* Content mounts only while open: a closed dialog holds no stale form
          in the DOM, and every open starts from the top. */}
      {open && (
        <div className="clip-cyber relative flex max-h-[calc(100dvh-0.75rem)] flex-col border border-border bg-surface sm:max-h-[min(46rem,calc(100dvh-4rem))]">
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
              <h2
                id={titleId}
                className="mt-1 text-lg font-semibold tracking-tight"
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
              aria-label={closeLabel}
              className={cn(
                "clip-cyber-sm grid h-9 w-9 shrink-0 place-items-center border border-border font-mono text-sm text-muted transition hover:border-violet/60 hover:text-text",
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
        </div>
      )}
    </dialog>
  );
}
