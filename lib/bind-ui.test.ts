/**
 * Tests for the pure bind-screen logic in lib/bind-ui.ts (story 2.01).
 *
 * Two behaviours here are worth more than their line count, because getting
 * either wrong is invisible until an operator is stuck:
 *
 *   - the URL is normalized once and NEVER reshaped again, since the backend
 *     signs its own normalization of whatever string it was sent;
 *   - expiry is derived from the relative TTL rather than the absolute stamp
 *     whenever the two disagree, so a backend serializing a naive (zoneless)
 *     datetime cannot make a live challenge read as long dead.
 */

import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  CHALLENGE_EXPIRY_GUARD_MS,
  CLOCK_SKEW_TOLERANCE_MS,
  apiErrorDetail,
  bindErrorView,
  bindPhaseMessage,
  bindTimestampMs,
  challengeExpiresAtMs,
  endpointRefusalText,
  formatBoundAt,
  formatValidity,
  isBindBusy,
  isChallengeExpired,
  normalizeEndpointUrl,
  secondsRemaining,
  validateEndpointUrl,
} from "./bind-ui";

describe("normalizeEndpointUrl", () => {
  it("trims the whitespace a pasted URL brings with it", () => {
    expect(normalizeEndpointUrl("  https://a.example.com/run \n")).toBe(
      "https://a.example.com/run",
    );
  });

  it("assumes https for a bare host", () => {
    expect(normalizeEndpointUrl("agent.example.com")).toBe(
      "https://agent.example.com",
    );
    expect(normalizeEndpointUrl("agent.example.com/run?v=1")).toBe(
      "https://agent.example.com/run?v=1",
    );
  });

  it("treats host:port as a host, not a scheme", () => {
    // `localhost:8080` matches every plausible scheme regex; leaving it alone
    // sent the backend a URL it could only answer with a bare 422.
    expect(normalizeEndpointUrl("localhost:8080/run")).toBe(
      "https://localhost:8080/run",
    );
  });

  it("leaves an explicit scheme — including http — exactly as typed", () => {
    expect(normalizeEndpointUrl("http://10.0.0.4:9000/run")).toBe(
      "http://10.0.0.4:9000/run",
    );
    expect(normalizeEndpointUrl("HTTPS://Agent.Example.COM/Run/")).toBe(
      "HTTPS://Agent.Example.COM/Run/",
    );
  });

  it("is empty for an empty or blank field", () => {
    expect(normalizeEndpointUrl("")).toBe("");
    expect(normalizeEndpointUrl("   ")).toBe("");
  });
});

describe("validateEndpointUrl", () => {
  it("accepts a normal https endpoint", () => {
    expect(validateEndpointUrl("https://agent.example.com/run")).toBeNull();
  });

  it("accepts a bare host, since normalization supplies the scheme", () => {
    expect(validateEndpointUrl("agent.example.com")).toBeNull();
  });

  it("requires a value", () => {
    expect(validateEndpointUrl("   ")).toBe("Endpoint URL is required");
  });

  it("rejects something that is not a URL at all", () => {
    expect(validateEndpointUrl("https://")).toMatch(/full URL/);
    expect(validateEndpointUrl("http:// broken")).toMatch(/full URL/);
  });

  it("rejects a non-http scheme", () => {
    expect(validateEndpointUrl("ftp://files.example.com")).toBe(
      "Only http and https endpoints can be bound",
    );
    expect(validateEndpointUrl("javascript://evil")).toBe(
      "Only http and https endpoints can be bound",
    );
  });

  it("rejects a URL with no host", () => {
    expect(validateEndpointUrl("file:///etc/passwd")).not.toBeNull();
  });

  it("leaves policy to the backend — plain http is syntactically fine", () => {
    // Whether http may be bound is `checkBindEndpoint`'s answer, not ours; a
    // local guess at the rule would contradict the registry sooner or later.
    expect(validateEndpointUrl("http://agent.example.com/run")).toBeNull();
  });
});

