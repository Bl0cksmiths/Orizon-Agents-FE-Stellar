"use client";

import { useEffect } from "react";
import { faultPoint } from "@/lib/fault-injection";

/** Set on <html> once the observer is watching: only then do `.reveal`
 * elements wait hidden for their entrance (app/globals.css). */
const ARMED = "data-reveal";

/**
 * Plays every `.reveal` entrance on the page (app/globals.css) once its
 * element is 60px inside the screen, and never again. One observer serves the
 * whole page, so the sections stay server components. Mount it once per page
 * that uses `.reveal`.
 *
 * Nothing is hidden until this is watching. Until it arms the page, every
 * section is shown at rest: without JavaScript, when its code fails to load,
 * and to a crawler's renderer that never runs it, so no section is ever left
 * invisible by a script that did not run. An element already on screen when
 * it arms stays shown rather than vanishing to play its entrance.
 */
export function RevealOnScroll() {
  faultPoint("reveal");
  useEffect(() => {
    const pending = document.querySelectorAll<HTMLElement>(
      ".reveal:not([data-revealed])",
    );
    const show = (el: Element) => el.setAttribute("data-revealed", "");

    if (typeof IntersectionObserver === "undefined") {
      pending.forEach(show);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "-60px" },
    );
    const viewport = window.innerHeight;
    pending.forEach((el) => {
      const { top, bottom } = el.getBoundingClientRect();
      if (bottom > 0 && top < viewport) show(el);
      else observer.observe(el);
    });
    const root = document.documentElement;
    root.setAttribute(ARMED, "armed");
    return () => {
      observer.disconnect();
      root.removeAttribute(ARMED);
    };
  }, []);

  return null;
}
