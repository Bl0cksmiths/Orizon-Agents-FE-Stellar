/**
 * The cached route handlers as the browser meets them: each module's GET,
 * against a stubbed backend at the configured origin. The cache's own rules
 * are covered in lib/api-proxy.test.ts; this checks the wiring — the right
 * backend path, the right shape check, the registry rule on the two reads
 * that count the registry, and paging on the agent list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_CURSOR_HEADER,
  READ_AT_HEADER,
  TOTAL_COUNT_HEADER,
} from "@/lib/api-proxy";

const fetchMock =
  vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

const agent = (i: number) => ({
  id: `agt_${i}`,
  name: `agent ${i}`,
  skills: ["research"],
  price: 0.01,
  rep: 4,
  runs: 0,
  status: "online",
});

const overview = (registrySynced: boolean, registered: number) => ({
  generated_at: 1_700_000_000,
  agents: {
    registered,
    onchain: registered,
    seeded: 0,
    online: 0,
    external: 0,
    bound: 0,
  },
  operators: { external_wallets: 0 },
  workflows: { settled: 0, series: [] },
  trust: { avg: null, rated_agents: 0 },
  skills: [],
  registry_synced: registrySynced,
});

/** A fresh copy of a route module, so no cached copy leaks between tests. */
async function route(path: string) {
  vi.resetModules();
  return (await import(`./${path}/route`)) as {
    GET: (req: Request) => Promise<Response>;
    dynamic: string;
    maxDuration: number;
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_BASE", "https://backend.test/");
  vi.stubEnv("VERCEL", "");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const req = (path: string) => new Request(`https://orizons.test/api/${path}`);

describe("the cached routes", () => {
  it.each([
    ["metrics/overview", "/api/metrics/overview", overview(true, 3)],
    [
      "stellar/reputation",
      "/api/stellar/reputation",
      { floor_bps: 1, prior_bps: 1, reputations: {} },
    ],
    [
      "ecosystem/adoption",
      "/api/ecosystem/adoption",
      {
        network: "testnet",
        generated_at: 1,
        targets: {
          external_agents: 3,
          unique_operator_wallets: 2,
          settled_external_workflows: 1,
        },
        totals: {
          external_agents: 0,
          unique_operator_wallets: 0,
          settled_external_workflows: 0,
        },
        met: {
          external_agents: false,
          unique_operator_wallets: false,
          settled_external_workflows: false,
        },
        operators: [],
        excluded: [],
      },
    ],
  ])("serves %s from the backend's %s, dated", async (path, upstream, body) => {
    fetchMock.mockResolvedValueOnce(json(body));
    const mod = await route(path);
    expect(mod.dynamic).toBe("force-dynamic");
    expect(mod.maxDuration).toBe(60);
    const res = await mod.GET(req(path));
    expect(fetchMock).toHaveBeenCalledWith(
      `https://backend.test${upstream}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(Number(res.headers.get(READ_AT_HEADER))).toBeGreaterThan(0);
  });

  it("presents the proxy token, and no visitor, on a cached read", async () => {
    vi.stubEnv("FRONTEND_PROXY_TOKEN", "s3cret");
    fetchMock.mockResolvedValueOnce(json(overview(true, 3)));
    const { GET } = await route("metrics/overview");
    await GET(
      new Request("https://orizons.test/api/metrics/overview", {
        headers: {
          "x-frontend-proxy-token": "forged",
          "x-orizon-client-ip": "6.6.6.6",
          "x-forwarded-for": "203.0.113.7",
        },
      }),
    );
    const sent = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sent.get("x-frontend-proxy-token")).toBe("s3cret");
    expect(sent.get("x-orizon-client-ip")).toBeNull();
  });

  it("presents nothing when no token is configured", async () => {
    fetchMock.mockResolvedValueOnce(json(overview(true, 3)));
    const { GET } = await route("metrics/overview");
    await GET(req("metrics/overview"));
    const sent = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(sent.get("x-frontend-proxy-token")).toBeNull();
  });

  it("refuses to cache a body the console would reject", async () => {
    fetchMock.mockResolvedValueOnce(json({ unexpected: true }));
    const { GET } = await route("stellar/network");
    const res = await GET(req("stellar/network"));
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("pages the agent list and carries the registry headers", async () => {
    const list = Array.from({ length: 5 }, (_, i) => agent(i));
    fetchMock.mockResolvedValueOnce(
      json(list, { "X-Registry-Synced": "true", "X-Registry-Count": "5" }),
    );
    const { GET } = await route("agents");
    const page = await GET(req("agents?limit=2"));
    expect(await page.json()).toEqual(list.slice(0, 2));
    expect(page.headers.get(TOTAL_COUNT_HEADER)).toBe("5");
    expect(page.headers.get(NEXT_CURSOR_HEADER)).toBe("2");
    expect(page.headers.get("x-registry-synced")).toBe("true");

    // The whole list is the same cached copy: no second backend read.
    const whole = await GET(req("agents"));
    expect(await whole.json()).toEqual(list);
    expect(whole.headers.get("x-registry-count")).toBe("5");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the complete registry over a refilling one", async () => {
    vi.useFakeTimers();
    const full = Array.from({ length: 4 }, (_, i) => agent(i));
    fetchMock
      .mockResolvedValueOnce(json(full, { "X-Registry-Synced": "true" }))
      .mockResolvedValueOnce(
        json(full.slice(0, 1), { "X-Registry-Synced": "false" }),
      );
    const { GET } = await route("agents");
    await GET(req("agents"));
    vi.advanceTimersByTime(20_000);
    const res = await GET(req("agents"));
    expect(await res.json()).toEqual(full);
    expect(res.headers.get("x-registry-synced")).toBe("true");
    expect(res.headers.get("x-orizon-cache")).toBe("held");
  });

  it("keeps the complete overview over one counted mid-refill", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(json(overview(true, 278)))
      .mockResolvedValueOnce(json(overview(false, 31)));
    const { GET } = await route("metrics/overview");
    await GET(req("metrics/overview"));
    vi.advanceTimersByTime(20_000);
    const res = await GET(req("metrics/overview"));
    expect((await res.json()).agents.registered).toBe(278);
  });
});
