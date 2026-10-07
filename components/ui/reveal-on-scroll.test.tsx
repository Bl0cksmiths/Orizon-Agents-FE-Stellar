// @vitest-environment jsdom
/**
 * The marketing sections are server components; their scroll entrances are a
 * CSS class (`.reveal`) that this one observer switches on. It must reveal an
 * element once it is in view and only then, keep it revealed, and still show
 * everything where IntersectionObserver is missing.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RevealOnScroll } from "./reveal-on-scroll";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let observers: FakeObserver[] = [];

class FakeObserver {
  observed = new Set<Element>();
  options: IntersectionObserverInit | undefined;
  constructor(
    private callback: Callback,
    options?: IntersectionObserverInit,
  ) {
    this.options = options;
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  /** Reports `el` as entering (or leaving) the screen. */
  fire(el: Element, isIntersecting: boolean) {
    this.callback([{ target: el, isIntersecting }]);
  }
}

function page() {
  document.body.innerHTML = `
    <div id="a" class="reveal"></div>
    <div id="b" class="reveal"></div>
    <div id="plain"></div>`;
  return {
    a: document.getElementById("a")!,
    b: document.getElementById("b")!,
    plain: document.getElementById("plain")!,
  };
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("RevealOnScroll", () => {
  it("watches every .reveal element and nothing else", () => {
    const { a, b, plain } = page();
    render(<RevealOnScroll />);
    expect(observers).toHaveLength(1);
    expect([...observers[0].observed]).toEqual([a, b]);
    expect(observers[0].observed.has(plain)).toBe(false);
    expect(observers[0].options?.rootMargin).toBe("-60px");
  });

  it("reveals an element only once it is in view", () => {
    const { a, b } = page();
    render(<RevealOnScroll />);
    expect(a.hasAttribute("data-revealed")).toBe(false);

    observers[0].fire(a, false);
    expect(a.hasAttribute("data-revealed")).toBe(false);

    observers[0].fire(a, true);
    expect(a.hasAttribute("data-revealed")).toBe(true);
    expect(b.hasAttribute("data-revealed")).toBe(false);
  });

  it("stops watching a revealed element, so it never hides again", () => {
    const { a } = page();
    render(<RevealOnScroll />);
    observers[0].fire(a, true);
    expect(observers[0].observed.has(a)).toBe(false);
  });

  it("disconnects when the page goes away", () => {
    page();
    const { unmount } = render(<RevealOnScroll />);
    unmount();
    expect(observers[0].observed.size).toBe(0);
  });

  it("reveals everything at once without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { a, b } = page();
    render(<RevealOnScroll />);
    expect(a.hasAttribute("data-revealed")).toBe(true);
    expect(b.hasAttribute("data-revealed")).toBe(true);
  });

  it("hides nothing until it is watching: it arms the entrances itself", () => {
    // Before this runs (no script, a script that failed to load, a renderer
    // that never ran it) every section is shown at rest (app/globals.css).
    page();
    const root = document.documentElement;
    expect(root.hasAttribute("data-reveal")).toBe(false);
    const { unmount } = render(<RevealOnScroll />);
    expect(root.getAttribute("data-reveal")).toBe("armed");
    unmount();
    expect(root.hasAttribute("data-reveal")).toBe(false);
  });

  it("keeps an element already on screen shown, rather than hiding it to play its entrance", () => {
    const { a, b } = page();
    a.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect;
    render(<RevealOnScroll />);
    expect(a.hasAttribute("data-revealed")).toBe(true);
    expect(observers[0].observed.has(a)).toBe(false);
    expect(b.hasAttribute("data-revealed")).toBe(false);
    expect(observers[0].observed.has(b)).toBe(true);
  });

  it("arms nothing without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    page();
    render(<RevealOnScroll />);
    expect(document.documentElement.hasAttribute("data-reveal")).toBe(false);
  });
});
