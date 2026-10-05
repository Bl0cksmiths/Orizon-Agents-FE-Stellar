/**
 * The proxy identity the frontend's server presents to the backend
 * (lib/proxy-identity.ts): the token from server-only env, the visitor's
 * address, and the stripping that keeps a browser from claiming either.
 */
import { describe, expect, it } from "vitest";
import {
  CLIENT_IP_HEADER,
  PROXY_TOKEN_ENV,
  PROXY_TOKEN_HEADER,
  cachedReadHeaders,
  clientIp,
  forwardedRequestHeaders,
  proxyToken,
} from "./proxy-identity";

describe("proxyToken", () => {
  it("reads the server-only variable", () => {
    expect(PROXY_TOKEN_ENV).toBe("FRONTEND_PROXY_TOKEN");
    expect(PROXY_TOKEN_ENV.startsWith("NEXT_PUBLIC_")).toBe(false);
    expect(proxyToken({ FRONTEND_PROXY_TOKEN: " s3cret " })).toBe("s3cret");
  });

  it("is null when unset or blank", () => {
    expect(proxyToken({})).toBeNull();
    expect(proxyToken({ FRONTEND_PROXY_TOKEN: "   " })).toBeNull();
  });
});

describe("clientIp", () => {
  const req = (ip: string | undefined, xff?: string) => ({
    ip,
    headers: new Headers(xff === undefined ? {} : { "x-forwarded-for": xff }),
  });

  it("prefers the platform's reading", () => {
    expect(clientIp(req("203.0.113.7", "198.51.100.1"))).toBe("203.0.113.7");
  });

  it("falls back to the first forwarded-for entry", () => {
    expect(clientIp(req(undefined, "198.51.100.1, 10.0.0.1"))).toBe(
      "198.51.100.1",
    );
    expect(clientIp(req(undefined, "2001:db8::1"))).toBe("2001:db8::1");
  });

  it("refuses anything that is not an address", () => {
    expect(clientIp(req(undefined))).toBeNull();
    expect(clientIp(req("not an ip", "<script>"))).toBeNull();
    expect(clientIp(req(undefined, "1".repeat(65)))).toBeNull();
  });
});

describe("forwardedRequestHeaders", () => {
  const spoofed = () =>
    new Headers({
      accept: "application/json",
      [PROXY_TOKEN_HEADER]: "forged",
      [CLIENT_IP_HEADER.toLowerCase()]: "6.6.6.6",
    });

  it("replaces whatever the browser claimed with our identity", () => {
    const out = forwardedRequestHeaders(spoofed(), {
      token: "s3cret",
      clientIp: "203.0.113.7",
    });
    expect(out.get(PROXY_TOKEN_HEADER)).toBe("s3cret");
    expect(out.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(out.get("accept")).toBe("application/json");
  });

  it("forwards no identity at all without a token, and strips the claimed one", () => {
    const out = forwardedRequestHeaders(spoofed(), {
      token: null,
      clientIp: "203.0.113.7",
    });
    expect(out.get(PROXY_TOKEN_HEADER)).toBeNull();
    expect(out.get(CLIENT_IP_HEADER)).toBeNull();
  });

  it("sends the token without an address it could not read", () => {
    const out = forwardedRequestHeaders(spoofed(), {
      token: "s3cret",
      clientIp: null,
    });
    expect(out.get(PROXY_TOKEN_HEADER)).toBe("s3cret");
    expect(out.get(CLIENT_IP_HEADER)).toBeNull();
  });
});

describe("cachedReadHeaders", () => {
  it("sends the token alone, acting for nobody", () => {
    expect(cachedReadHeaders("s3cret")).toEqual({
      [PROXY_TOKEN_HEADER]: "s3cret",
    });
  });

  it("sends nothing without a token", () => {
    expect(cachedReadHeaders(null)).toEqual({});
  });
});
