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

/** The chip's text with every subtree matching `skip` left out. */
function textWithout(el: Node, skip: (e: Element) => boolean): string {
  if (el instanceof Element && skip(el)) return "";
  if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? "";
  return Array.from(el.childNodes)
    .map((c) => textWithout(c, skip))
    .join("");
}

/** What a sighted reader sees: the chip's text, less the sr-only words. */
const shown = (el: HTMLElement) =>
  textWithout(el, (e) => e.classList.contains("sr-only"));

/** What a listener is told: the chip's text, less everything aria-hidden. It
 * is read from the DOM, not from an attribute, so a label that assistive
 * technology may ignore cannot pass for one it will read. */
const spoken = (el: HTMLElement) =>
  textWithout(el, (e) => e.getAttribute("aria-hidden") === "true");

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

  // A source this build does not know, or none at all, is not evidence: it
  // takes the prior's marker and tint, and makes no claim about the chain.
  it("shows an unknown or absent source as an estimate, never as on-chain", () => {
    for (const source of ["estimate", "cached", undefined, null]) {
      const el = chip({ source, bps: 7000 });
      const which = String(source);
      expect(shown(el), which).toMatch(/^≈★3\.50/);
      expect(hasAll(el, PRIOR_TINT), which).toBe(true);
      expect(hasAny(el, ONCHAIN_TINT), which).toBe(false);
      expect(spoken(el), which).toContain("estimate 3.50");
      expect(spoken(el), which).not.toMatch(/on-chain reputation/);
      // Not known to be a cold start, so it does not say there are none.
      expect(spoken(el), which).not.toContain("no on-chain ratings yet");
    }
  });

  it("puts no rated-job count on an unknown source", () => {
    const el = chip({ source: "cached", count: 8 });
    expect(spoken(el)).not.toMatch(/rated job/);
    expect(shown(el)).not.toContain("· 8");
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

describe("ReputationBadge — the floor is judged on the lower bound only", () => {
  it("judges the floor on the lower bound, not the headline score", () => {
    // A healthy-looking 3.00 whose bound sits under the 2.75 floor.
    const el = chip({
      source: "onchain",
      bps: 6000,
      lowerBoundBps: 5000,
      floorBps: 5500,
    });
    expect(hasAll(el, BELOW_TINT)).toBe(true);
    expect(spoken(el)).toContain("below the 2.75 network floor");
  });

  it("says it cannot judge the floor when no lower bound is passed", () => {
    // A headline score under the floor, with no bound to judge it on: the
    // old fallback called this agent below the floor on the wrong number.
    const low = chip({ source: "onchain", bps: 5000, floorBps: 5500 });
    expect(hasAny(low, BELOW_TINT)).toBe(false);
    expect(hasAll(low, ONCHAIN_TINT)).toBe(true);
    expect(spoken(low)).not.toContain("below the");
    expect(spoken(low)).toContain(
      "not judged against the 2.75 network floor — its lower bound is not known",
    );
    // And a headline score over it is not waved through either.
    const high = chip({ source: "onchain", bps: 9000, floorBps: 5500 });
    expect(spoken(high)).toContain("not judged against the 2.75 network floor");
  });

  it("says nothing about a floor that was not passed", () => {
    const el = chip({ source: "onchain", bps: 5000, lowerBoundBps: 4000 });
    expect(spoken(el)).not.toMatch(/floor/);
    expect(hasAny(el, BELOW_TINT)).toBe(false);
  });
});

describe("ReputationBadge — what assistive technology is told", () => {
  it("puts no aria-label on the role-less chip", () => {
    for (const source of ["prior", "onchain", "cached"]) {
      const el = chip({ source, floorBps: 5500, lowerBoundBps: 6000 });
      expect(el.hasAttribute("aria-label"), source).toBe(false);
      expect(el.querySelector("[aria-label]"), source).toBeNull();
    }
  });

  it("says the source, the score and the floor verdict in sr-only words", () => {
    const el = chip({
      source: "onchain",
      bps: 9000,
      lowerBoundBps: 8400,
      floorBps: 5500,
      count: 24,
      disputeRateBps: 2500,
    });
    const words = el.querySelector(".sr-only")?.textContent ?? "";
    expect(words).toBe(
      "on-chain reputation 4.50 from 24 rated jobs · clears the 2.75 network floor · 25.0% disputed",
    );
    // Those words are ALL a listener gets: the figures beside them are hidden.
    expect(spoken(el)).toBe(words);
  });

  it("tells a listener a prior is an estimate, and one below the floor so", () => {
    const el = chip({ source: "prior", lowerBoundBps: 5000, floorBps: 5500 });
    expect(spoken(el)).toBe(
      "prior estimate 3.50 — no on-chain ratings yet · below the 2.75 network floor",
    );
  });

  it("hides every glyph and figure, so none is read out of context", () => {
    const el = chip({
      source: "prior",
      count: 3,
      disputeRateBps: 900,
    });
    expect(spoken(el)).not.toMatch(/[≈★⚑]/);
    expect(spoken(el)).not.toMatch(/^3\.50/);
    // The sighted run still carries the marker, the score and the flag.
    expect(shown(el)).toBe("≈★3.50⚑ 9.0%");
  });

  it("keeps the same sentence as the tooltip for mouse users", () => {
    const el = chip({ source: "prior", degraded: true });
    expect(el.getAttribute("title")).toBe(spoken(el));
  });
});
