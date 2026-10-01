// @vitest-environment jsdom
/**
 * The network composition card: the measured skill mix (from the overview,
 * or derived from the registry), the registry's presence line, and a reason
 * — never the legacy constants — when the mix cannot be read.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  OTHER_SKILLS,
  REASONS,
  deriveNetworkStats,
  type NetworkStats,
} from "@/lib/network-stats";
import type { Agent } from "@/lib/types";
import { SkillMix, presenceLine } from "./skill-mix";

afterEach(cleanup);

const agent = (id: string, skills: string[], over: Partial<Agent> = {}) =>
  ({
    id,
    name: id,
    skills,
    price: 0.01,
    rep: 4,
    status: "online",
    runs: 0,
    source: "onchain",
    bound: true,
    ...over,
  }) satisfies Agent;

const derived = (agents: Agent[]): NetworkStats =>
  deriveNetworkStats({
    agents: { ok: true, value: agents },
    adoption: { ok: false, error: "→ 503" },
    reputation: { ok: false, error: "→ 503" },
  });

describe("SkillMix", () => {
  it("shows each skill's agent count and share, other row included", () => {
    const { container } = render(
      <SkillMix
        stats={derived([
          agent("a", ["code"]),
          agent("b", ["code", "research"]),
          agent("c", [], { status: "offline", bound: false }),
          agent("d", ["research"]),
        ])}
      />,
    );
    const rows = Array.from(container.querySelectorAll("[data-skill]"));
    expect(rows.map((r) => r.getAttribute("data-skill"))).toEqual([
      "code",
      "research",
      OTHER_SKILLS,
    ]);
    expect(rows[0].textContent).toBe("code2 agents · 50%");
    expect(rows[2].textContent).toBe(`${OTHER_SKILLS}1 agent · 25%`);
    expect(
      (rows[0].querySelector("[aria-hidden] > div") as HTMLElement).style.width,
    ).toBe("50%");
    expect(container.textContent).toContain(
      "3 listed online · 3 with a bound endpoint",
    );
    // The legacy constants never appear.
    expect(container.textContent).not.toMatch(/content|38%/);
  });

  it("gives the reason when the registry could not be read", () => {
    const stats = deriveNetworkStats({
      agents: { ok: false, error: "→ 503" },
      adoption: { ok: false, error: "→ 503" },
      reputation: { ok: false, error: "→ 503" },
    });
    const { container } = render(<SkillMix stats={stats} />);
    expect(container.textContent).toBe(
      `Skill mix unavailable — ${REASONS.registry}.`,
    );
    expect(presenceLine(stats)).toBeNull();
  });

  it("says nobody is registered rather than drawing empty bars", () => {
    const { container } = render(<SkillMix stats={derived([])} />);
    expect(container.textContent).toContain("No agents registered yet.");
    expect(container.querySelectorAll("[data-skill]")).toHaveLength(0);
  });
});
