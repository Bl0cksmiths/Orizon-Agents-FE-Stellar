// @vitest-environment jsdom
/**
 * The marketing reputation section's "whale cap per rating" tile.
 *
 * It said "100 USDC": the backend's absolute ceiling alone. The effective cap
 * is `reputation_svc.max_rating_weight_usdc()` = min(100, 1.0 × the prior's
 * 12) = 12, so one rating weighs at most what the prior does. Only the number
 * was false. The unit stays the marketing copy's own, because the demo's S11
 * narration discloses that the marketing copy names USDC.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DEFAULT_REP_PARAMS } from "@/lib/reputation-math";
import { Reputation } from "./reputation";

afterEach(cleanup);

/** The tile's value, found from its label. */
function whaleCap(): string {
  render(<Reputation />);
  const label = screen.getByText("whale cap per rating");
  const tile = label.parentElement;
  if (!tile) throw new Error("the whale-cap label has no tile");
  return (tile.textContent ?? "").replace(label.textContent ?? "", "").trim();
}

describe("the marketing whale-cap tile", () => {
  it("states the prior's weight, 12, as the cap", () => {
    expect(DEFAULT_REP_PARAMS.prior_weight_usdc).toBe(12);
    expect(whaleCap()).toMatch(/^12 USDC/);
  });

  it("no longer states the 100 ceiling", () => {
    expect(whaleCap()).not.toContain("100");
  });
});
