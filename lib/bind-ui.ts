/**
 * Pure logic behind the agent endpoint binding screen (story 2.01).
 *
 * Everything here is total and dependency-light so the screen itself stays a
 * thin renderer: URL normalization, the challenge-expiry arithmetic that
 * decides whether a signature is still worth submitting, and — added
 * alongside — the error-code → UI-placement mapping. None of it touches the
 * network; `lib/api.ts` owns that.
 */

import type { BindChallenge, BindTimestamp } from "./types";

/**
 * The URL that is sent to the backend for a raw field value.
 *
 * Only two things happen: surrounding whitespace goes (pasting a URL out of a
 * terminal or a chat message routinely brings some along), and a value with no
 * scheme at all gets `https://`, which is what an operator typing
 * `agent.example.com` means every time.
 *
 * The test for "has a scheme" is a literal `://` rather than a scheme regex on
 * purpose: `localhost:8080` matches every reasonable scheme pattern and is not
 * a scheme, and silently leaving that one alone produced a URL the backend
 * could only answer with a bare 422.
 *
 * Nothing else is touched — no case folding, no trailing-slash surgery. The
 * backend embeds its OWN normalization of this string in the challenge
 * message, and the wallet signs that message verbatim, so a second opinion
 * here can only desynchronize the two.
 */
export function normalizeEndpointUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}

/**
 * Local, syntax-only validation of the endpoint field: is this a URL at all?
 * Returns null when it is, or a short inline error otherwise.
 *
 * Deliberately NOT a policy check. Whether a syntactically fine URL may be
 * bound — public host, scheme, port, path — is the backend's call, asked for
 * separately through `checkBindEndpoint` so the operator gets the registry's
 * own reason rather than this build's guess at its rules.
 */
export function validateEndpointUrl(raw: string): string | null {
  const url = normalizeEndpointUrl(raw);
  if (url === "") return "Endpoint URL is required";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Enter a full URL, e.g. https://agent.example.com/run";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Only http and https endpoints can be bound";
  }
  if (!parsed.hostname) {
    return "Enter a full URL, e.g. https://agent.example.com/run";
  }
  return null;
}

/**
 * Unix epochs below this are seconds rather than milliseconds — 1e11 ms is
 * March 1973, and 1e11 seconds is the year 5138, so no real timestamp is
 * ambiguous. Both serializations are permitted by `BindTimestamp`.
 */
const EPOCH_SECONDS_CEILING = 1e11;

/** A bind timestamp in either permitted serialization, as epoch ms, or null
 * when it cannot be read as a time at all. */
export function bindTimestampMs(t: BindTimestamp): number | null {
  if (typeof t === "number") {
    if (!Number.isFinite(t) || t <= 0) return null;
    return Math.round(t < EPOCH_SECONDS_CEILING ? t * 1_000 : t);
  }
  const parsed = Date.parse(t);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * How far the backend's absolute `expires_at` may sit from the TTL-derived
 * deadline before it is distrusted — enough for request latency and ordinary
 * clock skew, far short of the whole-hour errors a timezone mistake produces.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 60_000;

/**
 * A signature must be submitted with at least this much validity left. The
 * round trip is not instant, and a nonce that dies in flight costs the
 * operator a wallet popup to learn nothing.
 */
export const CHALLENGE_EXPIRY_GUARD_MS = 2_000;

/**
 * When the challenge stops being signable, in epoch ms on THIS clock.
 * `Infinity` when the backend stated no usable expiry at all — unknown, which
 * must never present as "already expired" and strand the operator in a loop
 * of re-challenges.
 *
 * `ttl_seconds` measured from the moment the answer arrived is the primary
 * source, and deliberately so: it is relative, so it is immune to the clock
 * difference between this browser and the backend — and to the naive datetime
 * FastAPI serializes with no timezone at all, which `Date.parse` reads as
 * local time and can be hours out in either direction. The absolute stamp is
 * preferred only where it CORROBORATES the TTL (within `CLOCK_SKEW_TOLERANCE_MS`),
 * which is exactly the case where it adds precision instead of danger.
 */
export function challengeExpiresAtMs(
  challenge: Pick<BindChallenge, "expires_at" | "ttl_seconds">,
  receivedAtMs: number,
): number {
  const { ttl_seconds: ttl } = challenge;
  const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl * 1_000 : 0;
  const absolute = bindTimestampMs(challenge.expires_at);
  if (ttlMs <= 0) return absolute ?? Number.POSITIVE_INFINITY;
  const fromTtl = receivedAtMs + ttlMs;
  if (absolute === null) return fromTtl;
  return Math.abs(absolute - fromTtl) <= CLOCK_SKEW_TOLERANCE_MS
    ? absolute
    : fromTtl;
}

/**
 * Whole seconds of validity left, rounded UP so a challenge with 200ms to run
 * still reads "1s" rather than an already-dead "0s". `Infinity` passes through
 * as itself — the caller renders no countdown for an unknown expiry.
 */
export function secondsRemaining(expiresAtMs: number, nowMs: number): number {
  if (!Number.isFinite(expiresAtMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1_000));
}

/**
 * Is this challenge too close to the end of its life to spend a signature on?
 *
 * True strictly before the nonce actually dies (`CHALLENGE_EXPIRY_GUARD_MS`),
 * because the alternative is submitting a doomed signature and reporting the
 * backend's `challenge_invalid` as though the wallet had done something wrong.
 */
export function isChallengeExpired(
  expiresAtMs: number,
  nowMs: number,
): boolean {
  if (!Number.isFinite(expiresAtMs)) return false;
  return nowMs >= expiresAtMs - CHALLENGE_EXPIRY_GUARD_MS;
}

/** Remaining validity as a countdown: `m:ss` once it is worth a minute hand,
 * plain seconds below that. Empty for an unknown (infinite) expiry. */
export function formatValidity(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}
