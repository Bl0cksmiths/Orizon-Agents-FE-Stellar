// @vitest-environment jsdom
/**
 * The sidebar footer's network line: the registered and external counts from
 * the network-stats layer, a dash for either one that could not be read, and
 * never the legacy "2,481 agents online".
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deriveNetworkStats,
  statsFromOverview,
  type NetworkStats,
} from "@/lib/network-stats";
import type { OverviewV2 } from "@/lib/types";
import { MobileNavProvider } from "./mobile-nav-context";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));

const hook = vi.hoisted(() => ({
  result: {
    data: null as NetworkStats | null,
    error: null as string | null,
    loading: false,
    retrying: false,
    lastSuccessAt: null as number | null,
    reload: () => {},
  },
}));
vi.mock("@/lib/use-network-stats", () => ({
  useNetworkStats: () => hook.result,
}));

const measured: OverviewV2 = {
  generated_at: 1_790_900_000,
  agents: {
    registered: 25,
    onchain: 13,
    seeded: 12,
    external: 11,
    bound: 6,
    online: 22,
  },
  operators: { external_wallets: 7 },
  workflows: { settled: null, series: [] },
  tasks: { recent: 0, complete: 0, failed: 0, completion_rate: null },
  trust: { avg: null, rated_agents: 0 },
  skills: [],
  degraded: false,
};

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  hook.result = {
    ...hook.result,
    data: null,
    error: null,
    lastSuccessAt: null,
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const footer = () =>
  screen.getByText("network").closest(".clip-cyber") as HTMLElement;

const renderSidebar = () =>
  render(
    <MobileNavProvider>
      <Sidebar />
    </MobileNavProvider>,
  );

describe("Sidebar network line", () => {
  it("states the registered and external counts", () => {
    hook.result = {
      ...hook.result,
      data: statsFromOverview(measured),
      lastSuccessAt: Date.now(),
    };
    renderSidebar();
    expect(footer().textContent).toContain(
      "25 agents registered · 11 external",
    );
    expect(footer().textContent).not.toMatch(/online|completion|2,481/);
  });

  it("dashes the external count when the adoption read failed", () => {
    hook.result = {
      ...hook.result,
      data: deriveNetworkStats({
        agents: { ok: true, value: [] },
        adoption: { ok: false, error: "→ 503" },
        reputation: { ok: false, error: "→ 503" },
      }),
    };
    renderSidebar();
    expect(footer().textContent).toContain("0 agents registered · — external");
  });

  it("shows dashes, not numbers, before anything has loaded", () => {
    renderSidebar();
    expect(footer().textContent).toContain("— agents registered · — external");
    expect(footer().textContent).not.toMatch(/\d/);
  });

  it("says the metrics are unavailable when the read failed", () => {
    hook.result = { ...hook.result, error: "GET /agents → 503" };
    renderSidebar();
    expect(footer().textContent).toContain("network metrics unavailable");
    expect(footer().textContent).not.toContain("agents registered");
  });
});
