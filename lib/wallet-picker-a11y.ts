/**
 * Accessibility shim for the third-party wallet picker
 * (@creit.tech/stellar-wallets-kit, verified against 2.1.0).
 *
 * The kit's modal ships no Escape handler, no accessible name on its close
 * control, and — worse — renders its wallet rows as `<li onClick>` with no role
 * or tabindex, so a keyboard user cannot even select a wallet. Connecting is
 * step one of every wallet journey, so that is the first thing a keyboard or
 * screen-reader user hits.
 *
 * This adds the missing affordances from the outside without owning the modal:
 * Escape routes to the kit's OWN close path (the caller passes it in), so the
 * keyboard and the mouse can never drift apart. Everything here is additive —
 * no kit DOM is moved or removed, and attributes survive the kit's re-renders —
 * and every lookup fails soft, because a kit DOM change must degrade this to a
 * no-op, never break connecting.
 */

/** The only class the kit does not hash (its twind runs with `hash: true`). */
const ROOT_SELECTOR = "section.stellar-wallets-kit";
/** `d` prefix of the kit's X icon, from its shared header component. */
const CLOSE_ICON_D = "M11.9997 10.5865";
const CLOSE_LABEL = "Close wallet picker";

/** The kit's close control: the X icon, else the last button in its header. */
function findCloseButton(root: HTMLElement): HTMLElement | null {
  const header = root.querySelector("header");
  if (!header) return null;
  const buttons = Array.from(header.querySelectorAll<HTMLElement>("button"));
  if (buttons.length === 0) return null;
  const byIcon = buttons.find((b) =>
    b.querySelector("svg path")?.getAttribute("d")?.startsWith(CLOSE_ICON_D),
  );
  return byIcon ?? buttons[buttons.length - 1];
}

/**
 * Install the shim for as long as the picker is open. `requestClose` must
 * trigger the kit's own close path. Returns a disposer — call it in a `finally`
 * so the listener and observer can never outlive the modal.
 */
export function installWalletPickerA11y(requestClose: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  const opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const root = () => document.querySelector<HTMLElement>(ROOT_SELECTOR);

  /** Idempotent and total: safe to re-run on every mutation, never throws. */
  const decorate = () => {
    try {
      const el = root();
      if (!el) return;

      // Dialog semantics on the card (its sibling <div> is the backdrop).
      const card = el.querySelector<HTMLElement>(":scope > section");
      if (card && !card.hasAttribute("role")) {
        const title = card.querySelector<HTMLElement>("h1");
        if (title && !title.id) title.id = "swk-a11y-title";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        if (title) card.setAttribute("aria-labelledby", title.id);
        else card.setAttribute("aria-label", "Connect a wallet");
        card.tabIndex = -1;
        if (!el.contains(document.activeElement)) card.focus();
      }

      const close = findCloseButton(el);
      if (close && !close.getAttribute("aria-label")) {
        close.setAttribute("aria-label", CLOSE_LABEL);
      }

      // The wallet rows ship as plain <li onClick> — unreachable by keyboard.
      for (const li of Array.from(el.querySelectorAll<HTMLElement>("li"))) {
        if (li.getAttribute("role") === "button") continue;
        li.setAttribute("role", "button");
        li.tabIndex = 0;
      }
    } catch {
      /* a kit DOM change must never break connecting */
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = root();
    if (!el) return; // picker not open — leave the app's own handlers alone
    if (e.key === "Escape") {
      e.preventDefault();
      // Capture phase + stopImmediatePropagation: the picker is topmost, so
      // Escape must not ALSO close the console drawer or the marketing nav.
      e.stopImmediatePropagation();
      requestClose();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const row = target?.closest<HTMLElement>('li[role="button"]');
      if (row && el.contains(row)) {
        e.preventDefault();
        // preact binds its onClick with addEventListener, so a native click
        // drives the kit's own selection handler.
        row.click();
      }
    }
  };

  const observer = new MutationObserver(decorate);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("keydown", onKeyDown, true);
  decorate(); // the kit renders synchronously, so this usually already hits

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    document.removeEventListener("keydown", onKeyDown, true);
    // Restore focus to the opener on the next frame: the Connect button stays
    // disabled until React flushes, and focusing a disabled button silently
    // drops focus to <body>.
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0);
    raf(() => {
      if (
        opener?.isConnected &&
        !(opener instanceof HTMLButtonElement && opener.disabled)
      ) {
        opener.focus();
      }
    });
  };
}
