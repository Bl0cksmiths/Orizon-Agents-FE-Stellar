// @vitest-environment jsdom
/**
 * Unit tests for ReputationCell.
 *
 * The cell's whole job is to put the right number in the reputation column or
 * no number at all, so the assertions read the words and figures it renders —
 * the chip's accessible label included, because that is where the claim about
 * an agent's history lives.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { ReputationInfo } from "@/lib/types";
import { ReputationCell } from "./reputation-cell";

afterEach(cleanup);

const FLOOR_BPS = 5500;

/** An agent with settled, on-chain ratings. */
function onchainRep(over: Partial<ReputationInfo> = {}): ReputationInfo {
  return {
    agent_id: "agt_02k2",
    smoothed_bps: 9200,
    lower_bound_bps: 8410,
    avg_bps: 9350,
    count: 128,
    weight: 6.912,
    disputed: 0,
    dispute_rate_bps: 0,
    source: "onchain",
    degraded: false,
    ...over,
  };
}

/** The live prior, as the batch serves it for an agent nobody has rated:
 *  7000 bps is 3.50 on the 0–5 scale. */
function priorRep(over: Partial<ReputationInfo> = {}): ReputationInfo {
  return onchainRep({
    smoothed_bps: 7000,
    lower_bound_bps: 5677,
    avg_bps: 7000,
    count: 0,
    weight: 0,
    source: "prior",
    ...over,
  });
}

function renderCell(props: Partial<Parameters<typeof ReputationCell>[0]> = {}) {
  return render(
    <ReputationCell
      agentName="design.figma"
      rep={onchainRep()}
      floorBps={FLOOR_BPS}
      read="loaded"
      {...props}
    />,
  );
}

/** Everything the cell says, to a sighted reader or a screen reader. */
function said(container: HTMLElement): string {
  const labels = Array.from(container.querySelectorAll("[aria-label]")).map(
    (el) => el.getAttribute("aria-label") ?? "",
  );
  return [container.textContent ?? "", ...labels].join(" ");
}

describe("ReputationCell — a live entry", () => {
  it("shows an on-chain score as the batch sent it", () => {
    const { container } = renderCell();
    expect(container.textContent).toContain("4.60");
    expect(said(container)).toContain("on-chain reputation 4.60");
  });

  // The regression this cell exists for: the prior chip used to print the
  // catalog's seeded rating (design.figma's 4.87) while the plan card printed
  // the 3.50 prior the agent is actually routed on.
  it("shows the live prior for an unrated agent, never a catalog rating", () => {
    const { container } = renderCell({ rep: priorRep() });
    expect(container.textContent).toContain("3.50");
    expect(container.textContent).not.toContain("4.87");
    expect(said(container)).toContain("no on-chain ratings yet");
  });

  // A prior served because the ledger read failed is not a cold start, and
  // the chip must not call it one.
  it("words a prior served for a failed read as exactly that", () => {
    const { container } = renderCell({ rep: priorRep({ degraded: true }) });
    expect(said(container)).toContain("the on-chain read did not come back");
    expect(said(container)).not.toContain("no on-chain ratings yet");
  });

  it("judges the floor on the lower bound the entry carries", () => {
    const { container } = renderCell({
      rep: onchainRep({ smoothed_bps: 5992, lower_bound_bps: 5131 }),
    });
    expect(said(container)).toContain("below the 2.75 network floor");
  });
});

describe("ReputationCell — no entry", () => {
  const NO_NUMBER = /\d\.\d\d/;

  it("says a failed read is unavailable, with no score and no cold start", () => {
    const { container } = renderCell({ rep: null, read: "failed" });
    const text = said(container);
    expect(container.textContent).toContain("unavailable");
    expect(text).toContain("the reputation read failed");
    expect(text).toContain("design.figma");
    expect(text).not.toMatch(NO_NUMBER);
    expect(text).not.toMatch(/no on-chain ratings|prior estimate/i);
  });

  it("says a landed read with no entry has no score, and invents none", () => {
    const { container } = renderCell({ rep: null, read: "loaded" });
    const text = said(container);
    expect(container.textContent).toContain("no score");
    expect(text).toContain("carried no entry");
    expect(text).not.toMatch(NO_NUMBER);
    expect(text).not.toMatch(/no on-chain ratings|prior estimate/i);
  });

  it("holds a placeholder while the read is on its way", () => {
    const { container } = renderCell({ rep: null, read: "loading" });
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
    expect(container.textContent).toContain(
      "Loading the reputation score for design.figma.",
    );
    expect(container.textContent).not.toMatch(NO_NUMBER);
  });

  // An entry wins over the read state: a batch kept on screen through a
  // failed refresh is still a reading, and the page passes it as such.
  it("renders an entry it was given whatever the read state says", () => {
    const { container } = renderCell({ rep: onchainRep(), read: "failed" });
    expect(container.textContent).toContain("4.60");
    expect(container.textContent).not.toContain("unavailable");
  });
});
