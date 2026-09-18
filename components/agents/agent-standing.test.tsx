// @vitest-environment jsdom
/**
 * Unit tests for AgentStanding.
 *
 * This cell is the only thing on the marketplace that tells a buyer whether a
 * listing can actually be hired, so the tests are written against the words it
 * says rather than its markup: a refactor is free, a changed claim is not.
 *
 * Several assertions exist because the claim they guard is cheap to break by
 * accident, and has been broken somewhere in this codebase before:
 *
 *   - The floor reads the LOWER BOUND, never the smoothed headline score. The
 *     two disagree exactly on the agent this cell exists for, so both
 *     directions of that confusion are pinned.
 *   - `>=` passes. An agent sitting exactly on the floor clears it, and an
 *     off-by-one here quietly condemns every agent on the line.
 *   - Provenance comes from `source`, never from `real`. `registry_sync` sets
 *     `real` false for every on-chain agent and the seeded catalog is a mix,
 *     so a cell keyed off it marks roughly the opposite population while
 *     looking entirely correct.
 *   - A degraded read and a cold start both arrive as `source: "prior"` and
 *     differ by one optional flag. One of them means we could not read the
 *     chain, so they must never render alike.
 *   - Not knowing has three shapes here — no score, no floor, a degraded
 *     score — and none of them is grounds for a verdict.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { UNBOUND_WARNING } from "@/lib/binding-status";
import type { Agent, ReputationInfo } from "@/lib/types";
import { AgentStanding } from "./agent-standing";

afterEach(cleanup);

/** 3.00 on the 0–5 scale, matching the floor the operator panel tests use. */
const FLOOR_BPS = 6000;

/** A seeded catalog agent: no owner, no endpoint, nothing to bind. */
function seeded(over: Partial<Agent> = {}): Agent {
  return {
    id: "agt_11c0",
    name: "Kestrel",
    skills: ["research"],
    price: 0.25,
    rep: 4.4,
    status: "online",
    runs: 128,
    source: "seeded",
    ...over,
  };
}

/** An agent someone registered against the on-chain registry. `real: false` is
 *  the realistic value — `registry_sync` sets it that way for every one of
 *  them — which is exactly why it must not be what provenance is read from. */
function onchain(over: Partial<Agent> = {}): Agent {
  return seeded({
    id: "agt_9f2a",
    name: "Harrier",
    source: "onchain",
    owner: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
    real: false,
    bound: true,
    ...over,
  });
}

/** A rated agent comfortably clear of the floor unless a test says otherwise. */
function rep(over: Partial<ReputationInfo> = {}): ReputationInfo {
  return {
    agent_id: "agt_11c0",
    smoothed_bps: 9000,
    lower_bound_bps: 8200,
    avg_bps: 9100,
    count: 24,
    weight: 0.9,
    disputed: 0,
    dispute_rate_bps: 0,
    source: "onchain",
    ...over,
  };
}

/** The agent this cell exists for: a healthy headline score with too few
 *  settled ratings behind it, so the lower bound does not clear the floor. */
function thinEvidence(over: Partial<ReputationInfo> = {}): ReputationInfo {
  return rep({ smoothed_bps: 9600, lower_bound_bps: 4100, count: 2, ...over });
}

function renderCell(props: Partial<Parameters<typeof AgentStanding>[0]> = {}) {
  return render(
    <AgentStanding
      agent={seeded()}
      rep={rep()}
      floorBps={FLOOR_BPS}
      {...props}
    />,
  );
}

/** The short labels a sighted reader sees, one per marker. */
function labels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[aria-hidden='true']")).map(
    (el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
}

/** The long form each marker carries for a screen reader and a pointer. */
function detail(container: HTMLElement): string {
  return Array.from(container.querySelectorAll(".sr-only"))
    .map((el) => el.textContent ?? "")
    .join(" ");
}

