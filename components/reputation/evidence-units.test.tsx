// @vitest-environment jsdom
/**
 * Evidence weight is each rating's step price, in stroops of the escrow's
 * asset — native XLM on testnet — so every live weight on /app/reputation is
 * labelled with the network's asset: XLM there, no unit while it is unknown,
 * and never the "USDC" in a params field's name (friction F-022).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { ReputationBatch, ReputationParams } from "@/lib/types";
import { OnchainDetails } from "./onchain-details";
import { RepLeaderboard } from "./rep-leaderboard";
import { RepStats } from "./rep-stats";
import { ScoreCalculator } from "./score-calculator";

afterEach(cleanup);

const BATCH: ReputationBatch = {
  reputations: {
    rated_bot: {
      agent_id: "rated_bot",
      smoothed_bps: 7400,
      lower_bound_bps: 6200,
      avg_bps: 7800,
      count: 6,
      weight: 12_000_000,
      disputed: 0,
      dispute_rate_bps: 0,
      source: "onchain",
      degraded: false,
    },
  },
  floor_bps: 5500,
  prior_bps: 7000,
};

const PARAMS: ReputationParams = {
  enabled: true,
  prior_bps: 7000,
  prior_weight_usdc: 12,
  floor_bps: 5500,
  max_rating_weight_usdc: 100,
  read_ttl_seconds: 15,
  wilson_z: 1,
  epoch_seconds: 604_800,
  decay_bps_per_epoch: 9_250,
  max_decay_epochs: 96,
  contract_id: "CDCSOBEVZUPQZV5GV4D6KYHZCLNGW2KXY74RUHSZ3EZUXF34DPW422ZT",
  network: "testnet",
};

/** Every live weight the page prints, rendered under one asset. */
function page(asset: string | null): string {
  const { container } = render(
    <>
      <RepStats batch={BATCH} loading={false} error={null} asset={asset} />
      <RepLeaderboard
        agents={[
          {
            id: "rated_bot",
            name: "rated_bot",
            skills: ["research"],
            price: 0.02,
            rep: 3.7,
            status: "online",
            runs: 6,
          },
        ]}
        batch={BATCH}
        loading={false}
        agentsError={null}
        batchError={null}
        asset={asset}
      />
      <ScoreCalculator params={PARAMS} asset={asset} />
      <OnchainDetails params={PARAMS} asset={asset} />
    </>,
  );
  return container.textContent ?? "";
}

describe("reputation evidence weights", () => {
  it("are labelled XLM on testnet", () => {
    const text = page("native");
    expect(text).toContain("1.20XLM"); // the tile, value and unit split
    expect(text).toContain("1.20 XLM"); // the leaderboard's evidence column
    expect(text).toContain("25 XLM"); // the calculator's weight
    expect(text).toContain("12 XLM of mass");
    expect(text).toContain("100 XLM"); // the per-rating weight cap
    expect(text).not.toMatch(/USDC/);
  });

  it("carry no unit, and never USDC, while the asset is unknown", () => {
    const text = page(null);
    expect(text).toContain("12 units of mass");
    expect(text).not.toMatch(/USDC|XLM/);
  });
});
