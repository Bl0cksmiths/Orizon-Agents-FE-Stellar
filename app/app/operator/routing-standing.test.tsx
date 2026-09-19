// @vitest-environment jsdom
/**
 * Unit tests for RoutingStanding.
 *
 * This panel is the only place an operator is told why their agent is getting
 * no work, so the tests are written against the words it says rather than its
 * markup: a refactor is free, a changed claim is not.
 *
 * Three of these assertions exist because the claim they guard has been made
 * wrongly somewhere in this codebase before, and each one is cheap to
 * reintroduce by accident:
 *
 *   - `checking` and `error` must never read as unbound. A lookup we have not
 *     heard back from is not evidence about someone's production service.
 *   - Eligibility is never "being routed". Clearing both gates puts the agent
 *     in the candidate pool; the planner still picks per request.
 *   - A degraded read and a cold start both arrive as `source: "prior"` and are
 *     indistinguishable in the payload apart from one optional flag. One of
 *     them means we could not read the chain, so they must never render alike.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { UNBOUND_WARNING } from "@/lib/binding-status";
import type { ReputationInfo } from "@/lib/types";
import { RoutingStanding } from "./routing-standing";

afterEach(cleanup);

/** 3.00 on the 0–5 scale the panel prints. */
const FLOOR_BPS = 6000;
/** 2.50 — a prior BELOW this file's floor, which production's is NOT: the
 *  shipped prior yields a 5677 lower bound against a 5500 floor. The numbers
 *  here are deliberately unlike production so the component is tested on its
 *  logic rather than on one lucky configuration — but nothing in this file may
 *  be read as a claim about what production does. */
const PRIOR_BPS = 5000;

