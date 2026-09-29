// @vitest-environment jsdom
/**
 * The static copy on /app/reputation that states one rating's weight cap.
 *
 * The backend's `reputation_svc.max_rating_weight_usdc()` is
 * min(REPUTATION_MAX_RATING_WEIGHT_USDC 100, REPUTATION_MAX_RATING_TO_PRIOR_RATIO
 * 1.0 × REPUTATION_PRIOR_WEIGHT_USDC 12) = 12, so a rating weighs at most what
 * the prior does. The rubric and the principles used to say "100 USDC": the
 * absolute ceiling alone, in a unit testnet does not settle in (F-022).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { DEFAULT_REP_PARAMS } from "@/lib/reputation-math";
import { DesignPrinciples } from "./design-principles";
import { RatingRubric } from "./rating-rubric";

// framer-motion's whileInView needs an IntersectionObserver jsdom lacks.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const strip = ({
    initial: _i,
    whileInView: _w,
    viewport: _v,
    transition: _t,
    ...rest
  }: Record<string, unknown>) => rest;
  return {
    m: {
      li: (props: Record<string, unknown>) =>
        React.createElement("li", strip(props)),
    },
  };
});

afterEach(cleanup);

const text = (ui: React.ReactElement) =>
  (render(ui).container.textContent ?? "").replace(/\s+/g, " ");

describe("the rating weight cap in the reputation page's static copy", () => {
  it("is the prior's weight, 12", () => {
    expect(DEFAULT_REP_PARAMS.prior_weight_usdc).toBe(12);
  });

  it("the rubric caps a rating's weight at the prior's weight", () => {
    const rubric = text(<RatingRubric />);
    expect(rubric).toContain("weight = min(step price, 12)");
    expect(rubric).toContain(
      "one rating counts for at most as much as the prior",
    );
    expect(rubric).not.toContain("min(step price, 100");
    expect(rubric).not.toContain("USDC");
  });

  it("the whale principle caps a job's weight at the prior's weight", () => {
    const principles = text(<DesignPrinciples />);
    expect(principles).toContain(
      "A single job's evidence weight caps at 12, the prior's own weight",
    );
    expect(principles).not.toContain("100");
    expect(principles).not.toContain("USDC");
  });
});