describe("bindTimestampMs", () => {
  it("reads an ISO-8601 string", () => {
    expect(bindTimestampMs("2026-09-15T10:00:00Z")).toBe(
      Date.parse("2026-09-15T10:00:00Z"),
    );
  });

  it("reads a Unix epoch in seconds", () => {
    expect(bindTimestampMs(1_789_000_000)).toBe(1_789_000_000_000);
  });

  it("reads a Unix epoch already in milliseconds", () => {
    expect(bindTimestampMs(1_789_000_000_000)).toBe(1_789_000_000_000);
  });

  it("is null for anything unreadable as a time", () => {
    expect(bindTimestampMs("soon")).toBeNull();
    expect(bindTimestampMs(0)).toBeNull();
    expect(bindTimestampMs(-5)).toBeNull();
    expect(bindTimestampMs(Number.NaN)).toBeNull();
  });
});

describe("challengeExpiresAtMs", () => {
  const now = 1_789_000_000_000;

  it("prefers the absolute stamp when it corroborates the TTL", () => {
    const expires = now + 120_000 + 900; // within skew tolerance
    expect(
      challengeExpiresAtMs({ expires_at: expires, ttl_seconds: 120 }, now),
    ).toBe(expires);
  });

  it("falls back to the TTL when the absolute stamp is wildly out", () => {
    // The zoneless-datetime failure mode: `Date.parse` reads the backend's
    // naive stamp as local time, so it lands an hour (or eight) away. Trusting
    // it would declare a challenge that has just been issued long expired.
    const skewed = now - 8 * 3_600_000;
    expect(
      challengeExpiresAtMs({ expires_at: skewed, ttl_seconds: 120 }, now),
    ).toBe(now + 120_000);
  });

  it("uses the TTL exactly at the edge of tolerance, and past it", () => {
    const edge = now + 120_000 + CLOCK_SKEW_TOLERANCE_MS;
    expect(
      challengeExpiresAtMs({ expires_at: edge, ttl_seconds: 120 }, now),
    ).toBe(edge);
    expect(
      challengeExpiresAtMs({ expires_at: edge + 1, ttl_seconds: 120 }, now),
    ).toBe(now + 120_000);
  });

  it("falls back to the TTL when the stamp is unreadable", () => {
    expect(
      challengeExpiresAtMs({ expires_at: "whenever", ttl_seconds: 90 }, now),
    ).toBe(now + 90_000);
  });

  it("uses the stamp alone when the TTL is missing or nonsense", () => {
    const expires = now + 45_000;
    expect(
      challengeExpiresAtMs({ expires_at: expires, ttl_seconds: 0 }, now),
    ).toBe(expires);
    expect(
      challengeExpiresAtMs({ expires_at: expires, ttl_seconds: -30 }, now),
    ).toBe(expires);
  });

  it("is an UNKNOWN expiry, not an expired one, when the backend states neither", () => {
    // Returning `now` here would render every challenge dead on arrival and
    // loop the operator through re-challenges that can never be submitted.
    const unknown = challengeExpiresAtMs(
      { expires_at: "nonsense", ttl_seconds: 0 },
      now,
    );
    expect(unknown).toBe(Number.POSITIVE_INFINITY);
    expect(isChallengeExpired(unknown, now + 10 * 60_000)).toBe(false);
  });
});

