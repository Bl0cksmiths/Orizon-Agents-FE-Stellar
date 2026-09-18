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

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
  // The rows hold their own placeholders while the read is on its way; a read
  // that failed is a different state, covered below.
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

/** A read that failed: the prior served in place of the chain. Its lower bound
 *  is the prior's, which under the shipped config clears the floor — which is
 *  why an outage stops the floor filtering. */
function failedRead(
  id: string,
  over: Partial<ReputationInfo> = {},
): ReputationInfo {
  return rep(id, {
    smoothed_bps: PRIOR_BPS,
    lower_bound_bps: 5677,
    avg_bps: PRIOR_BPS,
    count: 0,
    source: "prior",
    degraded: true,
    ...over,
  });
}

/** A genuine cold start: same `source`, same number, no failure. */
function coldStart(id: string): ReputationInfo {
  return rep(id, {
    smoothed_bps: PRIOR_BPS,
    lower_bound_bps: 5677,
    avg_bps: PRIOR_BPS,
    count: 0,
    source: "prior",
  });
}

/** The live region's words — the whole of what the notice says about reads. */
function status(): string {
  return screen.getByRole("status").textContent ?? "";
}

describe("RegistryStandingNotice — reads that failed", () => {
  it("says nothing about failed reads when every read landed", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([rep("agt_a"), rep("agt_b"), coldStart("agt_c")])}
      />,
    );
    expect(status()).toBe("");
    expect(text()).not.toContain("could not be read");
    expect(text()).not.toContain("estimate");
  });

  // A never-rated agent reports the same `source: "prior"` carrying the same
  // number as a failed read. Counting `source` would call it a failure.
  it("does not count a cold start as a failed read", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([coldStart("agt_a"), coldStart("agt_b")])}
      />,
    );
    expect(status()).toBe("");
  });

  it("counts the failures and leaves the rest as successful reads", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([
          failedRead("agt_a"),
          failedRead("agt_b"),
          rep("agt_c"),
          rep("agt_d"),
        ])}
      />,
    );
    expect(status()).toContain(
      "2 of 4 reputation scores on this page could not be read from the chain",
    );
    expect(status()).toContain("The other 2 scores were read successfully");
    // The page is still filtering on evidence, so it must not say otherwise.
    expect(status()).not.toContain("not sorting these agents on evidence");
  });

  it("reads correctly when exactly one read failed", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([failedRead("agt_a"), rep("agt_b"), rep("agt_c")])}
      />,
    );
    expect(status()).toContain("1 of 3 reputation scores");
    expect(status()).toContain("that score is a network-wide estimate");
    expect(status()).toContain("The other 2 scores were read successfully");
  });

  it("reads correctly when exactly one read succeeded", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([
          failedRead("agt_a"),
          failedRead("agt_b"),
          rep("agt_c"),
        ])}
      />,
    );
    expect(status()).toContain("those scores are a network-wide estimate");
    expect(status()).toContain("The other score was read successfully");
  });

  // The case AC-5 names, and materially different from a few stale rows: the
  // service fails open, so with nothing read the floor admits everyone.
  it("says the floor has stopped sorting on evidence when every read failed", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([failedRead("agt_a"), failedRead("agt_b")])}
      />,
    );
    expect(status()).toContain(
      "None of the 2 reputation scores on this page could be read from the chain",
    );
    expect(status()).toContain(
      "The floor is not sorting these agents on evidence right now",
    );
    expect(status()).toContain(
      "That estimate sits above the floor, so the floor is admitting every agent on this page",
    );
  });

  it("does not claim the floor admits everyone when the estimate is below it", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([
          failedRead("agt_a", { lower_bound_bps: 3200 }),
          failedRead("agt_b", { lower_bound_bps: 3200 }),
        ])}
      />,
    );
    expect(status()).toContain("not sorting these agents on evidence");
    expect(status()).not.toContain("admitting every agent");
  });

  it("counts a single agent whose read failed without saying none of one", () => {
    render(<RegistryStandingNotice batch={batchOf([failedRead("agt_a")])} />);
    expect(status()).toContain(
      "The one reputation score on this page could not be read from the chain",
    );
    expect(status()).not.toContain("None of the 1");
  });

  it("warns that a failed read looks like a new agent, in both failure states", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([failedRead("agt_a"), rep("agt_b")])}
      />,
    );
    expect(status()).toContain(
      "which is a reading of the chain rather than a failure of one",
    );

    cleanup();
    render(<RegistryStandingNotice batch={batchOf([failedRead("agt_a")])} />);
    expect(status()).toContain(
      "including any row that reads like a new agent with no ratings yet",
    );
  });

  it("gives none, some and all three distinct messages", () => {
    render(<RegistryStandingNotice batch={batchOf([rep("a"), rep("b")])} />);
    const none = status();
    cleanup();
    render(
      <RegistryStandingNotice batch={batchOf([failedRead("a"), rep("b")])} />,
    );
    const some = status();
    cleanup();
    render(
      <RegistryStandingNotice
        batch={batchOf([failedRead("a"), failedRead("b")])}
      />,
    );
    const all = status();

    expect(new Set([none, some, all]).size).toBe(3);
    expect(none).toBe("");
    expect(some).not.toBe("");
    expect(all).not.toBe("");
  });

  // The region is mounted empty and stays mounted, so the announcement fires
  // when the words arrive rather than when the element does.
  it("keeps the live region mounted from the first batch that lands", () => {
    render(<RegistryStandingNotice batch={batchOf([rep("agt_a")])} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("RegistryStandingNotice — the claims it must never make", () => {
  const states: { name: string; batch: ReputationBatch }[] = [
    { name: "none failed", batch: batchOf([rep("a"), rep("b")]) },
    { name: "cold starts", batch: batchOf([coldStart("a"), rep("b")]) },
    { name: "some failed", batch: batchOf([failedRead("a"), rep("b")]) },
    {
      name: "all failed",
      batch: batchOf([failedRead("a"), failedRead("b")]),
    },
    { name: "one agent, failed", batch: batchOf([failedRead("a")]) },
    {
      name: "all failed, below floor",
      batch: batchOf([failedRead("a", { lower_bound_bps: 3200 })]),
    },
    { name: "zero floor", batch: batchOf([failedRead("a")], { floor_bps: 0 }) },
    { name: "no agents", batch: batchOf([]) },
  ];

  // `degraded` is an internal field name, and in this product it already means
  // "re-admitted below the floor by the starvation backstop" — a completely
  // different fact. Asserted against the markup, not the text, so a stray
  // aria-label or class name trips it too.
  it.each(states)(
    "never prints the internal field name ($name)",
    ({ batch }) => {
      render(<RegistryStandingNotice batch={batch} />);
      expect(markup().toLowerCase()).not.toContain("degraded");
      expect(markup().toLowerCase()).not.toContain("wilson");
    },
  );

  // The read failed on our side. Blaming the agent turns our outage into an
  // accusation about someone's production service.
  it.each(states)("never blames the agents ($name)", ({ batch }) => {
    render(<RegistryStandingNotice batch={batch} />);
    expect(text()).not.toMatch(
      /agents? (failed|is down|are down|did not respond|is offline|are offline|is unreliable)/i,
    );
  });

  // Nobody can say when an RPC outage ends, so nothing here may imply it will.
  it.each(states)(
    "never promises recovery or tells anyone to wait ($name)",
    ({ batch }) => {
      render(<RegistryStandingNotice batch={batch} />);
      expect(text()).not.toMatch(
        /try again|check back|shortly|in a moment|soon|will (recover|be back|resolve|return)|please wait|reload|refresh|temporar/i,
      );
    },
  );

  // Eligibility is never selection: clearing the floor puts an agent in the
  // candidate pool, and the planner still chooses per request.
  it.each(states)("never promises routing ($name)", ({ batch }) => {
    render(<RegistryStandingNotice batch={batch} />);
    expect(text()).not.toMatch(/being routed|will be routed|is routed to/i);
  });
});

describe("RegistryStandingNotice — a failed request for the batch", () => {
  const ERROR = "GET /stellar/reputation → 503 — service unavailable";

  // The regression: a failed batch used to render nothing at all here, while
  // every chip below claimed its agent had no ratings yet.
  it("announces a read that never landed, as an alert", () => {
    render(<RegistryStandingNotice batch={null} readError={ERROR} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("reputation unavailable");
    expect(alert.textContent).toContain(
      "shows no score, selection floor or standing verdict rather than guessed ones",
    );
    expect(alert.textContent).toContain(ERROR);
  });

  // No batch means no floor was sent, and a floor printed anyway would be the
  // one number on the page nobody computed.
  it("prints no floor when no batch ever landed", () => {
    render(<RegistryStandingNotice batch={null} readError={ERROR} />);
    expect(text()).not.toMatch(/\d\.\d\d/);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("offers a retry that re-runs the request, and says when one is running", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <RegistryStandingNotice
        batch={null}
        readError={ERROR}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <RegistryStandingNotice
        batch={null}
        readError={ERROR}
        onRetry={onRetry}
        retrying
      />,
    );
    const busy = screen.getByRole("button", { name: "retrying…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });

  // A batch kept through a failed refresh is still a real reading, so it
  // stays on screen — dated, and with the failure said above it.
  it("keeps an earlier batch on screen and says it is the last good read", () => {
    const lastReadAt = Date.UTC(2026, 8, 18, 9, 30);
    render(
      <RegistryStandingNotice
        batch={batchOf([rep("agt_a")])}
        readError={ERROR}
        lastReadAt={lastReadAt}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "the scores and selection floor on this page are from the last one that succeeded",
    );
    expect(text()).toContain("floor 2.75");
    const stale = screen
      .getAllByRole("status")
      .map((el) => el.textContent ?? "")
      .find((t) => t.includes("Stale reputation scores and selection floor"));
    expect(stale).toContain(new Date(lastReadAt).toLocaleTimeString());
  });

  it("raises nothing about the request while it is healthy", () => {
    render(
      <RegistryStandingNotice
        batch={batchOf([rep("agt_a")])}
        lastReadAt={Date.now()}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(text()).not.toMatch(/stale/i);
  });
});
