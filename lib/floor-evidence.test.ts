/**
 * The below-floor evidence sentence says only what the notice's numbers
 * support: thin evidence at one rating, the record at more, a dispute share
 * when there is one, and nothing at all when the count is unknown. Never
 * "bad work", and never "not bad work".
 */

import { describe, expect, it } from "vitest";

import { belowFloorEvidence, THIN_EVIDENCE_MAX_COUNT } from "./floor-evidence";
import { lowerBoundBps, smoothedBps } from "./reputation-math";

const say = (count: unknown, disputeRateBps: unknown = 0) =>
  belowFloorEvidence({
    count: count as number | null | undefined,
    disputeRateBps: disputeRateBps as number | null | undefined,
  });

describe("belowFloorEvidence", () => {
  it("calls one rating thin evidence", () => {
    expect(say(1)).toBe(
      "That bound rests on a single rating, so the evidence behind it is thin.",
    );
  });

  it("describes many ratings as the record, never as thin", () => {
    const s = say(7);
    expect(s).toBe(
      "That bound rests on 7 ratings, and that record, read conservatively, falls short of the floor.",
    );
    expect(s).not.toMatch(/thin/);
  });

  it("stops calling it thin at the first count past the threshold", () => {
    expect(say(THIN_EVIDENCE_MAX_COUNT)).toMatch(/thin/);
    expect(say(THIN_EVIDENCE_MAX_COUNT + 1)).not.toMatch(/thin/);
    expect(say(THIN_EVIDENCE_MAX_COUNT + 1)).toMatch(
      /falls short of the floor/,
    );
  });

  it("says a bound on no ratings is the starting estimate", () => {
    expect(say(0)).toBe(
      "That bound rests on no ratings: it is the starting estimate an unrated agent is credited with, and the floor sits above it.",
    );
  });

  it("states a non-zero dispute rate as a share of the ratings", () => {
    expect(say(7, 1428)).toBe(
      "That bound rests on 7 ratings, and that record, read conservatively, falls short of the floor. 14.3% of those ratings were disputes.",
    );
  });

  it("says a lone disputed rating was a dispute, not '100.0% of those'", () => {
    expect(say(1, 10_000)).toBe(
      "That bound rests on a single rating, so the evidence behind it is thin. That rating was a dispute.",
    );
  });

  it("says nothing of disputes at a zero, null or absent rate", () => {
    for (const rate of [0, null, undefined, Number.NaN]) {
      expect(say(7, rate)).not.toMatch(/dispute/);
    }
  });

  it("says nothing about cause when the count is unknown", () => {
    for (const count of [null, undefined, Number.NaN, -1, 2.5, "7"]) {
      expect(say(count, 1428)).toBeNull();
    }
  });

  it("never claims bad work, or its absence", () => {
    for (const count of [0, 1, 2, 40]) {
      for (const rate of [0, 2500, 10_000]) {
        expect(say(count, rate) ?? "").not.toMatch(
          /bad work|poor|fail|underperform|not a judgement|rather than/i,
        );
      }
    }
  });

  // Why many ratings are NOT worded "its rated work averages below the
  // floor": the bound blends in the prior and subtracts an uncertainty
  // margin, so ratings averaging ABOVE the floor can still leave the bound
  // under it. 58/100 on 12 units of weight against a 55/100 floor:
  it("premise: ratings averaging above the floor can leave the bound below it", () => {
    const floor = 5500;
    const bound = lowerBoundBps(smoothedBps(5800, 12), 12);
    expect(5800).toBeGreaterThan(floor);
    expect(bound).toBeLessThan(floor);
  });
});
