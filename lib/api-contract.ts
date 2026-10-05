/**
 * What the console's cached `/api/*` routes (lib/api-proxy.ts) tell the
 * browser beyond the backend's own body, in one place both sides import.
 * Kept free of runtime code so the browser bundle pays for four strings.
 */

/** Epoch ms of the backend read a cached answer came from. */
export const READ_AT_HEADER = "X-Orizon-Read-At";
/** fresh | stale | held — how the copy relates to the backend right now. */
export const CACHE_STATE_HEADER = "X-Orizon-Cache";
/** On a paged read: how many items the whole list holds. */
export const TOTAL_COUNT_HEADER = "X-Total-Count";
/** On a paged read: the cursor of the next page, absent on the last. */
export const NEXT_CURSOR_HEADER = "X-Next-Cursor";

/** The envelope message of a 503 sent while the backend is waking. The
 * browser recognises it (lib/api.ts `isWakingError`), so keep it stable. */
export const WAKING_MESSAGE =
  "the backend is waking up — this usually takes under a minute";
