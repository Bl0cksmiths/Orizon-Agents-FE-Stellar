/**
 * The `/api/*` middleware (middleware.ts): what it hands on to the rewrite
 * and the route handlers, read the way Next reads it — the request-header
 * override the response carries — and what it never hands the browser.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The request headers Next forwards after this middleware. */
function forwarded(res: Response): Record<string, string> {
  const names = (res.headers.get("x-middleware-override-headers") ?? "")
    .split(",")
    .filter(Boolean);
  return Object.fromEntries(
    names.map((n) => [n, res.headers.get(`x-middleware-request-${n}`) ?? ""]),
  );
}

const visit = (headers: Record<string, string> = {}) =>
  new NextRequest("https://orizons.test/api/orchestrator/execute", {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "x-frontend-proxy-token": "forged",
      "x-orizon-client-ip": "6.6.6.6",
      ...headers,
    },
  });

describe("middleware", () => {
  it("runs on every /api path and nowhere else", () => {
    expect(config.matcher).toBe("/api/:path*");
  });

  it("forwards our token and the visitor's address in place of theirs", () => {
    vi.stubEnv("FRONTEND_PROXY_TOKEN", "s3cret");
    const out = forwarded(middleware(visit()));
    expect(out["x-frontend-proxy-token"]).toBe("s3cret");
    expect(out["x-orizon-client-ip"]).toBe("203.0.113.7");
  });

  it("strips the claimed identity and adds none without a token", () => {
    vi.stubEnv("FRONTEND_PROXY_TOKEN", "");
    const out = forwarded(middleware(visit()));
    expect(out).not.toHaveProperty("x-frontend-proxy-token");
    expect(out).not.toHaveProperty("x-orizon-client-ip");
  });

  it("keeps everything else the browser sent", () => {
    const out = forwarded(middleware(visit({ "x-task-token": "tok" })));
    expect(out["x-task-token"]).toBe("tok");
  });

  it("puts nothing of the token on the response itself", () => {
    vi.stubEnv("FRONTEND_PROXY_TOKEN", "s3cret");
    const res = middleware(visit());
    for (const [name, value] of res.headers) {
      if (name.startsWith("x-middleware-")) continue;
      expect(value).not.toContain("s3cret");
    }
  });
});
