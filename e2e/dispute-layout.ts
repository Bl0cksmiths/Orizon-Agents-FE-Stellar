/**
 * Sideways overflow in the dispute UI at a phone's width.
 *
 * Width is the direction a phone cannot recover: the console hides
 * horizontal overflow on html and body, so content past the right edge is not
 * scrolled to — it is cut off. Worse, most of this UI sits inside
 * `clip-cyber` shapes, which crop whatever spills out of them without a
 * scrollbar or a trace.
 *
 * The first version of this check measured element BOXES only. A box keeps
 * its width while the text inside it runs on: a 64-character hash with its
 * wrapping removed stayed in a 234px paragraph, painted to x=511 on a 360px
 * screen, was cropped by the card — and passed. So it now measures what is
 * painted as well:
 *
 * - any element whose content is wider than its own box (`scrollWidth` past
 *   `clientWidth`), whatever its `overflow` — text cropped by an ancestor is
 *   as lost as text past the screen edge;
 * - every run of text, by the rectangles its glyphs occupy, against the
 *   viewport.
 */
import type { Locator } from "@playwright/test";

/** Every offender inside `root`, as a readable line; empty is a pass. */
export async function horizontalOverflow(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const limit = document.documentElement.clientWidth + 1;
    const offenders: string[] = [];
    const describe = (
      node: Element,
      left: number,
      right: number,
      why: string,
    ) =>
      `<${node.tagName.toLowerCase()}> ${Math.round(left)}–${Math.round(right)}px ${why} "${(node.textContent ?? "").trim().slice(0, 40)}"`;

    // Visually hidden on purpose — the 1px box with its text clipped away is
    // how screen-reader-only text is built, not an overflow.
    const srOnly = (node: Element): boolean => {
      for (let n: Element | null = node; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (
          s.position === "absolute" &&
          parseFloat(s.width) <= 1 &&
          s.overflow === "hidden"
        ) {
          return true;
        }
      }
      return false;
    };

    for (const node of [el, ...Array.from(el.querySelectorAll("*"))]) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || srOnly(node)) continue;
      if (box.left < -1 || box.right > limit) {
        offenders.push(describe(node, box.left, box.right, "box off-screen"));
        continue;
      }
      // Inline boxes report no client width; their text is measured below.
      if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1) {
        offenders.push(
          describe(
            node,
            box.left,
            box.left + node.scrollWidth,
            `content ${node.scrollWidth}px in a ${node.clientWidth}px box`,
          ),
        );
      }
    }

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (!parent || !text.textContent?.trim() || srOnly(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && (rect.left < -1 || rect.right > limit)) {
          offenders.push(
            describe(parent, rect.left, rect.right, "text off-screen"),
          );
          break;
        }
      }
    }
    return offenders;
  });
}
