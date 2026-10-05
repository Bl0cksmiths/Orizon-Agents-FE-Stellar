/**
 * What the error boundaries do with an error: name its kind, and decide
 * whether a hard reload can fix it without the visitor ever seeing an error
 * screen.
 *
 * Kinds:
 *   - "chunk"   the page asked for code it cannot get: a lazy chunk from a
 *               deployment that has since been replaced (deploy skew), or a
 *               script lost to a flaky connection. A hard reload fetches the
 *               current deployment's HTML and its own chunks, so the boundary
 *               reloads ONCE by itself (`claimAutoReload`).
 *   - "network" the backend or the connection failed. A reload may help, but
 *               only the visitor can tell when the connection is back.
 *   - "render"  a fault in the page itself.
 */

export type ErrorKind = "chunk" | "network" | "render";

const CHUNK_MESSAGES = [
  // webpack: a JS or CSS chunk that did not load.
  /^Loading (CSS )?chunk \S+ failed/i,
  // Native dynamic import(), as Chrome, Firefox and Safari word it.
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  // webpack asked for a module its loaded chunks do not hold: a runtime from
  // one build reading a chunk of another.
  /\(reading 'call'\)$/,
  /\(evaluating '[^']*\.call'\)$/,
];

const NETWORK_MESSAGES = [
  /^Failed to fetch$/i,
  /^NetworkError when attempting to fetch resource/i,
  /^Load failed$/i,
];

/** The error's kind; anything unrecognised is "render". Never throws. */
export function classifyError(error: unknown): ErrorKind {
  if (!(error instanceof Error)) return "render";
  const { name, message } = error;
  if (name === "ChunkLoadError") return "chunk";
  if (CHUNK_MESSAGES.some((re) => re.test(message))) return "chunk";
  // The API client's refusal (lib/api.ts), matched by name so the boundary
  // bundle does not pull the client in.
  if (name === "ApiError" || name === "AbortError" || name === "TimeoutError") {
    return "network";
  }
  if (NETWORK_MESSAGES.some((re) => re.test(message))) return "network";
  return "render";
}

/** Where this tab records its last automatic reload (sessionStorage). */
export const AUTO_RELOAD_KEY = "orizon:auto-reload";
/** A second failure this soon after an automatic reload means the reload did
 * not fix it: the error screen is shown instead of reloading again. */
export const AUTO_RELOAD_WINDOW_MS = 60_000;

/**
 * Claims this tab's automatic reload: true at most once per
 * `AUTO_RELOAD_WINDOW_MS`, and only when the claim is recorded. Without a
 * record (storage blocked, full, or silently dropping writes) a reload that
 * does not fix the page could reload forever, so the answer is then false and
 * the visitor gets the error screen with its Reload button instead.
 */
export function claimAutoReload(
  getStorage: () => Storage,
  now: number,
): boolean {
  try {
    const storage = getStorage();
    const last = Number(storage.getItem(AUTO_RELOAD_KEY));
    // A record from the future (a clock set back) counts as recent too.
    if (last > 0 && Math.abs(now - last) < AUTO_RELOAD_WINDOW_MS) return false;
    const stamp = String(now);
    storage.setItem(AUTO_RELOAD_KEY, stamp);
    return storage.getItem(AUTO_RELOAD_KEY) === stamp;
  } catch {
    return false;
  }
}
