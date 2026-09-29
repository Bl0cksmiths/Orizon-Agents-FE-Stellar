// @vitest-environment jsdom
/**
 * The empty events feed names the events a workflow will publish — which
 * depends on the escrow the deployment settles through.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EventsEmptyHint } from "./empty-hint";

afterEach(cleanup);

const said = (generation: "v1" | "v2" | "unknown") =>
  render(<EventsEmptyHint generation={generation} />).container.textContent;

describe("EventsEmptyHint", () => {
  it("names v2's authd, charged, settled and seal", () => {
    expect(said("v2")).toBe(
      "No events yet. Run a workflow on /app/orchestrator — it publishes authd when you authorize, charged for each step's payout and settled when the run settles, then the attestation's seal, each here within a ledger.",
    );
  });

  // v1's charge cannot complete (D-039): no charged event, and no settled.
  it("names v1's authd and seal, and says no charged event follows", () => {
    expect(said("v1")).toBe(
      "No events yet. Run a workflow on /app/orchestrator — it publishes authd when you authorize, then the attestation's seal, each here within a ledger. On this deployment the escrow cannot yet complete a payment (a known defect; the fix is deployed separately), so no charged event follows.",
    );
  });

  it("names only what both escrows publish while the escrow is unknown", () => {
    expect(said("unknown")).toBe(
      "No events yet. Run a workflow on /app/orchestrator — it publishes authd when you authorize, then the attestation's seal, each here within a ledger.",
    );
  });
});
