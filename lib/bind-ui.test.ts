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
import {
  CHALLENGE_EXPIRY_GUARD_MS,
  CLOCK_SKEW_TOLERANCE_MS,
  bindTimestampMs,
  challengeExpiresAtMs,
  formatValidity,
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
