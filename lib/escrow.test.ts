import { describe, expect, it } from "vitest";

import {
  AUTHORIZE_FEE_HEADROOM_XLM,
  AUTHORIZE_TTL_SECONDS,
  BASE_RESERVE_XLM,
  checkEscrowFunds,
  classifyAuthorizeError,
  insufficientEscrowFunds,
} from "./escrow";

describe("AUTHORIZE_TTL_SECONDS", () => {
  // The backend refuses anything outside 30–3600 s with a 422, after the
  // buyer pressed Authorize; the constant has to sit inside that bound.
  it("sits inside the backend's accepted range", () => {
    expect(AUTHORIZE_TTL_SECONDS).toBeGreaterThanOrEqual(30);
    expect(AUTHORIZE_TTL_SECONDS).toBeLessThanOrEqual(3600);
    expect(Number.isInteger(AUTHORIZE_TTL_SECONDS)).toBe(true);
  });
});

describe("checkEscrowFunds", () => {
  const cap = 0.3;
  const floor = cap + AUTHORIZE_FEE_HEADROOM_XLM + BASE_RESERVE_XLM;

  it("passes a wallet that covers the maximum, the fee and the reserve", () => {
    expect(
      checkEscrowFunds({ balance: "100.0000000", cap, asset: "native" }),
    ).toEqual({ kind: "enough" });
  });

  // Exactly enough is enough: compared in stroops, never in floats that turn
  // 0.028 + 0.1 + 1 into 1.1280000000000001 and refuse a wallet of 1.128.
  it.each([cap, 0.028])(
    "passes a wallet holding exactly what a %s cap needs",
    (c) => {
      const exact = (c + AUTHORIZE_FEE_HEADROOM_XLM + BASE_RESERVE_XLM).toFixed(
        7,
      );
      expect(
        checkEscrowFunds({ balance: exact, cap: c, asset: "native" }),
      ).toEqual({ kind: "enough" });
    },
  );

  it("refuses a wallet a stroop short, and says by how much", () => {
    const available = floor - 0.0000001;
    expect(
      checkEscrowFunds({
        balance: available.toFixed(7),
        cap,
        asset: "native",
      }),
    ).toEqual({
      kind: "short",
      needed: floor,
      available: Number(available.toFixed(7)),
    });
  });

  // The reserve is the part a buyer does not expect: a wallet holding the
  // maximum and the fee, and nothing else, still cannot move it.
  it("refuses a wallet that holds the maximum but not the reserve", () => {
    const result = checkEscrowFunds({
      balance: String(cap + AUTHORIZE_FEE_HEADROOM_XLM),
      cap,
      asset: "native",
    });
    expect(result.kind).toBe("short");
  });

  // An unread balance is not a zero and not a pass: the chain decides.
  it.each([
    ["the balance is unread", { balance: null, asset: "native" }],
    ["the balance is blank", { balance: " ", asset: "native" }],
    ["the balance is not a number", { balance: "lots", asset: "native" }],
    ["the unit is not known yet", { balance: "0", asset: null }],
  ])("reports unknown when %s", (_name, input) => {
    expect(checkEscrowFunds({ ...input, cap })).toEqual({ kind: "unknown" });
  });

  // A USDC escrow is funded in USDC; an XLM balance says nothing about it.
  it("does not judge a non-native escrow by the XLM balance", () => {
    expect(checkEscrowFunds({ balance: "0", cap, asset: "USDC" })).toEqual({
      kind: "not_native",
    });
  });
});

describe("insufficientEscrowFunds", () => {
  it("is a typed insufficient-balance error naming both figures", () => {
    const e = insufficientEscrowFunds({
      kind: "short",
      needed: 1.4,
      available: 0.25,
    });
    expect(e.kind).toBe("insufficient_balance");
    expect(e.detail).toContain("1.4 XLM");
    expect(e.detail).toContain("0.25 XLM");
    // The custody fact, and that nothing happened yet.
    expect(e.detail).toContain("moves the plan's maximum into escrow");
    expect(e.detail).toContain("Nothing was signed or moved.");
  });
});

describe("classifyAuthorizeError", () => {
  it.each([
    [
      "the SAC's message",
      "authorize tx FAILED · HostError: balance is not sufficient to spend",
    ],
    [
      "the native reserve refusal",
      "resulting balance is not within the allowed range",
    ],
    ["the host's error code", "authorize tx FAILED · Error(Contract, #10)"],
    [
      "the backend's SDK repr of the code",
      "authorize tx FAILED · <SCVal [type=2, error=<SCError [type=0, contract_code=<Uint32 [uint32=10]>]>]>",
    ],
    ["a fee the wallet cannot pay", "submit failed (tx_insufficient_balance)"],
  ])("maps %s to a typed insufficient balance", (_name, message) => {
    const e = classifyAuthorizeError(new Error(message));
    expect(e.kind).toBe("insufficient_balance");
    expect(e.detail).toContain("into escrow");
    expect(e.raw).toBe(message);
  });

  // An escrow refusal with another code is not a balance problem.
  it("leaves another contract error to the shared classifier", () => {
    const e = classifyAuthorizeError(
      new Error("authorize tx FAILED · Error(Contract, #4)"),
    );
    expect(e.kind).not.toBe("insufficient_balance");
  });

  it("names the likely cause of a failed build without claiming it", () => {
    const e = classifyAuthorizeError(
      Object.assign(
        new Error("POST /stellar/build/authorize → 400 — build_failed"),
        {
          status: 400,
          code: "build_failed",
        },
      ),
    );
    expect(e.kind).toBe("unknown");
    expect(e.title).toBe("The authorization could not be prepared");
    expect(e.detail).toContain("nothing was signed or moved");
    expect(e.detail).toContain("most common cause");
  });

  it("passes a declined signature through the shared classifier", () => {
    expect(classifyAuthorizeError(new Error("User declined")).kind).toBe(
      "user_rejected",
    );
  });
});
