/**
 * The axe scan every dispute state is judged by: the receipt, its dispute
 * receipts, the dispute form and the show-my-reason control.
 *
 * A plain `AxeBuilder.analyze()` cannot see colour contrast anywhere in this
 * interface. The card and the dialog each lay a translucent gradient under
 * their content (`data-decor`), and axe files every text node over a gradient
 * as "incomplete", never as a violation: the receipt measured 0 contrast
 * passes against 57 incomplete, and text injected at #3a3a3a on the dark
 * surface passed every scan. So this scan:
 *
 * 1. flattens each decor overlay to its LIGHTEST stop, held at that stop's
 *    own alpha. Every text colour in the console is light on a dark surface,
 *    so the lightest point of the gradient is where contrast is worst, and a
 *    pass here is a pass everywhere the gradient reaches;
 * 2. lays an open dialog out in full, so nothing is scrolled under its
 *    pinned footer — axe cannot judge a node another element covers;
 * 3. lends every empty field its placeholder as a value, in the placeholder's
 *    colour, because axe never judges a placeholder at all;
 * 4. fails on any `color-contrast` node axe still could not judge inside the
 *    scanned region, and on a region where it judged none — a check that
 *    cannot see is reported, never passed.
 *
 * All of it is undone before the scan returns. Only layout and the decor
 * change for the scan; no colour a reader sees is altered except the
 * overlay's, and that only toward the worse case.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * What axe may leave unjudged, and why it is not a contrast claim.
 *
 * A node whose only content is a symbol — ✓, ▸, ✕, ▪ — is left incomplete
 * because axe cannot tell a glyph's shape from text. Every one of these in
 * the dispute UI is `aria-hidden` decoration beside words that carry the same
 * meaning and ARE judged, which WCAG 1.4.3 exempts as incidental.
 */
const UNJUDGED_ALLOWED = ["Element content contains only non-text characters"];

/** The one-line form a failed scan prints, per rule. */
function summarise(
  id: string,
  impact: string | null | undefined,
  n: number,
  help: string,
) {
  return `${id} [${impact ?? "n/a"}] ${n} node(s) — ${help}`;
}

/** Steps 1–3 above, in the page. Returns how many overlays it flattened. */
function prepare(): number {
  type Rgba = [number, number, number, number];
  const parse = (css: string): Rgba | null => {
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  };
  const over = (top: Rgba, under: Rgba): Rgba => {
    const a = top[3] + under[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    const mix = (i: number) =>
      (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  };
  const luminance = ([r, g, b]: Rgba) => {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  /** The flat colour showing through behind `el`, ancestors composited. */
  const behind = (el: Element | null): Rgba => {
    const layers: Rgba[] = [];
    for (let node = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (c && c[3] >= 1) break;
    }
    return layers.reduceRight<Rgba>(
      (under, top) => over(top, under),
      [255, 255, 255, 1],
    );
  };

  const style = document.createElement("style");
  style.dataset.axeScan = "";
  style.textContent = `
    dialog[open] > div { max-height: none !important; }
    dialog[open] > div > div { overflow: visible !important; }
  `;
  document.head.append(style);

  // The overlay is taken out and its worst point painted into its parent's
  // own background instead: axe composites an ancestor's background exactly,
  // where a sibling layer — even a flat one — is reported as overlapping.
  let decor = 0;
  const save = (el: HTMLElement) => {
    if (el.dataset.axeSaved === undefined) {
      el.dataset.axeSaved = el.getAttribute("style") ?? "";
    }
  };
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>("[data-decor]"),
  )) {
    const parent = el.parentElement;
    const stops = (
      getComputedStyle(el).backgroundImage.match(/rgba?\([^)]+\)/g) ?? []
    )
      .map(parse)
      .filter((stop): stop is Rgba => stop !== null);
    if (!parent || stops.length === 0) continue;
    const base = behind(parent);
    const worst = stops
      .map((stop) => over(stop, base))
      .reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
    save(el);
    save(parent);
    el.style.setProperty("display", "none", "important");
    parent.style.setProperty(
      "background-color",
      `rgb(${worst.slice(0, 3).map(Math.round).join(",")})`,
      "important",
    );
    decor += 1;
  }

  // Behind an open modal the page is inert, covered and not what is being
  // judged — but axe does not model the top layer, and reads the positioned
  // page underneath as overlapping the dialog's text. Every branch off the
  // dialog's own ancestry is hidden for the scan.
  const modal = document.querySelector("dialog[open]");
  for (let node: Element | null = modal; node?.parentElement;) {
    const parent: Element = node.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      save(sibling);
      sibling.style.setProperty("visibility", "hidden", "important");
    }
    node = parent;
  }

  const scope =
    document.querySelector("dialog[open]") ?? document.querySelector("main");
  for (const field of Array.from(
    scope?.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
      "textarea[placeholder], input[placeholder]",
    ) ?? [],
  )) {
    if (field.value !== "") continue;
    save(field);
    field.dataset.axePlaceholder = "";
    field.style.setProperty(
      "color",
      getComputedStyle(field, "::placeholder").color,
      "important",
    );
    field.value = field.placeholder;
  }
  return decor;
}

