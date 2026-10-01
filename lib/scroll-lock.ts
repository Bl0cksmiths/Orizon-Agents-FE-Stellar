/**
 * How many modal surfaces (the Dialog primitive, the marketing nav's menu
 * sheet) currently hold the page still, and how to put the page back once the
 * last lets go. Counted rather than toggled so a dialog opened from inside
 * another cannot unlock the page underneath both when it closes.
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
export function lockPageScroll(): () => void {
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