/** A rated agent comfortably clear of the floor unless a test says otherwise. */
function rep(over: Partial<ReputationInfo> = {}): ReputationInfo {
  return {
    agent_id: "agt_test",
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

/** An unrated agent carrying a prior that does NOT clear this file's floor.
 *  A hostile configuration, not the shipped one — production's prior clears
 *  its floor by 177 bps. This fixture exists to exercise the below-floor
 *  branch; `never tells a newcomer their agent is below the floor by default`
 *  covers the real cold-start position. */
function priorRep(over: Partial<ReputationInfo> = {}): ReputationInfo {
  return rep({
    smoothed_bps: PRIOR_BPS,
    lower_bound_bps: 3200,
    avg_bps: PRIOR_BPS,
    count: 0,
    source: "prior",
    ...over,
  });
}

function renderStanding(
  props: Partial<Parameters<typeof RoutingStanding>[0]> = {},
) {
  return render(
    <RoutingStanding
      agentId="agt_11c0"
      status="online"
      bindingState="bound"
      reputation={rep()}
      floorBps={FLOOR_BPS}
      priorBps={PRIOR_BPS}
      {...props}
    />,
  );
}

/** The single-sentence verdict, which is the live region. */
function verdict(): string {
  return screen.getByRole("status").textContent ?? "";
}

describe("RoutingStanding — the verdict", () => {
  it("calls a bound agent over the floor eligible, without promising selection", () => {
    renderStanding();
    expect(verdict()).toContain("Eligible — the planner selects per request.");
    // The distinction the whole panel turns on.
    expect(document.body.textContent).toContain("Eligibility is not selection");
  });

  it("treats the floor as inclusive, matching the backend's >= rule", () => {
    renderStanding({ reputation: rep({ lower_bound_bps: FLOOR_BPS }) });
    expect(verdict()).toContain("Eligible");
  });

  it("names the floor when a bound agent sits below it", () => {
    renderStanding({ reputation: rep({ lower_bound_bps: 4000 }) });
    expect(verdict()).toBe(
      "✕Not eligible — its reputation lower bound is below the network floor.",
    );
  });

  it("names the binding when an agent has no endpoint", () => {
    renderStanding({ bindingState: "unbound" });
    expect(verdict()).toBe("✕Not eligible — no endpoint is bound.");
  });

  it("names both gates when both fail, so fixing one is not a surprise", () => {
    renderStanding({
      bindingState: "unbound",
      reputation: rep({ lower_bound_bps: 4000 }),
    });
    expect(verdict()).toContain("no endpoint is bound");
    expect(verdict()).toContain(
      "its reputation lower bound is below the network floor",
    );
  });

  // A confirmed failure settles the verdict whatever the other gate is doing:
  // both gates have to hold, so one of them failing is already the answer.
  it("still returns a verdict when one gate failed and the other is unread", () => {
    renderStanding({ bindingState: "checking", reputation: null });
    expect(verdict()).toContain("Standing not confirmed");

    cleanup();
    renderStanding({
      bindingState: "checking",
      reputation: rep({ lower_bound_bps: 1000 }),
    });
    expect(verdict()).toContain("Not eligible");
  });
});

describe("RoutingStanding — gate 1, the endpoint", () => {
  it("carries the shared unbound wording rather than a local paraphrase", () => {
    renderStanding({ bindingState: "unbound" });
    expect(document.body.textContent).toContain(UNBOUND_WARNING);
  });

  it("offers the bind route with the agent id already in it", () => {
    renderStanding({ bindingState: "unbound", agentId: "agt 11c0" });
    const link = screen.getByRole("link", { name: /bind agt 11c0/i });
    expect(link.getAttribute("href")).toBe("/app/bind?agent=agt%2011c0");
  });

  // The false accusation this component exists partly to prevent.
  it("never reads as unbound while the lookup is in flight", () => {
    renderStanding({ bindingState: "checking" });
    const text = document.body.textContent ?? "";
    expect(verdict()).toContain(
      "Standing not confirmed — the endpoint lookup has not come back yet.",
    );
    expect(text).not.toContain(UNBOUND_WARNING);
    expect(text).not.toContain("Not eligible");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("blames the failed lookup, not the agent, when the read errored", () => {
    renderStanding({ bindingState: "error" });
    const text = document.body.textContent ?? "";
    expect(verdict()).toContain(
      "Standing not confirmed — the endpoint lookup failed.",
    );
    expect(text).toContain("not a claim that the endpoint is missing");
    expect(text).not.toContain(UNBOUND_WARNING);
    expect(text).not.toContain("Not eligible");
  });

  it("confirms the binding when it is bound", () => {
    renderStanding();
    expect(document.body.textContent).toContain("An endpoint is bound");
  });

  // Null is "no claim applies" — a seeded catalog agent, someone else's agent,
  // or one past the hook's cap. A greyed-out "not applicable" row would still
  // be a claim, so the section is absent entirely.
  it("renders no binding verdict at all when no claim applies", () => {
    renderStanding({ bindingState: null });
    expect(
      screen.queryByRole("heading", { name: /endpoint binding/i }),
    ).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(UNBOUND_WARNING);
    expect(text).not.toContain("An endpoint is bound");
    // The floor gate still decides on its own.
    expect(verdict()).toContain("Eligible");
  });
});

describe("RoutingStanding — gate 2, the floor", () => {
  it("compares the lower bound against the floor, both spelled out", () => {
    renderStanding({
      reputation: rep({ smoothed_bps: 9600, lower_bound_bps: 8200 }),
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Lower bound 4.10 clears the 3.00 floor.");
    expect(text).toContain("4.80"); // the headline, shown but not the test
  });

  // The single most misunderstood rule in the system: a healthy headline over
  // the floor, a lower bound under it, and the agent gets nothing.
  it("rules against a healthy headline score whose lower bound is short", () => {
    renderStanding({
      reputation: rep({ smoothed_bps: 9600, lower_bound_bps: 5000, count: 2 }),
    });
    const text = document.body.textContent ?? "";
    expect(verdict()).toContain("Not eligible");
    expect(text).toContain("Lower bound 2.50 is below the 3.00 floor.");
    expect(text).toContain(
      "The floor is checked against the lower bound, never the headline 4.80.",
    );
  });

  it("says how a below-floor agent recovers, and that it is not excluded", () => {
    renderStanding({ reputation: rep({ lower_bound_bps: 4000 }) });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ratings from completed work raise the lower bound");
    expect(text).toContain("not permanently excluded");
    expect(text).toContain("starvation backstop");
  });

  it("keeps the recovery advice off a passing agent", () => {
    renderStanding();
    expect(document.body.textContent).not.toContain("starvation backstop");
  });

  it("delegates the score itself to the shared badge", () => {
    renderStanding({ reputation: rep({ count: 24 }) });
    expect(
      screen.getByLabelText(/on-chain reputation 4\.50 from 24 rated jobs/i),
    ).toBeTruthy();
  });
});

describe("RoutingStanding — the prior, and the prior served for a failure", () => {
  it("reads a cold start as honest rather than as a fault", () => {
    renderStanding({ reputation: priorRep() });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Never rated on-chain");
    expect(text).toContain("the Bayesian prior of 2.50");
    expect(text).toContain("until completed work replaces it");
    expect(text).not.toContain("not a reading of the chain");
  });

  /**
   * The shipped arithmetic, and the reason this assertion exists.
   *
   * With the production config a never-rated agent scores a lower bound of
   * 5677 against a 5500 floor — it clears by 177 bps and is routable on the
   * day it is registered. This panel previously told operators the opposite
   * ("a brand-new agent's lower bound sits below the floor"), which is both
   * false and a direct contradiction of the premise permissionless
   * registration rests on. Nothing here may imply a new agent is excluded.
   */
  it("never tells a newcomer their agent is below the floor by default", () => {
    const { container } = renderStanding({
      // The real cold-start position: prior source, no ratings, and a lower
      // bound that clears the floor.
      reputation: priorRep({ lower_bound_bps: FLOOR_BPS + 177 }),
      floorBps: FLOOR_BPS,
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Eligible");
    expect(text).not.toMatch(/Not eligible/);
    expect(text).not.toMatch(/sits below the floor/);
    expect(text).toContain("routable from the day it is registered");
  });

  // Same payload apart from one optional flag, and one of them means the chain
  // read failed. They must not look alike.
  it("separates a degraded read from a cold start", () => {
    renderStanding({ reputation: priorRep({ degraded: true }) });
    const text = document.body.textContent ?? "";
    expect(text).toContain("This score is not a reading of the chain");
    expect(text).toContain("the reputation service fails open");
    expect(text).toContain("Treat the result above as provisional");
    expect(text).not.toContain("Never rated on-chain");
  });

  // The chip and the paragraph under it have to agree. The chip used to be
  // rendered without the flag, so it announced "no on-chain ratings yet" —
  // a cold start — right above a paragraph saying the read had failed.
  it("words the chip for a failed read, not a cold start", () => {
    const { container } = renderStanding({
      reputation: priorRep({ degraded: true }),
    });
    const chip = container.querySelector("[aria-label^='prior estimate']");
    const label = chip?.getAttribute("aria-label") ?? "";
    expect(label).toContain("the on-chain read did not come back");
    expect(label).not.toContain("no on-chain ratings yet");
  });

  it("keeps the cold-start wording on the chip for a genuine newcomer", () => {
    const { container } = renderStanding({ reputation: priorRep() });
    const chip = container.querySelector("[aria-label^='prior estimate']");
    expect(chip?.getAttribute("aria-label")).toContain(
      "no on-chain ratings yet",
    );
  });

  it("leaves a rated agent with neither notice", () => {
    renderStanding();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Never rated on-chain");
    expect(text).not.toContain("not a reading of the chain");
  });
});

describe("RoutingStanding — no score at all", () => {
  // Defaulting to the prior here would invent a number and then rule on it.
  it("says the score is unknown instead of assuming the prior", () => {
    renderStanding({ reputation: null });
    const text = document.body.textContent ?? "";
    expect(verdict()).toContain(
      "Standing not confirmed — no reputation score is known for this agent.",
    );
    expect(text).toContain("assuming the prior would be inventing a number");
    expect(text).not.toContain("Not eligible");
    // The floor is still named, because the operator asked what it is.
    expect(text).toContain("3.00 floor");
  });
});

describe("RoutingStanding — a delisted agent", () => {
  // The audit's case: bound, well above the floor, delisted — and the panel
  // called it eligible while the backend refused to route to it.
  it("never calls a delisted agent eligible, however good its gates", () => {
    renderStanding({ status: "offline" });
    expect(verdict()).toBe(
      "‖Delisted — you withdrew this agent, so the orchestrator will not select it until you relist it.",
    );
    expect(verdict()).not.toContain("Eligible");
  });

  // The rule is negative: only "offline" is withdrawn. "idle" is an agent
  // with nothing in flight, and it is as eligible as an online one.
  it("treats an idle agent as listed", () => {
    renderStanding({ status: "idle" });
    expect(verdict()).toContain("Eligible — the planner selects per request.");
  });

  // The operator withdrew it; nothing failed. The panel keeps magenta for a
  // blocked gate, and a delisting is not one.
  it("says it is the operator's choice, calmly", () => {
    renderStanding({ status: "offline" });
    const text = document.body.textContent ?? "";
    expect(text).toContain("This is your own setting, not a fault.");
    expect(text).toContain("the starvation backstop never re-admits");
    expect(screen.getByRole("status").className).not.toContain("magenta");
  });

  // Delisting outranks a failed gate too: the operator's own decision is the
  // reason, and naming a gate instead would send them to fix the wrong thing.
  it("outranks a failed gate", () => {
    renderStanding({
      status: "offline",
      bindingState: "unbound",
      reputation: rep({ lower_bound_bps: 1000 }),
    });
    expect(verdict()).toContain("Delisted");
    expect(verdict()).not.toContain("Not eligible");
  });

  // The shared unbound warning says the agent "is listed". On a delisted
  // agent the gate still reports the missing endpoint — it matters for coming
  // back — but in words that are true of it.
  it("keeps the unbound gate honest about the listing", () => {
    renderStanding({ status: "offline", bindingState: "unbound" });
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(UNBOUND_WARNING);
    expect(text).toContain("Bind one before you relist this agent");
    expect(
      screen.getByRole("link", { name: "bind agt_11c0" }).getAttribute("href"),
    ).toBe("/app/bind?agent=agt_11c0");
  });

  // The backstop re-admits below-floor candidates, never withdrawn ones, so
  // the floor gate's sentence about it is scoped to a relisted agent here.
  it("does not promise the backstop to a delisted agent", () => {
    renderStanding({
      status: "offline",
      reputation: rep({ lower_bound_bps: 1000 }),
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "Once it is relisted, below the floor is not eligible under the normal rule",
    );
    const paragraphs = Array.from(document.querySelectorAll("p")).map(
      (p) => p.textContent ?? "",
    );
    expect(paragraphs.some((p) => p.startsWith("Below the floor"))).toBe(false);
  });
});

describe("RoutingStanding — the claims it must never make", () => {
  const states = [
    { name: "bound, clear", props: {} },
    {
      name: "bound, below floor",
      props: { reputation: rep({ lower_bound_bps: 1000 }) },
    },
    { name: "unbound", props: { bindingState: "unbound" as const } },
    { name: "checking", props: { bindingState: "checking" as const } },
    { name: "error", props: { bindingState: "error" as const } },
    { name: "no claim", props: { bindingState: null } },
    { name: "prior", props: { reputation: priorRep() } },
    { name: "degraded", props: { reputation: priorRep({ degraded: true }) } },
    { name: "no score", props: { reputation: null } },
    {
      name: "no batch",
      props: { reputation: null, floorBps: null, priorBps: null },
    },
  ];

  // "being routed" is the conflation of eligibility with selection. Every
  // state here is a LISTED agent, so delisting has no place in its panel: the
  // word belongs to the withdrawn verdict alone, which the orchestrator now
  // enforces on every routing path.
  it.each(states)(
    "never promises routing or repeats the delisting claim ($name)",
    ({ props }) => {
      const { container } = renderStanding(props);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/being routed|will be routed|is routed to/i);
      expect(text).not.toMatch(/delist/i);
    },
  );

  // The reputation batch carries the floor as well as the scores, so an
  // unreachable reputation service leaves us with no line for the agent to
  // clear. Defaulting the floor to zero would pass every agent; defaulting it
  // high would fail every agent. Both are verdicts we have no basis for.
  it("does not judge the floor when the floor itself is unknown", () => {
    const { container } = renderStanding({
      reputation: null,
      floorBps: null,
      priorBps: null,
    });
    const text = container.textContent ?? "";
    expect(text).toMatch(/Standing not confirmed/);
    expect(text).not.toMatch(/Not eligible/);
    expect(text).toMatch(/whether it clears the network floor/);
    // No fabricated figure anywhere: 0.00 is what a `?? 0` default prints.
    expect(text).not.toMatch(/0\.00 floor/);
  });

  it("keeps a known score visible when only the floor is missing", () => {
    const { container } = renderStanding({
      reputation: rep(),
      floorBps: null,
      priorBps: null,
    });
    const text = container.textContent ?? "";
    expect(text).toMatch(/the network floor is not known/i);
    expect(text).toMatch(/The score above is real/);
    expect(text).not.toMatch(/Not eligible/);
  });

  it.each(states)("keeps the heading order intact ($name)", ({ props }) => {
    renderStanding(props);
    expect(
      screen.getByRole("heading", { level: 2, name: "Routing standing" }),
    ).toBeTruthy();
    // Gates sit under it, never at the same level.
    for (const h of screen.queryAllByRole("heading", { level: 3 })) {
      expect(h.textContent).toMatch(/^Gate [12] · /);
    }
  });
});
