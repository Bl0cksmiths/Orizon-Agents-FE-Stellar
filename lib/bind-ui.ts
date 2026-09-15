/**
 * Pure logic behind the agent endpoint binding screen (story 2.01).
 *
 * Everything here is total and dependency-light so the screen itself stays a
 * thin renderer: URL normalization, the challenge-expiry arithmetic that
 * decides whether a signature is still worth submitting, and — added
 * alongside — the error-code → UI-placement mapping. None of it touches the
 * network; `lib/api.ts` owns that.
 */

import { ApiError, bindErrorCode } from "./api";
import { rateLimitMessage } from "./rate-limit-message";
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

/** Where a bind failure belongs on screen. The whole point of the contract's
 * error codes is that these three are indistinguishable from the sentence. */
export type BindErrorPlacement = "endpoint_field" | "agent_field" | "banner";

export type BindErrorView = {
  placement: BindErrorPlacement;
  /** What the operator reads — already phrased as an instruction, not a code. */
  message: string;
  /** Whether the same attempt is worth repeating; drives the banner's retry
   * control. False where retrying would fail identically (a refused URL, the
   * wrong wallet) and only the inputs can fix it. */
  retryable: boolean;
  /** The limiter's own Retry-After, in ms, when it sent one — the submit stays
   * disabled this long rather than burning another request on a 429. */
  retryAfterMs?: number;
};

/**
 * The human sentence out of an `ApiError`, or null when there is none.
 *
 * lib/api.ts formats a failure as `POST /path → 422 — <envelope message>`, and
 * only the tail is worth an operator's attention: the method, path and status
 * describe our plumbing, not their problem. Used where the backend's own
 * wording beats anything this build could invent — above all
 * `endpoint_not_allowed`, where the message names the rule that refused.
 */
export function apiErrorDetail(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const at = err.message.indexOf(" — ");
  if (at < 0) return null;
  const tail = err.message.slice(at + 3).trim();
  return tail === "" ? null : tail;
}

/**
 * A bind rejection as the screen should present it.
 *
 * This is the switch the whole `BindErrorCode` union exists for. One 4xx
 * sentence covers four completely different situations, and showing it in one
 * generic box tells the operator nothing about which one they are in:
 *
 *   endpoint_not_allowed  → under the URL field; the URL is what must change
 *   agent_not_found       → under the agent field; the id is what must change
 *   not_agent_owner       → banner; nothing on this form is wrong, the
 *                           CONNECTED WALLET is, and no retry fixes that
 *   challenge_invalid /
 *   signature_malformed   → banner, retryable; the next attempt starts from a
 *                           fresh challenge and usually just works
 *   registry_unavailable  → banner, retryable; the backend is having a moment
 *   rate_limited (or any
 *   429)                  → banner, retryable once Retry-After has elapsed
 *
 * A code this build has never heard of, and anything that is not an `ApiError`
 * at all (a dropped connection, a client-side timeout, a rejected guard),
 * lands on the generic retryable banner — never silently swallowed.
 */
export function bindErrorView(err: unknown): BindErrorView {
  // Checked before the code switch: a 429 carries the wait, which is the only
  // actionable part, and the limiter's own envelope message ("too many
  // requests") adds nothing over the status.
  const limited = rateLimitMessage(err);
  if (limited) {
    const view: BindErrorView = {
      placement: "banner",
      message: limited,
      retryable: true,
    };
    if (err instanceof ApiError && err.retryAfterMs !== undefined) {
      view.retryAfterMs = err.retryAfterMs;
    }
    return view;
  }

  switch (bindErrorCode(err)) {
    case "endpoint_not_allowed":
      return {
        placement: "endpoint_field",
        message:
          apiErrorDetail(err) ??
          "The registry refused this endpoint. Try a different URL.",
        retryable: false,
      };
    case "agent_not_found":
      return {
        placement: "agent_field",
        message:
          "No agent with this id is registered on-chain. Check the id, or register it first.",
        retryable: false,
      };
    case "not_agent_owner":
      return {
        placement: "banner",
        message:
          "The connected wallet does not own this agent, so it cannot authorize an endpoint for it. Switch to the wallet that registered the agent and try again.",
        retryable: false,
      };
    case "challenge_invalid":
      return {
        placement: "banner",
        message:
          "That signing challenge is no longer valid — it expired or was already used. Signing again requests a fresh one.",
        retryable: true,
      };
    case "signature_malformed":
      return {
        placement: "banner",
        message:
          "The wallet's signature was not accepted. Make sure the wallet holds the agent's owner account, then sign again.",
        retryable: true,
      };
    case "registry_unavailable":
      return {
        placement: "banner",
        message:
          "The agent registry is temporarily unreachable. Nothing was changed — try again in a moment.",
        retryable: true,
      };
    case "rate_limited":
      return {
        placement: "banner",
        message:
          "Too many requests — wait a moment and try again. Nothing was lost.",
        retryable: true,
      };
    // `binding_not_found` is not a failure of this form — it is how an agent
    // with no endpoint yet answers the lookup, and `getAgentBindingOrNull`
    // already turns it into `null`. Reaching here means it came back from a
    // bind attempt, which the contract does not describe; say something true
    // rather than nothing.
    case "binding_not_found":
      return {
        placement: "banner",
        message: "This agent has no endpoint bound yet.",
        retryable: true,
      };
    default:
      return {
        placement: "banner",
        message:
          apiErrorDetail(err) ??
          "Could not bind the endpoint. Nothing was changed — please try again.",
        retryable: true,
      };
  }
}

/**
 * Where the bind sequence is. Each step is a separate await with its own
 * failure mode, and `awaiting_signature` is the one that matters most: the
 * page is idle, the browser looks frozen, and the thing waiting on the
 * operator is a popup in another window.
 */
export type BindPhase =
  "idle" | "challenging" | "awaiting_signature" | "binding" | "success";

/** True while an attempt is in flight — the form stays read-only and the
 * submit disabled. */
export function isBindBusy(phase: BindPhase): boolean {
  return (
    phase === "challenging" ||
    phase === "awaiting_signature" ||
    phase === "binding"
  );
}

/**
 * What the live region announces for a phase, or null when there is nothing to
 * say. These sentences are the only notice a screen-reader user gets that the
 * wallet is waiting on them, so `awaiting_signature` names the popup outright
 * instead of the usual "working…".
 */
export function bindPhaseMessage(phase: BindPhase): string | null {
  switch (phase) {
    case "challenging":
      return "Requesting a signing challenge from the registry…";
    case "awaiting_signature":
      return "Waiting for your wallet — open the wallet popup and approve the signature request to authorize this endpoint.";
    case "binding":
      return "Signature received. Binding the endpoint…";
    case "success":
      return "Endpoint bound.";
    default:
      return null;
  }
}
