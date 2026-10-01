// @vitest-environment jsdom
/**
 * The network composition card: the registry by source with counts that sum
 * to it, how much of the on-chain registry has a bound endpoint, and the
 * most-listed skills as tags with agent counts — never a flat skill-share
 * chart, never the legacy constants, and a reason for anything unread.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  REASONS,
  deriveNetworkStats,
  statsFromOverview,
} from "@/lib/network-stats";
import type { OverviewV2 } from "@/lib/types";
import { Composition, boundLine, onlineLine } from "./composition";

afterEach(cleanup);

/** Live testnet, 2026-10-02, in the measured shape. */
const live: OverviewV2 = {
  generated_at: 1_790_900_000,
  agents: {
    registered: 49,
    onchain: 37,
    seeded: 12,
    external: 24,
    bound: 6,
    online: 46,
  },
  operators: { external_wallets: 20 },
  workflows: { settled: 3, series: [] },
  tasks: { recent: 0, complete: 0, failed: 0, completion_rate: null },
  trust: { avg: 3.49, rated_agents: 12 },
  skills: [
    { name: "communication", agents: 2, pct: 2 },
    { name: "defi", agents: 2, pct: 2 },
    { name: "figma", agents: 2, pct: 1 },
    { name: "gaming", agents: 2, pct: 1 },
    { name: "haiku", agents: 2, pct: 1 },
    { name: "other", agents: 47, pct: 93 },
  ],
  degraded: false,
};

const slices = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("[data-slice]")).map((li) => [
    li.getAttribute("data-slice"),
    li.textContent,
  ]);

describe("Composition", () => {
  it("splits the registry by source, with counts and shares", () => {
    const { container } = render(
      <Composition stats={statsFromOverview(live)} />,
    );
    expect(slices(container)).toEqual([
      ["seeded", "Seeded catalog12 · 24%"],
      ["external", "On-chain · external operators24 · 49%"],
      ["onchain-other", "On-chain · team or unverified owner13 · 27%"],
    ]);
    expect(container.textContent).toContain(
      "6 of 37 on-chain agents have a bound endpoint",
    );
    expect(container.textContent).toContain("46 of 49 listed online");
  });

  it("shows the top skills as tags with agent counts, without the other row or its share", () => {
    const { container } = render(
      <Composition stats={statsFromOverview(live)} />,
    );
    const tags = Array.from(container.querySelectorAll("[data-skill]")).map(
      (t) => t.textContent,
    );
    expect(tags).toEqual([
      "communication · 2 agents",
      "defi · 2 agents",
      "figma · 2 agents",
      "gaming · 2 agents",
      "haiku · 2 agents",
    ]);
    expect(container.textContent).not.toMatch(/93%|other ·/);
  });

  it("keeps on-chain whole and says why when owners could not be verified", () => {
    const stats = statsFromOverview({
      ...live,
      agents: { ...live.agents, external: null, bound: null },
      operators: { external_wallets: null },
    });
    const { container } = render(<Composition stats={stats} />);
    expect(slices(container)).toEqual([
      ["seeded", "Seeded catalog12 · 24%"],
      ["onchain", "On-chain37 · 76%"],
    ]);
    expect(container.textContent).toContain(
      `Bound endpoints: — ${REASONS.bindings}.`,
    );
    expect(boundLine(stats)).not.toMatch(/^0 of/);
  });

  it("gives one reason when the registry could not be read", () => {
    const stats = deriveNetworkStats({
      agents: { ok: false, error: "→ 503" },
      adoption: { ok: false, error: "→ 503" },
      reputation: { ok: false, error: "→ 503" },
    });
    const { container } = render(<Composition stats={stats} />);
    expect(container.textContent).toBe(
      `Composition unavailable — ${REASONS.registry}.`,
    );
    expect(boundLine(stats)).toBeNull();
    expect(onlineLine(stats)).toBeNull();
  });

  it("says nobody is registered rather than drawing an empty bar", () => {
    const stats = deriveNetworkStats({
      agents: { ok: true, value: [] },
      adoption: { ok: false, error: "→ 503" },
      reputation: { ok: false, error: "→ 503" },
    });
    const { container } = render(<Composition stats={stats} />);
    expect(container.textContent).toContain("No agents registered yet.");
    expect(container.querySelectorAll("[data-slice]")).toHaveLength(0);
  });
});
