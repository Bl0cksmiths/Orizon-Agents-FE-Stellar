/**
 * How old a cached answer is, and whether a failure was the backend waking —
 * the two facts the console's cache (lib/api-proxy.ts) adds to a read. Kept
 * apart from lib/api.ts so the data hooks (lib/use-fetch.ts and friends) can
 * read them without importing the whole client.
 */

import { WAKING_MESSAGE } from "./api-contract";

/** When the backend read behind each cached payload was made. */
const READ_AT = new WeakMap<object, number>();

/** Records `raw` (an `X-Orizon-Read-At` value) as `value`'s read time. A
 * missing or unusable value records nothing. */
export function noteReadAt(value: unknown, raw: string | null): void {
  const at = Number(raw);
  if (
    raw &&
    Number.isFinite(at) &&
    at > 0 &&
    typeof value === "object" &&
    value !== null
  ) {
    READ_AT.set(value, at);
  }
}

/**
 * When the backend was read for this payload (epoch ms), if it came from the
 * console's cache, or null. A cached answer can be older than the request
 * that fetched it — minutes, through an outage — and a page dating it by
 * when it arrived would present an old figure as a new one.
 */
export function readAtOf(value: unknown): number | null {
  return typeof value === "object" && value !== null
    ? (READ_AT.get(value) ?? null)
    : null;
}

/** What a read answered `202 computing` rejects with, in its message: the
 * backend is building the report and has nothing to serve yet. */
export const COMPUTING_MESSAGE = "the adoption report is still being built";

/**
 * Whether a read was told the backend is still building what it asked for
 * (`202 {"status":"computing"}` from the adoption route): a wait with a
 * Retry-After, never a failure and never a payload.
 */
export function isComputingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(COMPUTING_MESSAGE);
}

/**
 * Whether a read failed because the backend is still waking: the console's
 * cache answering 503 (or 504) with `WAKING_MESSAGE` because the backend has
 * not answered yet. The pages show that as the wait it is, with its
 * progress, rather than as an error. A client deadline is not counted: the
 * cache answers within seconds, so a read silent past its deadline has lost
 * its connection, which is worth saying.
 */
export function isWakingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(WAKING_MESSAGE);
}
