// @vitest-environment jsdom
/**
 * The Overview's four figures: measured values with their captions, a dash
 * and a reason for anything unmeasured, and no figure at all before the
 * first read lands. Plain DOM checks — this repo does not install jest-dom.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  REASONS,
  deriveNetworkStats,
  statsFromOverview,
} from "@/lib/network-stats";
import type { OverviewV2 } from "@/lib/types";
import { NetworkTiles, TILE_LABELS } from "./network-tiles";

afterEach(cleanup);

const overview: OverviewV2 = {
  generated_at: 1_790_900_000,
  agents: {
    registered: 2481,
    onchain: 13,
    seeded: 12,
    external: 11,
    bound: 6,
    online: 22,
  },
  operators: { external_wallets: 7 },
  workflows: { settled: 3, series: [] },
  tasks: { recent: 0, complete: 0, failed: 0, completion_rate: null },
  trust: { avg: 3.4885, rated_agents: 12 },
  skills: [],
  degraded: false,
};

const tile = (label: string) => {
  const el = screen.getByText(label).closest("[data-stat-tile]");
  if (!(el instanceof HTMLElement)) throw new Error(`no tile for ${label}`);
  return el;
};

describe("NetworkTiles", () => {
  it("states each measured figure with its caption", () => {
    render(<NetworkTiles stats={statsFromOverview(overview)} failed={false} />);

    expect(tile("Registered agents").textContent).toContain("2,481");
    expect(tile("Registered agents").textContent).toContain(
      "13 on-chain · 12 seeded",
    );
    expect(tile("External agents").textContent).toContain("11");
    expect(tile("Settled workflows").textContent).toContain("3");
    expect(tile("Avg trust (on-chain)").textContent).toContain("3.49/ 5");
    expect(tile("Avg trust (on-chain)").textContent).toContain(
      "across 12 rated agents",
    );
  });

  it("links the operator-wallet caption to the ecosystem page", () => {
    render(<NetworkTiles stats={statsFromOverview(overview)} failed={false} />);
    const link = within(tile("External agents")).getByRole("link", {
      name: "from 7 operator wallets",
    });
    expect(link.getAttribute("href")).toBe("/app/ecosystem");
  });

  it("prints a dash and the reason for every unmeasured figure", () => {
    const stats = deriveNetworkStats({
      agents: { ok: false, error: "→ 503" },
      adoption: { ok: false, error: "→ 503" },
      reputation: { ok: false, error: "→ 503" },
    });
    const { container } = render(<NetworkTiles stats={stats} failed={false} />);

    const reasons = [
      REASONS.registry,
      REASONS.adoption,
      REASONS.settledUnreported,
      REASONS.reputation,
    ];
    TILE_LABELS.forEach((label, i) => {
      const t = tile(label);
      expect(t.textContent).toContain("—");
      expect(t.textContent).toContain(reasons[i]);
      expect(within(t).getByText("not available").className).toContain(
        "sr-only",
      );
    });
    // No figure stands in for a missing one.
    expect(container.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says no on-chain ratings yet rather than showing a trust figure", () => {
    render(
      <NetworkTiles
        stats={statsFromOverview({
          ...overview,
          trust: { avg: null, rated_agents: 0 },
        })}
        failed={false}
      />,
    );
    expect(tile("Avg trust (on-chain)").textContent).toBe(
      `Avg trust (on-chain)—not available${REASONS.noRatings}`,
    );
  });

  it("shows labels and no figures before the first read lands", () => {
    const { container, rerender } = render(
      <NetworkTiles stats={null} failed={false} />,
    );
    for (const label of TILE_LABELS) screen.getByText(label);
    expect(container.querySelectorAll("[data-stat-tile]")).toHaveLength(0);
    expect(container.textContent).not.toContain("unavailable");

    rerender(<NetworkTiles stats={null} failed />);
    expect(screen.getAllByText("unavailable")).toHaveLength(4);
  });
});