describe("AgentStanding — the floor verdict", () => {
  it("calls an agent under the floor not eligible, visibly in the row", () => {
    const { container } = renderCell({ rep: thinEvidence() });
    expect(labels(container)).toContain("⚑ below floor · not eligible");
  });

  it("renders nothing for an agent that clears the floor", () => {
    const { container } = renderCell({ rep: rep() });
    expect(container.innerHTML).toBe("");
  });

  // The backend's comparison is `lower_bound_bps >= floor_bps`. An agent
  // exactly on the line passes, and an off-by-one here condemns every one.
  it("treats an agent exactly on the floor as clear", () => {
    const { container } = renderCell({
      rep: rep({ lower_bound_bps: FLOOR_BPS }),
    });
    expect(container.innerHTML).toBe("");
  });

  // The field-confusion guard, both directions. A healthy headline score with
  // thin evidence behind it is the exact case the floor is there to catch.
  it("judges the lower bound even when the headline score looks healthy", () => {
    const { container } = renderCell({
      rep: rep({ smoothed_bps: 9600, lower_bound_bps: FLOOR_BPS - 1 }),
    });
    expect(labels(container)).toContain("⚑ below floor · not eligible");
  });

  it("does not judge the headline score when the lower bound clears", () => {
    const { container } = renderCell({
      rep: rep({ smoothed_bps: 1000, lower_bound_bps: FLOOR_BPS + 1 }),
    });
    expect(container.innerHTML).toBe("");
  });

  /**
   * The agent's own bound is named so the verdict can be checked. The FLOOR's
   * value is deliberately absent: it is one network-wide number, stated once
   * above the table, and repeated down a column it becomes N chances to
   * disagree with itself after a deployment changes it — while quietly
   * reading as a property of the agent rather than of the marketplace.
   */
  it("names the agent and its own bound, and not the network floor", () => {
    const { container } = renderCell({
      agent: seeded({ name: "Kestrel" }),
      rep: rep({ lower_bound_bps: 4100 }),
    });
    const text = detail(container);
    expect(text).toContain("Kestrel");
    expect(text).toContain("2.05");
    expect(text).not.toContain("3.00");
    expect(text).toContain("the floor stated above this table");
  });

  // The product rule: below the floor is not routable, not delisted.
  it("says the agent keeps its listing and its history", () => {
    const { container } = renderCell({ rep: thinEvidence() });
    const text = detail(container);
    expect(text).toContain("keeps its listing and its history");
  });

  // Story 3.02's starvation backstop can re-admit a below-floor agent, so a
  // flat "never" is an overclaim rather than a simplification.
  it("qualifies ineligibility as the normal rule, not a permanent bar", () => {
    const { container } = renderCell({ rep: thinEvidence() });
    const text = detail(container);
    expect(text).toContain("not eligible for selection under the normal rule");
    expect(text).toContain("starvation backstop");
  });

  // The floor acts while the plan is built: the agent was passed over, not
  // asked and found wanting.
  it("blames thin evidence rather than the agent's work", () => {
    const { container } = renderCell({ rep: thinEvidence() });
    expect(detail(container)).toContain("thin evidence rather than bad work");
  });
});

