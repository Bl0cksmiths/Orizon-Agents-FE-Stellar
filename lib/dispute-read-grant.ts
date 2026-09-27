/**
 * The payer's read grant (D-067): how a payer outside the tab that ran the
 * task reads their own dispute reason again, and the adjudicator's answer.
 *
 * The backend sends both only to a holder of the task's read token, which
 * lives in the tab that ran the task and in the backend's memory — so a payer
 * on another tab, another device, or after a restart got neither. A grant is
 * the payer proving who they are instead: a signature over a single-use
 * challenge, with the same `signMessage` and the same scheme that opens a
 * dispute, exchanged for a short-lived credential sent on each read.
 *
 * Asked for only on the payer's click. Nothing here ever raises a wallet
 * prompt on its own, and once a grant is held every read reuses it: a poll
 * never signs.
 */

import { ApiError, ensure, post } from "./api";
import { classifyError } from "./wallet-errors";

/** The request header a read presents its grant in. */
export const DISPUTE_READ_GRANT_HEADER = "X-Dispute-Read-Grant";

/** Response of POST /api/disputes/read-challenge. */
export type DisputeReadChallenge = {
  nonce: string;
  /** Signed verbatim: `orizon-dispute-read:v1:{task_id}:{nonce}`. */
  message: string;
  /** Epoch seconds, on the server's clock. */
  expires_at: number;
};

/** Response of POST /api/disputes/read-grant. */
export type DisputeReadGrant = {
  grant: string;
  /** Epoch seconds, on the server's clock; at most an hour away. */
  expires_at: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyStr = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** A non-empty nonce, for `isDisputeChallenge`'s reason: the message is
 * checked to end with it, and an empty one would pass any message. */
function isReadChallenge(v: unknown): v is DisputeReadChallenge {
  return (
    isRecord(v) &&
    isNonEmptyStr(v.nonce) &&
    typeof v.message === "string" &&
    isNum(v.expires_at)
  );
}

function isReadGrant(v: unknown): v is DisputeReadGrant {
  return isRecord(v) && isNonEmptyStr(v.grant) && isNum(v.expires_at);
}

// ── wire calls ──────────────────────────────────────────────────

/**
 * POST /api/disputes/read-challenge — the nonce, and the exact message the
 * payer's wallet signs to read this task's dispute reasons.
 *
 * Checked to address THIS task before a wallet ever sees it, on
 * `createDisputeChallenge`'s terms: the prompt shows the payer an opaque
 * string, so a message for another task would have them sign away a read
 * they never meant. Parsed segment by segment, the version left free.
 */
export function createReadChallenge(
  taskId: string,
): Promise<DisputeReadChallenge> {
  const path = "/disputes/read-challenge";
  return post<DisputeReadChallenge, { task_id: string }>(
    path,
    { task_id: taskId },
    ensure(path, isReadChallenge),
  ).then((challenge) => {
    const [domain, , task, ...tail] = challenge.message.split(":");
    const addressesTask =
      domain === "orizon-dispute-read" &&
      task === taskId &&
      tail.join(":") === challenge.nonce;
    if (!addressesTask) {
      throw new Error(
        `malformed response from ${path} — challenge does not address task ${taskId}`,
      );
    }
    return challenge;
  });
}

/** POST /api/disputes/read-grant — the signature, exchanged for a grant. */
export function createReadGrant(req: {
  task_id: string;
  nonce: string;
  signature_b64: string;
}): Promise<DisputeReadGrant> {
  const path = "/disputes/read-grant";
  return post<DisputeReadGrant, typeof req>(
    path,
    req,
    ensure(path, isReadGrant),
  );
}

// ── the grant, held for the tab ─────────────────────────────────

const KEY = "orizon.dispute-read-grants";
/** Capped like the task tokens, so a long session cannot grow unbounded. */
export const MAX_READ_GRANTS = 50;
/**
 * A grant is treated as spent this long before the server says it expires.
 * The expiry is on the server's clock and this is the browser's, so a margin
 * keeps a grant from being sent in its last moments and read as withheld.
 * Erring early costs only the offer coming back.
 */
export const GRANT_MARGIN_MS = 60_000;

type Held = {
  taskId: string;
  /** The wallet that signed for it. Sent only while that wallet is here. */
  payer: string;
  grant: string;
  expiresAtMs: number;
};

const isHeld = (v: unknown): v is Held =>
  isRecord(v) &&
  isNonEmptyStr(v.taskId) &&
  isNonEmptyStr(v.payer) &&
  isNonEmptyStr(v.grant) &&
  isNum(v.expiresAtMs);

/**
 * Every grant this tab holds. Session storage, as the task tokens are: it
 * dies with the tab and never reaches another. Every access is guarded — a
 * private window or blocked site data throws on the property itself — and a
 * store that cannot be read holds nothing, which only brings the offer back.
 */
function readAll(): Held[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHeld) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: Held[]): void {
  try {
    if (typeof window === "undefined") return;
    if (entries.length === 0) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Nowhere to keep it: the next read goes without, and the offer returns.
  }
}

