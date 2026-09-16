// @vitest-environment jsdom
/**
 * Unit tests for RegistryStandingNotice.
 *
 * This notice is the only place the marketplace states the threshold that
 * every reputation chip on the page is judged against, so the tests are
 * written against the words it says rather than its markup: a refactor is
 * free, a changed claim is not.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ReputationBatch, ReputationInfo } from "@/lib/types";
import { RegistryStandingNotice } from "./registry-standing-notice";

afterEach(cleanup);

/** 2.75 on the 0–5 scale the notice prints. */
const FLOOR_BPS = 5500;
/** 3.50 — the Bayesian prior, which under the shipped config clears the floor. */
const PRIOR_BPS = 7000;

function rep(id: string, over: Partial<ReputationInfo> = {}): ReputationInfo {
  return {
    agent_id: id,
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

function batchOf(
  reps: ReputationInfo[],
  over: Partial<ReputationBatch> = {},
): ReputationBatch {
  return {
    reputations: Object.fromEntries(reps.map((r) => [r.agent_id, r])),
    floor_bps: FLOOR_BPS,
    prior_bps: PRIOR_BPS,
    ...over,
  };
}

/** Everything the notice rendered, markup included. */
function markup(): string {
  return document.body.firstElementChild?.outerHTML ?? "";
}

function text(): string {
  return document.body.textContent ?? "";
}

describe("RegistryStandingNotice — the floor", () => {
  it("states the floor once, on the 0–5 scale", () => {
    render(<RegistryStandingNotice batch={batchOf([rep("agt_a")])} />);
    expect(text()).toContain("floor 2.75");
    // Once. A threshold repeated with two roundings reads as two thresholds.
    expect(text().match(/2\.75/g)).toHaveLength(1);
  });

  it("moves with the configured floor rather than hard-coding one", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([rep("agt_a")], { floor_bps: 8000 })}
      />,
    );
    expect(text()).toContain("floor 4.00");
    expect(text()).not.toContain("2.75");
  });

  // `if (!floor)` is the obvious tightening here and it is a bug: a floor of
  // zero is a real configuration — the floor that admits everyone — and it is
  // the setting a buyer most needs told about.
  it("still renders a floor of zero", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([rep("agt_a")], { floor_bps: 0 })}
      />,
    );
    expect(text()).toContain("floor 0.00");
    expect(
      screen.getByRole("heading", { level: 2, name: "Selection floor" }),
    ).toBeTruthy();
  });

  it("says what the floor does and which number it is checked against", () => {
    render(<RegistryStandingNotice batch={batchOf([rep("agt_a")])} />);
    expect(text()).toContain(
      "decides which agents the orchestrator will consider",
    );
    expect(text()).toContain("reputation lower bound");
    expect(text()).toContain("never against the headline score");
  });

  // Naming the statistic tells a buyer nothing they can act on; the sentence
  // explaining what the lower bound is does.
  it("never names the statistic behind the lower bound", () => {
    render(<RegistryStandingNotice batch={batchOf([rep("agt_a")])} />);
    expect(markup().toLowerCase()).not.toContain("wilson");
  });

  // The page's own h1 is "Agent Registry", so this notice opens at level 2.
  it("opens at heading level 2, under the page heading", () => {
    render(<RegistryStandingNotice batch={batchOf([rep("agt_a")])} />);
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(
      screen.getByRole("heading", { level: 2, name: "Selection floor" }),
    ).toBeTruthy();
  });
});

describe("RegistryStandingNotice — nothing to say", () => {
  // The page has its own loading and error frames for the reputation read.
  it("renders nothing before the reputation read lands", () => {
    const { container } = render(<RegistryStandingNotice batch={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders no floor when the batch carried none", () => {
    const { container } = render(
      <RegistryStandingNotice
        batch={batchOf([rep("agt_a")], {
          floor_bps: undefined as unknown as number,
        })}
      />,
    );
    expect(container.textContent).not.toContain("floor");
  });
});
