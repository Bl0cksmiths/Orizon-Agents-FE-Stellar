/**
 * Tests for the registration evidence-block builder in
 * lib/registration-evidence.ts (story 1.07). Covers the testnet and
 * public/mainnet segment + label mapping, that every artifact appears, and the
 * defaulted ISO timestamp.
 */

import { describe, expect, it } from "vitest";
import { buildRegistrationEvidence } from "./registration-evidence";

const base = {
  agentId: "weather_bot",
  owner: "GBI2I3WLMP2Q6L26G7CBKRPP5WJ6G3GGYJHWALOJ7D6EBRGL5OZAADBH",
  txHash: "416bea4f83e5afd9fc80e38c75ba4b1050031a2d590b0fe6232aa00d6a846393",
  capturedAt: "2026-09-08T04:00:00.000Z",
};

describe("buildRegistrationEvidence", () => {
  it("emits every artifact with testnet links and label", () => {
    const out = buildRegistrationEvidence({ ...base, network: "testnet" });
    expect(out).toContain("agent id:  weather_bot");
    expect(out).toContain(`owner:     ${base.owner}`);
    expect(out).toContain(`tx hash:   ${base.txHash}`);
    expect(out).toContain("network:   testnet");
    expect(out).toContain(
      `tx:        https://stellar.expert/explorer/testnet/tx/${base.txHash}`,
    );
    expect(out).toContain(
      `account:   https://stellar.expert/explorer/testnet/account/${base.owner}`,
    );
    expect(out).toContain("captured:  2026-09-08T04:00:00.000Z");
  });

  it("maps the public segment and mainnet label", () => {
    const out = buildRegistrationEvidence({ ...base, network: "public" });
    expect(out).toContain("network:   mainnet");
    expect(out).toContain("/explorer/public/tx/");
    expect(out).toContain("/explorer/public/account/");
  });

  it("treats the live endpoint's 'mainnet' like 'public'", () => {
    // GET /stellar/network reports "mainnet", not "public" — without this
    // normalization a real mainnet registration would be labelled testnet and
    // its evidence links would point at the wrong explorer.
    const out = buildRegistrationEvidence({ ...base, network: "mainnet" });
    expect(out).toContain("network:   mainnet");
    expect(out).toContain("/explorer/public/tx/");
    expect(out).toContain("/explorer/public/account/");
  });

  it("defaults capturedAt to an ISO timestamp when omitted", () => {
    const { capturedAt: _omit, ...noTime } = base;
    const out = buildRegistrationEvidence({ ...noTime, network: "testnet" });
    const line = out.split("\n").find((l) => l.startsWith("captured:"));
    expect(line).toMatch(/captured:\s+\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  });
});