describe("AgentStanding — degrees of not knowing", () => {
  // Null is "no score is known", not "assume the prior".
  it("renders no verdict for an agent missing from the reputation batch", () => {
    const { container } = renderCell({ rep: null, floorBps: FLOOR_BPS });
    expect(container.innerHTML).toBe("");
  });

  // The floor is configurable per deployment, so there is no constant to fall
  // back to — and a verdict against a number nobody sent is nobody's verdict.
  it("renders no verdict before the floor has loaded, however low the score", () => {
    const { container } = renderCell({
      rep: rep({ lower_bound_bps: 1 }),
      floorBps: null,
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing at all when neither number has arrived", () => {
    const { container } = renderCell({ rep: null, floorBps: null });
    expect(container.innerHTML).toBe("");
  });

  it("calls a verdict computed from a degraded read provisional", () => {
    const { container } = renderCell({
      rep: thinEvidence({ source: "prior", degraded: true }),
    });
    expect(labels(container)).toContain("⚠ provisional");
    expect(labels(container)).toContain("⚑ below floor · not eligible");
  });

  it("explains that a degraded score is a read we could not get, not a new agent", () => {
    const { container } = renderCell({
      rep: thinEvidence({ source: "prior", degraded: true }),
    });
    const text = detail(container);
    expect(text).toContain("The on-chain reputation read did not come back");
    expect(text).toContain("That is not a cold start");
  });

  // A pass computed from the prior is just as provisional as a loud verdict.
  it("qualifies a degraded read even where the agent clears the floor", () => {
    const { container } = renderCell({
      rep: rep({ source: "prior", degraded: true }),
    });
    expect(labels(container)).toEqual(["⚠ provisional"]);
  });

  // With no floor there is no comparison to call provisional, and the score
  // alone belongs to the reputation column rather than to this cell.
  it("stays silent about a degraded read when no floor was compared", () => {
    const { container } = renderCell({
      rep: rep({ source: "prior", degraded: true }),
      floorBps: null,
    });
    expect(container.innerHTML).toBe("");
  });

  // Both arrive as `source: "prior"`; only the flag separates them.
  it("does not call a genuine cold start provisional", () => {
    const { container } = renderCell({
      rep: thinEvidence({ source: "prior" }),
    });
    expect(labels(container)).toEqual(["⚑ below floor · not eligible"]);
  });
});

describe("AgentStanding — provenance", () => {
  it("marks an agent registered against the on-chain registry", () => {
    const { container } = renderCell({ agent: onchain() });
    expect(labels(container)).toContain("⬡ external");
  });

  it("leaves a seeded catalog agent unmarked", () => {
    const { container } = renderCell({ agent: seeded() });
    expect(labels(container)).not.toContain("⬡ external");
  });

  // `real` means "backed by a real Agno worker rather than a mock". It marks
  // roughly the opposite population, so a seeded agent that happens to be
  // real must not read as externally registered.
  it("never reads provenance from agent.real", () => {
    const { container } = renderCell({
      agent: seeded({ real: true, owner: null }),
    });
    expect(container.innerHTML).toBe("");
  });

  // The mirror of the same mistake: registry_sync sets `real` false on every
  // on-chain agent, so `real` false must not hide a genuine external listing.
  it("marks an on-chain agent that registry_sync flagged real: false", () => {
    const { container } = renderCell({ agent: onchain({ real: false }) });
    expect(labels(container)).toContain("⬡ external");
  });

  // A product rule forbids inferring provenance from the id format; every
  // agent in the catalog carries the `agt_` prefix regardless of origin.
  it("never reads provenance from the agt_ id prefix", () => {
    const { container } = renderCell({
      agent: seeded({ id: "agt_deadbeef", owner: null }),
    });
    expect(container.innerHTML).toBe("");
  });

  // `owner` only corroborates `source`, for a backend that predates the field.
  it("falls back to the owner when the response predates source", () => {
    const { container } = renderCell({
      agent: seeded({ source: undefined, owner: "GABC" }),
    });
    expect(labels(container)).toContain("⬡ external");
  });

  it("makes no provenance claim when neither source nor owner is present", () => {
    const { container } = renderCell({
      agent: seeded({ source: undefined, owner: null }),
    });
    expect(container.innerHTML).toBe("");
  });
});

describe("AgentStanding — endpoint binding", () => {
  it("flags an on-chain agent with no endpoint bound", () => {
    const { container } = renderCell({ agent: onchain({ bound: false }) });
    expect(labels(container)).toContain("⊘ not yet operational");
  });

  it("says nothing about an on-chain agent that is bound", () => {
    const { container } = renderCell({ agent: onchain({ bound: true }) });
    expect(labels(container)).toEqual(["⬡ external"]);
  });

  // Tri-state: null is "the question does not apply", not "unbound".
  it("treats a null bound as a question that does not apply", () => {
    const { container } = renderCell({ agent: onchain({ bound: null }) });
    expect(labels(container)).toEqual(["⬡ external"]);
  });

  it("treats an absent bound the same way as null", () => {
    const { container } = renderCell({ agent: onchain({ bound: undefined }) });
    expect(labels(container)).toEqual(["⬡ external"]);
  });

  // A seeded agent runs on a worker inside the backend and has no endpoint to
  // bind, so "unbound" there would report a defect that does not exist.
  it("never calls a seeded agent unbound", () => {
    const { container } = renderCell({ agent: seeded({ bound: false }) });
    expect(container.innerHTML).toBe("");
  });

  // Imported, not retyped: this is the fourth surface to state the claim.
  it("carries the shared UNBOUND_WARNING wording verbatim", () => {
    const { container } = renderCell({ agent: onchain({ bound: false }) });
    expect(detail(container)).toContain(UNBOUND_WARNING);
  });

  it("names both blockers when an agent is unbound and below the floor", () => {
    const { container } = renderCell({
      agent: onchain({ bound: false }),
      rep: thinEvidence(),
    });
    expect(labels(container)).toEqual([
      "⬡ external",
      "⊘ not yet operational",
      "⚑ below floor · not eligible",
    ]);
  });

  // The regression that turned CI red: on an operator's own row the page's
  // per-agent lookup already says "checking endpoint…", "unbound" or
  // "endpoint unknown", and renders the warning itself. A second, list-derived
  // marker put two answers to one question in the same row, and repeated the
  // warning where only one copy belongs.
  it("stays silent on binding when the page's lookup covers the row", () => {
    const { container } = renderCell({
      agent: onchain({ bound: false }),
      bindingLookup: true,
    });
    expect(labels(container)).toEqual(["⬡ external"]);
    expect(detail(container)).not.toContain(UNBOUND_WARNING);
  });
});

describe("AgentStanding — the row it lives in", () => {
  it("nests inside a table cell without a DOM-nesting warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <AgentStanding
                agent={onchain({ bound: false })}
                rep={thinEvidence({ degraded: true })}
                floorBps={FLOOR_BPS}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // The registry scrolls sideways inside a page that hides horizontal
  // overflow, so a cell that sizes to its content widens every row.
  it("caps its own width so it cannot widen the registry", () => {
    const { container } = renderCell({
      agent: onchain({ bound: false }),
      rep: thinEvidence({ degraded: true }),
    });
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.className).toContain("max-w-");
    expect(cell.className).toContain("flex-wrap");
  });

  // Meaning never by colour alone: every marker carries words, not just a
  // glyph and a tint, and every marker carries its reasoning for a reader who
  // cannot hover.
  it("pairs every marker with words and a long form", () => {
    const { container } = renderCell({
      agent: onchain({ bound: false }),
      rep: thinEvidence({ degraded: true }),
    });
    const marks = labels(container);
    expect(marks).toHaveLength(4);
    for (const mark of marks) expect(mark).toMatch(/[a-z]{3,}/);
    expect(container.querySelectorAll("[title]")).toHaveLength(4);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(4);
  });
});

describe("AgentStanding — wording", () => {
  /** Every state the cell can be in, so the sweep below is not a spot check. */
  const STATES: Partial<Parameters<typeof AgentStanding>[0]>[] = [
    { agent: seeded(), rep: rep() },
    { agent: seeded(), rep: thinEvidence() },
    { agent: seeded({ real: true }), rep: thinEvidence() },
    { agent: seeded(), rep: null },
    { agent: seeded(), rep: rep(), floorBps: null },
    { agent: onchain(), rep: rep() },
    { agent: onchain(), rep: thinEvidence() },
    { agent: onchain({ bound: false }), rep: rep() },
    { agent: onchain({ bound: false }), rep: thinEvidence() },
    { agent: onchain({ bound: null }), rep: null },
    {
      agent: onchain({ bound: false }),
      rep: thinEvidence({ source: "prior", degraded: true }),
    },
    { agent: onchain(), rep: rep({ source: "prior", degraded: true }) },
  ];

  // Four phrasings this cell must never reach for. Three of them imply the
  // agent lost its listing or its work; the fourth is an overclaim the
  // starvation backstop makes false.
  it("never says routed-never, delisted, removed or failed in any state", () => {
    for (const state of STATES) {
      const { container } = renderCell(state);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/will not be routed|delisted|removed|failed/i);
      cleanup();
    }
  });

  it("says not eligible wherever it renders a floor verdict", () => {
    for (const state of STATES) {
      const { container } = renderCell(state);
      const text = container.textContent ?? "";
      if (text.includes("below floor")) expect(text).toContain("not eligible");
      cleanup();
    }
  });
});
