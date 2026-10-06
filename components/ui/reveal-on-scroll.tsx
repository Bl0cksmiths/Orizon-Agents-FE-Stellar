"use client";

import { useEffect } from "react";
import { RevealAtRest } from "./reveal-at-rest";

/**
 * Plays every `.reveal` entrance on the page (app/globals.css) once its
 * element is 60px inside the screen, and never again. One observer serves the
 * whole page, so the sections stay server components. Mount it once per page
 * that uses `.reveal`.
 *
 * Without JavaScript the noscript style shows every element at rest.
 */
export function RevealOnScroll() {
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
    pending.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <noscript>
      <RevealAtRest />
    </noscript>
  );
}
