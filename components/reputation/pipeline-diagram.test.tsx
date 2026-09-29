// @vitest-environment jsdom
/**
 * PipelineDiagram: the six stages a score passes through, stated as the
 * deployed backend and contracts run them.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PipelineDiagram } from "./pipeline-diagram";

afterEach(cleanup);

const text = () => document.body.textContent ?? "";

describe("PipelineDiagram · the Weigh stage", () => {
  // The backend's cap is min(100, 1.0 × the prior's 12) = 12, and weight is
  // in the escrow's asset, never USDC.
  it("caps one rating's weight at the prior's own weight, with no USDC", () => {
    render(<PipelineDiagram />);
    expect(text()).toContain(
      "The rating's evidence weight is the step's settled value, capped at 12, the prior's own weight, so a single rating counts for at most as much as the prior",
    );
    expect(text()).not.toMatch(/100 USDC|value in USDC/);
  });
});
