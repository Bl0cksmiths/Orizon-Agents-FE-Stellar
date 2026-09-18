// @vitest-environment jsdom
/**
 * Unit tests for RepLeaderboard's reputation chips.
 *
 * Narrow on purpose: these pin the one claim each chip makes about an agent's
 * history, which is where a failed read has twice been reported as a cold
 * start — "no on-chain ratings yet" about an agent whose record we merely
 * could not reach.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { Agent, ReputationBatch, ReputationInfo } from "@/lib/types";
import { RepLeaderboard } from "./rep-leaderboard";

afterEach(cleanup);

const COLD_START = "no on-chain ratings yet";
const FAILED_READ = "the on-chain read did not come back";

function agent(id: string, over: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    skills: ["research"],
    price: 0.02,
    rep: 4.87,
    status: "online",
    runs: 12,
    ...over,
  };
}

function prior(id: string, over: Partial<ReputationInfo> = {}): ReputationInfo {
  return {
    agent_id: id,
    smoothed_bps: 7000,
    lower_bound_bps: 5677,
    avg_bps: 7000,
    count: 0,
    weight: 0,
    disputed: 0,
    dispute_rate_bps: 0,
    source: "prior",
    degraded: false,
    ...over,
  };
}

function batchOf(reps: ReputationInfo[]): ReputationBatch {
  return {
    reputations: Object.fromEntries(reps.map((r) => [r.agent_id, r])),
    floor_bps: 5500,
    prior_bps: 7000,
  };
}

/** The chip's full claim, keyed by the agent id its row carries. */
function chipFor(container: HTMLElement, id: string): string {
  const row = Array.from(container.querySelectorAll("tr")).find((tr) =>
    tr.textContent?.includes(id),
  );
  const chip = row?.querySelector(
    "[aria-label*='estimate'], [aria-label*='reputation']",
  );
  return chip?.getAttribute("aria-label") ?? "";
}

function renderBoard(
  props: Partial<Parameters<typeof RepLeaderboard>[0]> = {},
) {
  return render(
    <RepLeaderboard
      agents={[agent("fresh_bot"), agent("unread_bot")]}
      batch={batchOf([
        prior("fresh_bot"),
        prior("unread_bot", { degraded: true }),
      ])}
      loading={false}
      agentsError={null}
      batchError={null}
      {...props}
    />,
  );
}

describe("RepLeaderboard — what a prior chip claims", () => {
  it("calls a genuine newcomer a cold start, at the live prior", () => {
    const { container } = renderBoard();
    const chip = chipFor(container, "fresh_bot");
    expect(chip).toContain("prior estimate 3.50");
    expect(chip).toContain(COLD_START);
  });

  // The backend served the prior because the ledger read failed. The chip
  // used to be rebuilt from scratch without the flag, and so said the agent
  // had no ratings — a claim about its record nobody had read.
  it("never calls a prior served for a failed read a cold start", () => {
    const { container } = renderBoard();
    const chip = chipFor(container, "unread_bot");
    expect(chip).toContain(FAILED_READ);
    expect(chip).not.toContain(COLD_START);
  });
});
