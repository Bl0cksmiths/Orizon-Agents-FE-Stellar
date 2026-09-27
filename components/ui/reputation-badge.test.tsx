// @vitest-environment jsdom
/**
 * Unit tests for ReputationBadge.
 *
 * The chip carries one distinction that matters more than its number: a score
 * backed by on-chain evidence versus the Bayesian prior standing in for one.
 * Sighted buyers get it from the `≈` marker and the violet tint; everyone gets
 * it from the words. Nothing else in the suite pins either, so deleting the
 * marker and turning priors cyan used to pass every unit and e2e test.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { ReputationBadge } from "./reputation-badge";

afterEach(cleanup);

type Props = Parameters<typeof ReputationBadge>[0];

/** Renders one chip and returns its outermost element. */
function chip(props: Partial<Props> = {}): HTMLElement {
  const { container } = render(
    <ReputationBadge bps={7000} source="prior" {...props} />,
  );
  const el = container.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error("badge rendered nothing");
  return el;
}

/** What a sighted reader sees: the chip's text. */
const shown = (el: HTMLElement) => el.textContent ?? "";

/** What a listener is told. */
const spoken = (el: HTMLElement) => el.getAttribute("aria-label") ?? "";

/** The tint classes that tell a prior from evidence at a glance. */
const PRIOR_TINT = ["border-violet/25", "bg-violet/10", "text-muted"];
const ONCHAIN_TINT = ["border-cyan/40", "bg-cyan/10", "text-cyan"];
const BELOW_TINT = ["border-magenta/40", "bg-magenta/15", "text-magenta"];

const hasAll = (el: HTMLElement, classes: string[]) =>
  classes.every((c) => el.classList.contains(c));
const hasAny = (el: HTMLElement, classes: string[]) =>
  classes.some((c) => el.classList.contains(c));

describe("ReputationBadge — prior versus on-chain", () => {
  it("marks a prior with ≈ and the violet tint, never the cyan one", () => {
    const el = chip({ source: "prior" });
    expect(shown(el)).toMatch(/^≈★3\.50/);
    expect(hasAll(el, PRIOR_TINT)).toBe(true);
    expect(hasAny(el, ONCHAIN_TINT)).toBe(false);
  });

  it("shows on-chain evidence in cyan, with no ≈", () => {
    const el = chip({ source: "onchain", bps: 9000 });
    expect(shown(el)).toMatch(/^★4\.50/);
    expect(shown(el)).not.toContain("≈");
    expect(hasAll(el, ONCHAIN_TINT)).toBe(true);
    expect(hasAny(el, PRIOR_TINT)).toBe(false);
  });

  it("calls a prior an estimate, and a cold start one with no ratings yet", () => {
    const said = spoken(chip({ source: "prior" }));
    expect(said).toContain("prior estimate 3.50");
    expect(said).toContain("no on-chain ratings yet");
    expect(said).not.toMatch(/on-chain reputation/);
  });

  it("never calls a prior served for a failed read a cold start", () => {
    const said = spoken(chip({ source: "prior", degraded: true }));
    expect(said).toContain("prior estimate 3.50");
    expect(said).toContain("the on-chain read did not come back");
    expect(said).not.toContain("no on-chain ratings yet");
  });

  it("keeps the ≈ on a prior below the floor, where the tint turns magenta", () => {
    const el = chip({ source: "prior", lowerBoundBps: 5000, floorBps: 5500 });
    expect(shown(el)).toMatch(/^≈★/);
    expect(hasAll(el, BELOW_TINT)).toBe(true);
    expect(spoken(el)).toContain("below the 2.75 network floor");
  });
});

describe("ReputationBadge — the evidence behind an on-chain score", () => {
  it("states how many rated jobs back the score", () => {
    const el = chip({ source: "onchain", bps: 9000, count: 24 });
    expect(spoken(el)).toContain("on-chain reputation 4.50 from 24 rated jobs");
    expect(shown(el)).toContain("· 24");
  });

  it("says job, not jobs, for exactly one", () => {
    const said = spoken(chip({ source: "onchain", bps: 9000, count: 1 }));
    expect(said).toContain("from 1 rated job");
    expect(said).not.toContain("rated jobs");
  });

  it("claims no count when there is none, or it is zero", () => {
    for (const count of [undefined, 0]) {
      const el = chip({ source: "onchain", bps: 9000, count });
      expect(spoken(el), String(count)).not.toMatch(/rated job/);
      expect(shown(el), String(count)).not.toContain("·");
    }
  });

  it("puts no rated-job count on a prior, which has none of its own", () => {
    const el = chip({ source: "prior", count: 8 });
    expect(spoken(el)).not.toMatch(/rated job/);
    expect(shown(el)).not.toContain("· 8");
  });

  it("states a dispute rate, as words and as the ⚑ figure", () => {
    const el = chip({ source: "onchain", bps: 9000, disputeRateBps: 2500 });
    expect(spoken(el)).toContain("25.0% disputed");
    expect(shown(el)).toContain("⚑ 25.0%");
  });

  it("says nothing about disputes when the rate is zero or unknown", () => {
    for (const disputeRateBps of [undefined, 0]) {
      const el = chip({ source: "onchain", bps: 9000, disputeRateBps });
      expect(spoken(el), String(disputeRateBps)).not.toContain("disputed");
      expect(shown(el), String(disputeRateBps)).not.toContain("⚑");
    }
  });
});