describe("secondsRemaining", () => {
  const now = 1_789_000_000_000;

  it("rounds up so a challenge with a fraction left is not reported dead", () => {
    expect(secondsRemaining(now + 200, now)).toBe(1);
    expect(secondsRemaining(now + 1_000, now)).toBe(1);
    expect(secondsRemaining(now + 1_001, now)).toBe(2);
  });

  it("floors at zero once the deadline has passed", () => {
    expect(secondsRemaining(now - 30_000, now)).toBe(0);
  });

  it("passes an unknown expiry through as infinite", () => {
    expect(secondsRemaining(Number.POSITIVE_INFINITY, now)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("isChallengeExpired", () => {
  const now = 1_789_000_000_000;

  it("is false while there is comfortably time left", () => {
    expect(isChallengeExpired(now + 60_000, now)).toBe(false);
  });

  it("is true inside the submit guard, before the nonce actually dies", () => {
    // The point: never spend a wallet popup on a signature that will land
    // after the nonce expires and come back as `challenge_invalid`.
    expect(isChallengeExpired(now + CHALLENGE_EXPIRY_GUARD_MS - 1, now)).toBe(
      true,
    );
    expect(isChallengeExpired(now + CHALLENGE_EXPIRY_GUARD_MS + 1, now)).toBe(
      false,
    );
  });

  it("is true once the deadline has passed", () => {
    expect(isChallengeExpired(now - 1, now)).toBe(true);
  });

  it("is false for an unknown expiry", () => {
    expect(isChallengeExpired(Number.POSITIVE_INFINITY, now)).toBe(false);
  });
});

describe("formatValidity", () => {
  it("shows plain seconds below a minute", () => {
    expect(formatValidity(45)).toBe("45s");
    expect(formatValidity(0)).toBe("0s");
  });

  it("shows m:ss at a minute and above, zero-padded", () => {
    expect(formatValidity(60)).toBe("1:00");
    expect(formatValidity(125)).toBe("2:05");
    expect(formatValidity(599)).toBe("9:59");
  });

  it("is empty for an unknown expiry, and never negative", () => {
    expect(formatValidity(Number.POSITIVE_INFINITY)).toBe("");
    expect(formatValidity(-10)).toBe("0s");
  });
});

describe("apiErrorDetail", () => {
  it("keeps only the envelope sentence out of a formatted ApiError", () => {
    const err = new ApiError(
      "POST /agents/weather_bot/bind → 422 — private addresses cannot be bound",
      422,
      undefined,
      "endpoint_not_allowed",
    );
    expect(apiErrorDetail(err)).toBe("private addresses cannot be bound");
  });

  it("is null when there is no sentence, or no ApiError at all", () => {
    expect(apiErrorDetail(new ApiError("POST /x → 500", 500))).toBeNull();
    expect(apiErrorDetail(new ApiError("POST /x → 500 —    ", 500))).toBeNull();
    expect(apiErrorDetail(new Error("boom"))).toBeNull();
    expect(apiErrorDetail(null)).toBeNull();
  });
});

describe("formatBoundAt", () => {
  it("prints a machine-stable UTC stamp, whichever serialization arrived", () => {
    expect(formatBoundAt("2026-09-15T10:04:05Z")).toBe(
      "2026-09-15 10:04:05 UTC",
    );
    expect(formatBoundAt(1_789_000_000)).toBe(
      `${new Date(1_789_000_000_000).toISOString().slice(0, 19).replace("T", " ")} UTC`,
    );
  });

  it("says unknown rather than rendering Invalid Date", () => {
    expect(formatBoundAt("recently")).toBe("unknown");
  });
});

describe("endpointRefusalText", () => {
  it("names both the reason and the rule when the backend sent both", () => {
    expect(
      endpointRefusalText({
        rule: "no_private_hosts",
        message: "10.0.0.0/8 is private",
      }),
    ).toBe("10.0.0.0/8 is private · rule: no_private_hosts");
  });

  it("uses whichever half arrived on its own", () => {
    expect(endpointRefusalText({ message: "loopback is refused" })).toBe(
      "loopback is refused",
    );
    expect(endpointRefusalText({ rule: "https_only" })).toBe(
      "Refused by the endpoint policy · rule: https_only",
    );
  });

  it("still reads like English when the backend sent neither", () => {
    expect(endpointRefusalText({})).toMatch(/refused this endpoint/i);
    expect(endpointRefusalText({ rule: null, message: "  " })).toMatch(
      /refused this endpoint/i,
    );
  });
});

describe("bindErrorView", () => {
  /** An `ApiError` shaped the way lib/api.ts builds one from the bind
   * envelope: formatted message, status, and the machine-readable code. */
  const bindError = (code: string, status = 422, detail = "refused") =>
    new ApiError(
      `POST /agents/weather_bot/bind → ${status} — ${detail}`,
      status,
      undefined,
      code,
    );

  it("puts a refused endpoint under the URL field, in the registry's own words", () => {
    // The whole reason the endpoint-check endpoint and this code exist: a
    // blocked URL is a field problem with a reason, not a mystery banner.
    const view = bindErrorView(
      bindError("endpoint_not_allowed", 422, "private addresses are refused"),
    );
    expect(view.placement).toBe("endpoint_field");
    expect(view.message).toBe("private addresses are refused");
    // Retrying the same URL fails identically — only an edit helps.
    expect(view.retryable).toBe(false);
  });

  it("falls back to its own wording when the envelope carried no sentence", () => {
    const view = bindErrorView(
      new ApiError("POST /x → 422", 422, undefined, "endpoint_not_allowed"),
    );
    expect(view.placement).toBe("endpoint_field");
    expect(view.message).toMatch(/refused this endpoint/i);
  });

  it("puts an unknown agent under the agent field", () => {
    const view = bindErrorView(bindError("agent_not_found", 404));
    expect(view.placement).toBe("agent_field");
    expect(view.message).toMatch(/registered on-chain/i);
    expect(view.retryable).toBe(false);
  });

  it("explains a wrong wallet, and does not offer a pointless retry", () => {
    const view = bindErrorView(bindError("not_agent_owner", 403));
    expect(view.placement).toBe("banner");
    expect(view.message).toMatch(/does not own this agent/i);
    expect(view.message).toMatch(/switch to the wallet/i);
    expect(view.retryable).toBe(false);
  });

  it("offers a retry for a stale challenge and a rejected signature", () => {
    for (const code of ["challenge_invalid", "signature_malformed"]) {
      const view = bindErrorView(bindError(code, 400));
      expect(view.placement).toBe("banner");
      expect(view.retryable).toBe(true);
    }
  });

  it("banners a registry outage as retryable, and says nothing changed", () => {
    const view = bindErrorView(bindError("registry_unavailable", 503));
    expect(view.placement).toBe("banner");
    expect(view.retryable).toBe(true);
    expect(view.message).toMatch(/nothing was changed/i);
  });

  it("honours the limiter's Retry-After on a 429", () => {
    const view = bindErrorView(
      new ApiError("POST /x → 429 — rate limited", 429, 7_000, "rate_limited"),
    );
    expect(view.placement).toBe("banner");
    expect(view.retryable).toBe(true);
    expect(view.retryAfterMs).toBe(7_000);
    expect(view.message).toMatch(/wait 7s/);
  });

  it("still handles a 429 that sent no Retry-After", () => {
    const view = bindErrorView(new ApiError("POST /x → 429", 429));
    expect(view.retryAfterMs).toBeUndefined();
    expect(view.message).toMatch(/wait a moment/i);
  });

  it("handles a rate_limited code that did not arrive as a 429", () => {
    const view = bindErrorView(bindError("rate_limited", 503));
    expect(view.placement).toBe("banner");
    expect(view.retryable).toBe(true);
    expect(view.message).toMatch(/too many requests/i);
  });

  it("says something true for a binding_not_found that reached the form", () => {
    const view = bindErrorView(bindError("binding_not_found", 404));
    expect(view.placement).toBe("banner");
    expect(view.message).toMatch(/no endpoint bound yet/i);
  });

  it("banners a code this build has never heard of rather than swallowing it", () => {
    const view = bindErrorView(
      bindError("teapot_unavailable", 418, "short and stout"),
    );
    expect(view.placement).toBe("banner");
    expect(view.retryable).toBe(true);
    expect(view.message).toBe("short and stout");
  });

  it("banners a transport failure, which carries no code at all", () => {
    const view = bindErrorView(
      new Error("POST /agents/x/bind → timeout after 105s"),
    );
    expect(view.placement).toBe("banner");
    expect(view.retryable).toBe(true);
    expect(view.message).toMatch(/could not bind the endpoint/i);
  });
});

describe("bind phases", () => {
  it("is busy for exactly the three in-flight steps", () => {
    expect(isBindBusy("idle")).toBe(false);
    expect(isBindBusy("challenging")).toBe(true);
    expect(isBindBusy("awaiting_signature")).toBe(true);
    expect(isBindBusy("binding")).toBe(true);
    expect(isBindBusy("success")).toBe(false);
  });

  it("announces the wallet step by naming the popup, not a generic wait", () => {
    // A screen-reader user gets no other notice that the browser is idle
    // because something in ANOTHER window wants their attention.
    expect(bindPhaseMessage("awaiting_signature")).toMatch(/wallet popup/i);
  });

  it("has an announcement for every in-flight step and for success", () => {
    expect(bindPhaseMessage("challenging")).toMatch(/challenge/i);
    expect(bindPhaseMessage("binding")).toMatch(/binding the endpoint/i);
    expect(bindPhaseMessage("success")).toMatch(/bound/i);
  });

  it("says nothing at rest", () => {
    expect(bindPhaseMessage("idle")).toBeNull();
  });
});
