/**
 * Named places where the browser end-to-end suite can make a component throw,
 * to prove that a failure there stays local (components/isolate.tsx) and
 * never replaces the page.
 *
 * Off unless the build was made with NEXT_PUBLIC_FAULT_INJECTION=1, which
 * only the Playwright servers set. Next inlines the variable at build time,
 * so in any other build `faultPoint` is an empty function and the minifier
 * drops its body. Even when on, nothing throws until the page itself asks
 * for it: the suite lists the points to break in `window.__ORIZON_FAULTS__`
 * before the page's scripts run.
 */

/** Every point a test can break, by the part of the page it stands in. */
export const FAULT_POINTS = [
  "wallet",
  "nav",
  "connect-wallet",
  "reveal",
  "use-cases",
  "backend-warmup",
  "demo-player",
  "copy-button",
] as const;

export type FaultPoint = (typeof FAULT_POINTS)[number];

/** The window property the suite sets, listing the points to break. */
export const FAULTS_GLOBAL = "__ORIZON_FAULTS__";

/** The error a broken point throws, so a test can tell it from a real one. */
export function injectedFaultMessage(point: FaultPoint): string {
  return `injected fault: ${point}`;
}

/**
 * Throws when this build has fault injection on and the page asked for
 * `point` to fail. Call it at the top of a component's render. Only in the
 * browser: the server render always succeeds, as it does in production, so
 * the failure lands where a crawler's renderer would meet it, in hydration.
 */
export function faultPoint(point: FaultPoint): void {
  if (process.env.NEXT_PUBLIC_FAULT_INJECTION !== "1") return;
  if (typeof window === "undefined") return;
  const wanted = (window as unknown as Record<string, unknown>)[FAULTS_GLOBAL];
  if (Array.isArray(wanted) && wanted.includes(point)) {
    throw new Error(injectedFaultMessage(point));
  }
}