/** Undoes `prepare`, leaving the page exactly as the test drove it. */
function restore(): void {
  document.querySelector("style[data-axe-scan]")?.remove();
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>("[data-axe-saved]"),
  )) {
    const saved = el.dataset.axeSaved ?? "";
    if (saved) el.setAttribute("style", saved);
    else el.removeAttribute("style");
    delete el.dataset.axeSaved;
    if ("axePlaceholder" in el.dataset) {
      (el as HTMLTextAreaElement).value = "";
      delete el.dataset.axePlaceholder;
    }
  }
}

/**
 * Every WCAG 2.1 A/AA problem axe finds on the page, plus every node in the
 * scanned region whose contrast it could not judge, as one line each. An
 * empty list is a pass.
 *
 * The region is the open dialog when there is one — the page behind a modal
 * is inert and covered, and axe rightly cannot judge it — and `<main>`
 * otherwise.
 */
export async function disputeScan(page: Page): Promise<string[]> {
  const dialogOpen = (await page.locator("dialog[open]").count()) > 0;
  // Never mid-entrance: framer-motion mounts the panel at opacity 0, and
  // `toBeVisible()` is already true then.
  if (dialogOpen) {
    await expect(page.locator("dialog[open] > div")).toHaveCSS("opacity", "1");
  }
  const decor = await page.evaluate(prepare);
  // Laid out in full, a long dialog is taller than the window, and axe cannot
  // judge a node below the fold either: the window grows to hold it.
  const viewport = page.viewportSize();
  if (dialogOpen && viewport) {
    const panel = await page
      .locator("dialog[open] > div")
      .evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
    if (panel + 64 > viewport.height) {
      await page.setViewportSize({ ...viewport, height: panel + 64 });
      // The centred panel moves once the new height is laid out; judge it
      // where it lands, not where it was a frame ago.
      await expect(page.locator("dialog[open] > div")).toBeInViewport({
        ratio: 1,
      });
    }
  }
  // The overlays are what blinded the scan; a scan that found none to
  // flatten would be the old blind scan passing quietly.
  expect(decor, "decor overlays flattened").toBeGreaterThan(0);

  let result: Awaited<ReturnType<AxeBuilder["analyze"]>>;
  try {
    result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  } finally {
    await page.evaluate(restore);
    if (viewport) await page.setViewportSize(viewport);
  }

  const selector = (n: { target: unknown[] }) => n.target.map(String).join(" ");
  const lines = result.violations.map(
    (v) =>
      `${summarise(v.id, v.impact, v.nodes.length, v.help)}: ${v.nodes
        .map(
          (n) => `${selector(n)} (${n.any.map((c) => c.message).join("; ")})`,
        )
        .join(" | ")}`,
  );

  const inScope = async (targets: string[]): Promise<boolean[]> =>
    page.evaluate(
      ({ targets, dialogOpen }) => {
        const root = dialogOpen
          ? document.querySelector("dialog[open]")
          : document.querySelector("main");
        return targets.map((t) => {
          // A target this cannot resolve is counted in: a node the scan
          // cannot place is never a node it may quietly skip.
          try {
            const el = document.querySelector(t);
            return !!(root && el && root.contains(el));
          } catch {
            return true;
          }
        });
      },
      { targets, dialogOpen },
    );

  const contrast = (list: typeof result.passes) =>
    list.find((r) => r.id === "color-contrast")?.nodes ?? [];

  const unjudged = contrast(result.incomplete);
  const unjudgedIn = await inScope(unjudged.map(selector));
  unjudged.forEach((node, i) => {
    if (!unjudgedIn[i]) return;
    const why = node.any.map((c) => c.message).join("; ");
    if (UNJUDGED_ALLOWED.some((allowed) => why.includes(allowed))) return;
    lines.push(`color-contrast [unjudged] ${selector(node)} — ${why}`);
  });

  const judged = contrast(result.passes);
  const judgedIn = (await inScope(judged.map(selector))).filter(Boolean).length;
  if (judgedIn === 0) {
    lines.push(
      "color-contrast [blind] no text in the region was judged at all",
    );
  }
  return lines;
}