/**
 * The grant to send on a read of `taskId`, or null.
 *
 * Only for the wallet that signed for it. The backend would send the reasons
 * to any holder, and a tab whose wallet has since switched to one that did
 * not pay must not keep receiving the payer's words.
 */
export function heldReadGrant(
  taskId: string,
  payer: string | null,
  nowMs: number = Date.now(),
): string | null {
  if (!payer) return null;
  const held = readAll().find((e) => e.taskId === taskId);
  if (held === undefined || held.payer !== payer) return null;
  if (held.expiresAtMs - GRANT_MARGIN_MS <= nowMs) {
    forgetReadGrant(taskId);
    return null;
  }
  return held.grant;
}

/** Keep a grant for `taskId`, replacing any older one. */
export function rememberReadGrant(
  taskId: string,
  payer: string,
  grant: DisputeReadGrant,
): void {
  const entries = readAll().filter((e) => e.taskId !== taskId);
  entries.push({
    taskId,
    payer,
    grant: grant.grant,
    expiresAtMs: grant.expires_at * 1_000,
  });
  while (entries.length > MAX_READ_GRANTS) entries.shift();
  writeAll(entries);
}

/** Drop the grant for `taskId`, if any. */
export function forgetReadGrant(taskId: string): void {
  const entries = readAll();
  const kept = entries.filter((e) => e.taskId !== taskId);
  if (kept.length !== entries.length) writeAll(kept);
}

// ── asking for one ──────────────────────────────────────────────

/**
 * Challenge → one wallet signature → grant, kept for the tab.
 *
 * ONE signature per call, and no retry: a challenge that expired while the
 * wallet sat open is reported as `expired` for the payer to press again,
 * rather than a second prompt they did not ask for. A wallet that declines
 * rejects with its own error, untouched, for `readGrantFailure` to classify.
 */
export async function obtainReadGrant(args: {
  taskId: string;
  payer: string;
  signMessage: (message: string) => Promise<string>;
}): Promise<void> {
  const { taskId, payer, signMessage } = args;
  const challenge = await createReadChallenge(taskId);
  const signature_b64 = await signMessage(challenge.message);
  const grant = await createReadGrant({
    task_id: taskId,
    nonce: challenge.nonce,
    signature_b64,
  });
  rememberReadGrant(taskId, payer, grant);
}

/**
 * How asking for a grant ended, when it did not end in one. Each is its own
 * line on the receipt, and one of them is no line at all:
 *
 * - `declined`: the payer said no in the wallet. An ordinary choice, never
 *   an error.
 * - `unavailable`: the challenge route answered 404 — a backend without the
 *   route, or no settlement to read — so there is nothing to offer.
 * - `expired`: the challenge died while the wallet was open.
 * - `not_the_payer`: the backend does not know this wallet as the payer.
 * - `busy`: the backend is holding too many challenges right now.
 * - `failed`: anything else — a network drop, a malformed answer.
 */
export type ReadGrantFailure =
  "declined" | "unavailable" | "expired" | "not_the_payer" | "busy" | "failed";

export function readGrantFailure(err: unknown): ReadGrantFailure {
  if (err instanceof ApiError) {
    if (err.code === "not_the_payer" || err.status === 403) {
      return "not_the_payer";
    }
    if (err.code === "challenge_expired" || err.code === "challenge_unknown") {
      return "expired";
    }
    if (err.status === 503 || err.status === 429) return "busy";
    if (err.status === 404) return "unavailable";
    return "failed";
  }
  return classifyError(err).kind === "user_rejected" ? "declined" : "failed";
}
