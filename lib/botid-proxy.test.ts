/**
 * The guarded routes' way to the backend (lib/botid-proxy.ts): what reaches
 * the backend, what comes back to the browser, and how a backend that does
 * not answer is reported. The fetch is stubbed; nothing leaves the process.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UPSTREAM_TIMEOUT_MS,
  backendUrl,
  botGuardedProxy,
  forwardToBackend,
  forwardedHeaders,
  returnedHeaders,
} from "./botid-proxy";
import { PROXY_TOKEN_HEADER, CLIENT_IP_HEADER } from "./proxy-identity";

const BASE = "https://backend.test";
const TOKEN = "s3cret-proxy-token";

type FetchCall = { url: string; init: RequestInit };

/** A stub backend answering `answer`, recording what it was asked. */
function backend(answer: () => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  });
  return { calls, fetch };
}

/** A request as the route handler receives it, after middleware.ts. */
const visit = (
  path = "/api/orchestrator/execute",
  init: RequestInit & { headers?: Record<string, string> } = {},
) =>
  new Request(`https://orizons.test${path}`, {
    method: "POST",
    ...init,
    headers: {
      "content-type": "application/json",
      [PROXY_TOKEN_HEADER]: TOKEN,
      [CLIENT_IP_HEADER]: "203.0.113.7",
      ...init.headers,
    },
  });

const sent = (call: FetchCall) => new Headers(call.init.headers);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("backendUrl", () => {
  it("keeps the path and the query, on the backend origin", () => {
    const req = new Request("https://orizons.test/api/agents/a%2Fb/bind?x=1");
    expect(backendUrl(req, BASE)).toBe(
      "https://backend.test/api/agents/a%2Fb/bind?x=1",
    );
  });
});

describe("forwarded request headers", () => {
  it("keeps what middleware set: the proxy token and the visitor's address", async () => {
    const { calls, fetch } = backend(() => new Response("{}"));
    await forwardToBackend(visit(), { fetch, base: BASE });
    expect(sent(calls[0]).get(PROXY_TOKEN_HEADER)).toBe(TOKEN);
    expect(sent(calls[0]).get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(sent(calls[0]).get("content-type")).toBe("application/json");
  });

  it("keeps the caller's own headers, the task token among them", () => {
    const out = forwardedHeaders(
      new Headers({ "x-task-token": "tt", "user-agent": "ua" }),
    );
    expect(out.get("x-task-token")).toBe("tt");
    expect(out.get("user-agent")).toBe("ua");
  });

  it("drops hop-by-hop headers, and those the Connection header names", () => {
    const out = forwardedHeaders(
      new Headers({
        connection: "keep-alive, x-private-hop",
        "keep-alive": "timeout=5",
        "x-private-hop": "1",
        te: "trailers",
        upgrade: "h2c",
        "proxy-authorization": "Basic x",
        "transfer-encoding": "chunked",
      }),
    );
    expect([...out.keys()]).toEqual([]);
  });

  it("drops what fetch sets itself, BotID's answer, and platform internals", () => {
    const out = forwardedHeaders(
      new Headers({
        host: "orizons.test",
        "content-length": "12",
        "accept-encoding": "br",
        "x-is-human": "{}",
        "x-path": "/api/x",
        "x-method": "POST",
        "x-vercel-oidc-token": "oidc",
        "x-middleware-override-headers": "a",
        "x-middleware-request-a": "1",
        "x-invoke-path": "/x",
        "x-matched-path": "/api/x",
      }),
    );
    expect([...out.keys()]).toEqual([]);
  });
});

describe("the body", () => {
  it("reaches the backend byte for byte, never re-serialized", async () => {
    const { calls, fetch } = backend(() => new Response("{}"));
    // Spacing and key order a JSON round trip would not keep.
    const raw = '{ "plan_id":"p1",  "payer" : "G\\u0041" }';
    await forwardToBackend(visit(undefined, { body: raw }), {
      fetch,
      base: BASE,
    });
    const body = calls[0].init.body as ArrayBuffer;
    expect(new TextDecoder().decode(body)).toBe(raw);
  });

  it("is absent for an empty POST and for a GET", async () => {
    const { calls, fetch } = backend(() => new Response("{}"));
    await forwardToBackend(visit(), { fetch, base: BASE });
    await forwardToBackend(visit(undefined, { method: "GET" }), {
      fetch,
      base: BASE,
    });
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[1].init.body).toBeUndefined();
  });

  it("goes out with the method, uncached, redirects not followed", async () => {
    const { calls, fetch } = backend(() => new Response("{}"));
    await forwardToBackend(visit(undefined, { method: "DELETE" }), {
      fetch,
      base: BASE,
    });
    expect(calls[0].url).toBe(`${BASE}/api/orchestrator/execute`);
    expect(calls[0].init).toMatchObject({
      method: "DELETE",
      cache: "no-store",
      redirect: "manual",
    });
  });
});
