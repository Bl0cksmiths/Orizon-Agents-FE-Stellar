// @vitest-environment jsdom
/**
 * The tier badge and model tag shown per step on the plan card and in the
 * trace. Plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { ModelTag, TierBadge } from "./tier-badge";

afterEach(cleanup);

describe("TierBadge", () => {
  it("says the tier in words, with the word tier", () => {
    for (const tier of ["low", "moderate", "complex"]) {
      const { container, unmount } = render(<TierBadge tier={tier} />);
      expect(container.textContent?.toLowerCase()).toContain(`${tier} tier`);
      unmount();
    }
  });

  // A tier this build cannot name, or none, is no badge — never a guess.
  it("renders nothing for an unknown tier or none", () => {
    for (const tier of ["extreme", "", null, undefined]) {
      const { container, unmount } = render(<TierBadge tier={tier} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});

describe("ModelTag", () => {
  it("names the model by its display name", () => {
    const { container } = render(<ModelTag model="claude-opus-5-5" />);
    expect(container.textContent).toContain("Claude Opus 5.5");
  });

  it("can say the step runs on it", () => {
    const { container } = render(
      <ModelTag model="claude-haiku-4-5" prefix="runs on" />,
    );
    expect(container.textContent).toBe("runs on Claude Haiku 4.5");
  });

  it("renders nothing when no model is named", () => {
    for (const model of [null, undefined, "", "  "]) {
      const { container, unmount } = render(<ModelTag model={model} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});
