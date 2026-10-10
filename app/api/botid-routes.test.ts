/**
 * The BotID-guarded route handlers as the browser meets them: every handler
 * under app/api/ built on `botGuardedProxy`, found on disk so a new one cannot
 * skip these checks. For each: it is on the list the browser's half reads
 * (lib/botid-routes.ts), it runs on Node with room for a slow backend, a bot
 * is refused before the backend hears of it, and a person's request reaches
 * the backend's same path with its body unchanged.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { BOTID_PROTECTED_ROUTES, isBotIdProtected } from "@/lib/botid-routes";
import { UPSTREAM_TIMEOUT_MS } from "@/lib/botid-proxy";
import { CLIENT_IP_HEADER, PROXY_TOKEN_HEADER } from "@/lib/proxy-identity";

const checkBotId = vi.hoisted(() => vi.fn<() => Promise<{ isBot: boolean }>>());
vi.mock("botid/server", () => ({ checkBotId }));

const BACKEND = "https://backend.test";
const fetchMock =
  vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

type GuardedModule = {
  POST: (req: Request) => Promise<Response>;
  DELETE?: (req: Request) => Promise<Response>;
  runtime: string;
  dynamic: string;
  maxDuration: number;
};

/** Every route.ts under app/api/, relative to it. */
function routeFiles(dir = __dirname): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

/** The guarded handlers: the route files built on `botGuardedProxy`. */
const GUARDED = routeFiles()
  .filter((file) => readFileSync(file, "utf8").includes("botGuardedProxy("))
  .map((file) => {
    const dir = relative(__dirname, file).split(sep).slice(0, -1);
    return {
      dir: dir.join("/"),
      // The list's pattern: a dynamic segment is BotID's `*`.
      pattern: `/api/${dir.map((s) => (s.startsWith("[") ? "*" : s)).join("/")}`,
      // A concrete URL for it, with an id that needs escaping.
      url: `/api/${dir.map((s) => (s.startsWith("[") ? "agt%201" : s)).join("/")}`,
    };
  });

async function load(dir: string): Promise<GuardedModule> {
  return (await import(`./${dir}/route`)) as GuardedModule;
}

const post = (
  url: string,
  body: string,
  headers: Record<string, string> = {},
) =>
  new Request(`https://orizons.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

beforeEach(() => {
  checkBotId.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_BASE", BACKEND);
  vi.stubEnv("VERCEL", "1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the guarded route handlers", () => {
  it("are exactly the list the browser's half reads", () => {
    expect(GUARDED.map((r) => r.pattern).sort()).toEqual(
      BOTID_PROTECTED_ROUTES.map((r) => r.path).sort(),
    );
  });

  describe.each(GUARDED)("$url", ({ dir, url }) => {
    it("is guarded for POST in the browser's half too", () => {
      expect(isBotIdProtected(url, "POST")).toBe(true);
    });

    it("runs on Node, per request, with room for the upstream deadline", async () => {
      const mod = await load(dir);
      expect(mod.runtime).toBe("nodejs");
      expect(mod.dynamic).toBe("force-dynamic");
      expect(mod.maxDuration * 1_000).toBeGreaterThan(UPSTREAM_TIMEOUT_MS);
    });

    it("refuses a bot with 403 bot_detected, and the backend never hears of it", async () => {
      checkBotId.mockResolvedValue({ isBot: true });
      const res = await (await load(dir)).POST(post(url, "{}"));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("bot_detected");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("forwards a person's request to the same backend path, body unchanged", async () => {
      checkBotId.mockResolvedValue({ isBot: false });
      const body = '{"a": 1,  "b":"two"}';
      const res = await (await load(dir)).POST(post(`${url}?v=1`, body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const [target, init] = fetchMock.mock.calls[0];
      expect(target).toBe(`${BACKEND}${url}?v=1`);
      expect(init?.method).toBe("POST");
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(body);
    });
  });
});

describe("POST /api/agents/{id}/bind's other method", () => {
  it("DELETE is forwarded unchecked, so the path does not answer 405", async () => {
    checkBotId.mockResolvedValue({ isBot: true });
    const mod = await load("agents/[agentId]/bind");
    const res = await mod.DELETE!(
      new Request("https://orizons.test/api/agents/agt_1/bind", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(200);
    expect(checkBotId).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BACKEND}/api/agents/agt_1/bind`);
  });
});

describe("what middleware.ts sets on the request", () => {
  /**
   * The request a route handler receives after the middleware: Next applies
   * the `x-middleware-override-headers` list the middleware's response
   * carries, replacing the request's headers with the
   * `x-middleware-request-*` values (next/dist/server/web/utils.ts).
   */
  function afterMiddleware(request: NextRequest): Request {
    const res = middleware(request);
    const names = (res.headers.get("x-middleware-override-headers") ?? "")
      .split(",")
      .filter(Boolean);
    const headers = new Headers();
    for (const name of names) {
      const value = res.headers.get(`x-middleware-request-${name}`);
      if (value !== null) headers.set(name, value);
    }
    return new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      duplex: "half",
    } as RequestInit);
  }

  it("reaches the backend: our token and the visitor's address, not theirs", async () => {
    vi.stubEnv("FRONTEND_PROXY_TOKEN", "the-real-token");
    checkBotId.mockResolvedValue({ isBot: false });
    const visit = new NextRequest(
      "https://orizons.test/api/orchestrator/decompose",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.7, 10.0.0.1",
          [PROXY_TOKEN_HEADER]: "forged",
          [CLIENT_IP_HEADER]: "6.6.6.6",
        },
        body: '{"intent":"x"}',
      },
    );
    const mod = await load("orchestrator/decompose");
    const res = await mod.POST(afterMiddleware(visit));
    expect(res.status).toBe(200);
    const sent = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sent.get(PROXY_TOKEN_HEADER)).toBe("the-real-token");
    expect(sent.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    // And the token went to the backend only: not back to the browser.
    expect(res.headers.get(PROXY_TOKEN_HEADER)).toBeNull();
  });
});
