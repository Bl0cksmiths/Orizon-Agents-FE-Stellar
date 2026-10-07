/**
 * Every `.reveal` element shown at rest (app/globals.css), whether or not the
 * page was armed for its entrances: what stands in for the entrances'
 * observer (components/ui/reveal-on-scroll.tsx) if it fails, so no section
 * stays hidden at opacity 0.
 */
export const REVEAL_AT_REST_CSS =
  ".reveal,[data-reveal] .reveal{opacity:1;transform:none}";

export function RevealAtRest() {
  return <style>{REVEAL_AT_REST_CSS}</style>;
}
