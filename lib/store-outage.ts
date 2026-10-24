/**
 * A read the backend could not answer for a reason that passes on its own:
 * its record store is unreachable, or it failed in a way a moment cures.
 *
 * The backend says the first outright — a 503 whose envelope code is
 * `store_unavailable`, or a store's own `<name>_store_unavailable`
 * (`task_store_unavailable` guards every task read), with a Retry-After. A
 * backend older than that code answers the same outage `500 internal_error`,
 * and a proxy in front of it 502 or 504; those are read as temporary too.
 * Anything else — a 4xx, a client-side timeout, a dropped connection, the
 * browser check's own 503 — is not an outage, and keeps its caller's handling.
 *
 * Pure and total: never throws. Read by `ApiError`'s fields, never by its
 * message, which is wording.
 */

import { ApiError } from "./api";
import { botCheckMessage } from "./bot-check-message";

/** Statuses a moment can cure. 501 and 505+ say something will not. */
const TEMPORARY_STATUSES: ReadonlySet<number> = new Set([500, 502, 503, 504]);

export type StoreOutage = {
  /**
   * `store`: the backend named its record store as what it cannot reach.
   * `server`: any other temporary failure, with no word on what failed.
   */
  kind: "store" | "server";
  /** The backend's Retry-After, in ms, or null when it sent none. */
  retryAfterMs: number | null;
  /** The envelope's request id, for a support request; null without one. */
  requestId: string | null;
};

/** Whether `code` names a record store the backend cannot reach. */
export function isStoreUnavailableCode(code: string | undefined): boolean {
  return (
    code === "store_unavailable" ||
    (code?.endsWith("_store_unavailable") ?? false)
  );
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `error.request_id` from the envelope a rejection carried, or null. */
function requestIdOf(err: ApiError): string | null {
  const error = isObj(err.body) ? err.body.error : undefined;
  const id = isObj(error) ? error.request_id : undefined;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

/** The outage behind a failed read, or null when the failure is not one. */
export function storeOutage(err: unknown): StoreOutage | null {
  if (!(err instanceof ApiError) || !TEMPORARY_STATUSES.has(err.status)) {
    return null;
  }
  if (botCheckMessage(err) !== undefined) return null;
  const wait = err.retryAfterMs;
  return {
    kind:
      err.status === 503 && isStoreUnavailableCode(err.code)
        ? "store"
        : "server",
    retryAfterMs:
      wait !== undefined && Number.isFinite(wait) && wait >= 0 ? wait : null,
    requestId: requestIdOf(err),
  };
}
