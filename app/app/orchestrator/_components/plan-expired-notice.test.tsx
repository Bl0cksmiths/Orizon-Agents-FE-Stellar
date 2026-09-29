// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlanExpiredNotice } from "./plan-expired-notice";

afterEach(cleanup);

const said = (node: JSX.Element) => render(node).container.textContent ?? "";

describe("PlanExpiredNotice · the authorization the buyer just signed", () => {
  it("says v2's custody is held until reclaimed", () => {
    const text = said(<PlanExpiredNotice run="authorize" generation="v2" />);
    expect(text).toContain(
      "No task was started and no agent was paid. The authorization you just signed is held in escrow until you reclaim it, as set out below.",
    );
  });

  it("says v2's custody came back when the platform returned it", () => {
    const text = said(
      <PlanExpiredNotice run="authorize" generation="v2" fundsReturned />,
    );
    expect(text).toContain(
      "The platform returned the authorization you just signed from escrow to your wallet, as shown below.",
    );
    expect(text).not.toContain("until you reclaim it");
  });

  // v1 takes no custody: there is nothing held and nothing to reclaim.
  it("says a v1 authorization moved nothing and lapses on its own", () => {
    const text = said(<PlanExpiredNotice run="authorize" generation="v1" />);
    expect(text).toContain(
      "No task was started and no agent was paid. The authorization you just signed only recorded a spending allowance on the escrow: no funds moved, and it lapses on its own when it expires.",
    );
    expect(text).not.toMatch(/held in escrow|reclaim|returned/);
  });

  it("claims neither while the escrow is unknown", () => {
    const text = said(
      <PlanExpiredNotice run="authorize" generation="unknown" />,
    );
    expect(text).toContain(
      "No task was started and no agent was paid.Build a fresh plan",
    );
    expect(text).not.toMatch(/held in escrow|reclaim|allowance|no funds moved/);
  });

  it("says a simulated pass charged nothing, whatever the escrow", () => {
    for (const generation of ["v1", "v2", "unknown"] as const) {
      const text = said(
        <PlanExpiredNotice run="simulate" generation={generation} />,
      );
      expect(text).toContain("Nothing was charged and no task was started.");
      expect(text).not.toContain("authorization you just signed");
      cleanup();
    }
  });
});
