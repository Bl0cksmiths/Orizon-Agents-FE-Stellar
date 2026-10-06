/**
 * Every `.reveal` element shown at rest (app/globals.css): what the page
 * looks like when its scroll entrances cannot play. Shown without JavaScript
 * (components/ui/reveal-on-scroll.tsx), and in place of the entrances'
 * observer if it fails, so no section stays hidden at opacity 0.
 */
export const REVEAL_AT_REST_CSS = ".reveal{opacity:1;transform:none}";

export function RevealAtRest() {
  return <style>{REVEAL_AT_REST_CSS}</style>;
}
