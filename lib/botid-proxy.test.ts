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

describe("the backend's answer", () => {
  it("passes the status, Retry-After and the envelope through", async () => {
    const envelope = JSON.stringify({
      error: { code: "planning_paused", message: "later" },
    });
    const { fetch } = backend(
      () =>
        new Response(envelope, {
          status: 503,
          headers: {
            "retry-after": "30",
            "content-type": "application/json",
            "x-request-id": "rid",
          },
        }),
    );
    const res = await forwardToBackend(visit(), { fetch, base: BASE });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("x-request-id")).toBe("rid");
    expect(await res.text()).toBe(envelope);
  });

  it("passes a 429 and a 201 through unchanged", async () => {
    for (const status of [201, 409, 429]) {
      const { fetch } = backend(() => new Response("{}", { status }));
      const res = await forwardToBackend(visit(), { fetch, base: BASE });
      expect(res.status).toBe(status);
    }
  });

  it("streams the body as it arrives", async () => {
    const encoder = new TextEncoder();
    let push: (chunk: string) => void = () => {};
    let end: () => void = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (chunk) => controller.enqueue(encoder.encode(chunk));
        end = () => controller.close();
      },
    });
    const { fetch } = backend(() => new Response(stream));
    const res = await forwardToBackend(visit(), { fetch, base: BASE });
    // The response is in hand before the backend has finished its body.
    const reader = res.body!.getReader();
    push("first");
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("first");
    push("second");
    end();
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toBe("second");
    expect((await reader.read()).done).toBe(true);
  });

  it("drops hop-by-hop headers and the decoded body's old encoding", () => {
    const out = returnedHeaders(
      new Headers({
        connection: "close",
        "transfer-encoding": "chunked",
        "content-encoding": "gzip",
        "content-length": "10",
        "content-type": "application/json",
      }),
    );
    expect([...out.keys()]).toEqual(["content-type"]);
  });

  it("keeps each Set-Cookie apart", () => {
    const upstream = new Headers();
    upstream.append("set-cookie", "a=1; Path=/");
    upstream.append("set-cookie", "b=2; Path=/");
    expect(returnedHeaders(upstream).getSetCookie()).toEqual([
      "a=1; Path=/",
      "b=2; Path=/",
    ]);
  });
});

describe("the proxy token", () => {
  it("never reaches the browser, even if the backend echoes it", async () => {
    const { fetch } = backend(
      () =>
        new Response("{}", {
          headers: { [PROXY_TOKEN_HEADER]: TOKEN },
        }),
    );
    const res = await forwardToBackend(visit(), { fetch, base: BASE });
    expect(res.headers.get(PROXY_TOKEN_HEADER)).toBeNull();
    for (const [, value] of res.headers) expect(value).not.toContain(TOKEN);
  });

  it("is never logged when the backend fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetch } = backend(() => {
      throw new TypeError(`fetch failed ${TOKEN}`);
    });
    await forwardToBackend(visit(), { fetch, base: BASE });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });
});

describe("a backend that does not answer", () => {
  it("is a 502 upstream_unreachable in the backend's envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetch } = backend(() => {
      throw new TypeError("fetch failed");
    });
    const res = await forwardToBackend(
      visit(undefined, { headers: { "x-vercel-id": "iad1::abc" } }),
      { fetch, base: BASE },
    );
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      detail: "The backend could not be reached.",
      error: {
        code: "upstream_unreachable",
        message: "The backend could not be reached.",
        request_id: "iad1::abc",
      },
    });
  });

  it("is a 504 upstream_timeout once the deadline passes", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = forwardToBackend(visit(), {
      fetch,
      base: BASE,
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe("upstream_timeout");
  });

  it("waits longer than the console's own POST deadline", async () => {
    const { POST_TIMEOUT_MS } = await import("./api");
    expect(UPSTREAM_TIMEOUT_MS).toBeGreaterThan(POST_TIMEOUT_MS);
    expect(UPSTREAM_TIMEOUT_MS).toBeLessThan(120_000);
  });

  it("is let go of when the browser hangs up", async () => {
    const hangUp = new AbortController();
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = forwardToBackend(
      visit(undefined, { signal: hangUp.signal }),
      { fetch, base: BASE },
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    hangUp.abort();
    const res = await pending;
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    // Not reported as a timeout: nobody waited out the deadline.
    expect(res.status).toBe(502);
  });
});
