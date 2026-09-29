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
    render(<PipelineDiagram generation="v2" />);
    expect(text()).toContain(
      "The rating's evidence weight is the step's settled value, capped at 12, the prior's own weight, so a single rating counts for at most as much as the prior",
    );
    expect(text()).not.toMatch(/100 USDC|value in USDC/);
  });
});

describe("PipelineDiagram · the Settle stage", () => {
  const settle = () => document.querySelector("li")?.textContent ?? "";

  it("pays the operator from escrowed funds at settle under v2", () => {
    render(<PipelineDiagram generation="v2" />);
    expect(settle()).toContain(
      "its operator is paid from the buyer's escrowed funds when the run settles",
    );
    expect(settle()).toContain("PaymentEscrow.settle");
  });

  // v1's authorize is an allowance and its charge cannot complete (D-039).
  it("charges an allowance, and says it cannot yet complete, under v1", () => {
    render(<PipelineDiagram generation="v1" />);
    expect(settle()).toContain(
      "is charged against the buyer's spending allowance on the escrow; only settled work may rate. On this deployment the escrow cannot yet complete that charge (a known defect; the fix is deployed separately).",
    );
    expect(settle()).toContain("PaymentEscrow.charge");
    expect(settle()).not.toMatch(/escrowed funds|PaymentEscrow\.settle/);
  });

  it("names neither contract call while the escrow is unknown", () => {
    render(<PipelineDiagram generation="unknown" />);
    expect(settle()).toContain(
      "its payment settles through the escrow; only settled work may rate.",
    );
    expect(settle()).not.toMatch(/PaymentEscrow|escrowed funds|allowance/);
  });

  it("keeps all six stages whichever escrow is live", () => {
    for (const generation of ["v1", "v2", "unknown"] as const) {
      render(<PipelineDiagram generation={generation} />);
      expect(document.querySelectorAll("li")).toHaveLength(6);
      cleanup();
    }
  });
});
