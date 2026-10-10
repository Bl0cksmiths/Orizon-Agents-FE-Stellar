/**
 * Unit tests for the wallet error classifier.
 *
 * Yellow Belt promised the dApp distinguishes three error types
 * (`wallet_not_found`, `user_rejected`, `insufficient_balance`).
 * These tests lock that contract in so a refactor can't silently
 * regress the friendly-error UX.
 *
 * Two things beyond the three kinds matter enough to pin down:
 *   - Horizon's `result_codes` outrank the message regexes. Every code the
 *     classifier special-cases gets its own case below, plus the catch-all
 *     that has to keep the raw codes visible for the ones it doesn't know.
 *   - The remediation copy is network-aware — Friendbot only exists on
 *     testnet, so a mainnet build must never tell a user to go top up there.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  classifyError,
  isFriendlyError,
  wrongNetworkError,
} from "./wallet-errors";
import { ApiError } from "./api";
import { BOT_DETECTED_MESSAGE } from "./bot-check-message";

const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

/** The shape Horizon errors arrive in via the SDK's axios rejection. */
function horizonError(
  result_codes: { transaction?: string; operations?: string[] },
  message = "Request failed with status code 400",
) {
  return { message, response: { data: { extras: { result_codes } } } };
}

/**
 * lib/env.ts resolves the network at module load, and wallet-errors.ts bakes
 * the labels into module consts — so the mainnet copy can only be observed by
 * re-importing both under a mainnet env. (env.ts also rejects a mainnet
 * passphrase pointed at test endpoints, hence all three vars.)
 */
async function loadOnMainnet() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE", PUBLIC_PASSPHRASE);
  vi.stubEnv("NEXT_PUBLIC_HORIZON_URL", "https://horizon.stellar.org");
  vi.stubEnv("NEXT_PUBLIC_SOROBAN_RPC_URL", "https://mainnet.sorobanrpc.com");
  return import("./wallet-errors");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("classifyError", () => {
  it("maps a locked wallet to wallet_locked with an unlock message", () => {
    const f = classifyError(new Error("The wallet is locked"));
    expect(f.kind).toBe("wallet_locked");
    expect(f.title).toBe("Wallet is locked");
    expect(f.detail.toLowerCase()).toContain("unlock");
  });

  it("classifies an 'access denied while locked' message as locked, not rejected", () => {
    // A locked wallet can word itself as denial; locked must win over reject.
    const f = classifyError(new Error("Please unlock your wallet to continue"));
    expect(f.kind).toBe("wallet_locked");
  });

  it("does not mistake an unlocked confirmation for a locked wallet", () => {
    const f = classifyError(new Error("wallet successfully connected"));
    expect(f.kind).not.toBe("wallet_locked");
  });

  it("maps Freighter user-rejected message to user_rejected", () => {
    const e = new Error("User declined access");
    const f = classifyError(e);
    expect(f.kind).toBe("user_rejected");
    expect(f.title).toMatch(/cancel/i);
  });

  it("maps Horizon tx_insufficient_balance to insufficient_balance", () => {
    const e = {
      message: "Request failed with status code 400",
      response: {
        data: {
          extras: {
            result_codes: { transaction: "tx_insufficient_balance" },
          },
        },
      },
    };
    const f = classifyError(e);
    expect(f.kind).toBe("insufficient_balance");
    expect(f.title).toMatch(/insufficient/i);
  });

  it("maps op_no_destination to a friendly 'destination doesn't exist' message", () => {
    const e = {
      response: {
        data: {
          extras: {
            result_codes: {
              transaction: "tx_failed",
              operations: ["op_no_destination"],
            },
          },
        },
      },
    };
    const f = classifyError(e);
    expect(f.title).toMatch(/destination/i);
    expect(f.detail).toMatch(/friendbot|funded/i);
    expect(f.raw).toContain("op_no_destination");
  });

  it("falls through to unknown for unmapped errors but preserves the raw message", () => {
    const e = new Error("freezer compartment overheating");
    const f = classifyError(e);
    expect(f.kind).toBe("unknown");
    expect(f.raw).toContain("freezer");
  });

  it("treats wallet-extension-missing messages as wallet_not_found", () => {
    const e = new Error("Freighter is not installed");
    const f = classifyError(e);
    expect(f.kind).toBe("wallet_not_found");
    expect(f.detail).toMatch(/install/i);
  });

  it("maps wallet wrong-network messages to wrong_network", () => {
    const f = classifyError(new Error("Wrong network selected in the wallet"));
    expect(f.kind).toBe("wrong_network");
    expect(f.detail).toMatch(/switch/i);
  });

  it("passes an already-classified FriendlyError through unchanged", () => {
    const pre = wrongNetworkError("wallet reports PUBLIC; app expects TESTNET");
    const f = classifyError(pre);
    expect(f).toBe(pre);
    expect(f.kind).toBe("wrong_network");
    expect(f.raw).toContain("PUBLIC");
  });

  it("does not re-mangle a classified error whose text would match another rule", () => {
    // A timeout FriendlyError from wallet.tsx: its detail says "closed", which
    // the user_rejected regex would happily claim if the short-circuit broke.
    const pre = {
      kind: "unknown" as const,
      title: "Wallet timed out",
      detail: "The signing popup may have been blocked or closed.",
      raw: "wallet did not settle within 120s",
    };
    const f = classifyError(pre);
    expect(f).toBe(pre);
    expect(f.title).toBe("Wallet timed out");
  });
});

describe("classifyError · Horizon result codes", () => {
  it("maps tx_bad_auth to a bad-signature error naming the expected network", () => {
    const f = classifyError(horizonError({ transaction: "tx_bad_auth" }));
    expect(f.kind).toBe("user_rejected");
    expect(f.title).toMatch(/bad signature/i);
    expect(f.detail).toMatch(/Stellar Test Net/);
    expect(f.raw).toContain("tx=tx_bad_auth");
  });

  it("maps tx_bad_auth_extra the same way as tx_bad_auth", () => {
    const f = classifyError(horizonError({ transaction: "tx_bad_auth_extra" }));
    expect(f.kind).toBe("user_rejected");
    expect(f.title).toMatch(/bad signature/i);
    expect(f.raw).toContain("tx=tx_bad_auth_extra");
  });

  it("maps tx_too_late to an expired/out-of-sequence retry hint", () => {
    const f = classifyError(horizonError({ transaction: "tx_too_late" }));
    expect(f.kind).toBe("unknown");
    expect(f.title).toMatch(/expired or out of sequence/i);
    expect(f.detail).toMatch(/retry/i);
  });

  it("maps tx_bad_seq to the same expired/out-of-sequence hint", () => {
    const f = classifyError(horizonError({ transaction: "tx_bad_seq" }));
    expect(f.kind).toBe("unknown");
    expect(f.title).toMatch(/expired or out of sequence/i);
    expect(f.raw).toContain("tx=tx_bad_seq");
  });

  it("maps tx_insufficient_fee to a fee-too-low retry hint, not to insufficient_balance", () => {
    const f = classifyError(
      horizonError({ transaction: "tx_insufficient_fee" }),
    );
    // The user has the funds — retrying at the new base fee is the fix, so
    // this must not be dressed up as an empty wallet.
    expect(f.kind).toBe("unknown");
    expect(f.title).toMatch(/fee too low/i);
    expect(f.detail).toMatch(/congest/i);
  });

  it("maps op_low_reserve to insufficient_balance with reserve advice", () => {
    const f = classifyError(
      horizonError({
        transaction: "tx_failed",
        operations: ["op_low_reserve"],
      }),
    );
    expect(f.kind).toBe("insufficient_balance");
    expect(f.title).toMatch(/reserve/i);
    expect(f.detail).toMatch(/1 XLM/);
    expect(f.raw).toContain("ops=[op_low_reserve]");
  });

  it("reads op_underfunded out of the operations list even when the tx code is generic", () => {
    const f = classifyError(
      horizonError({
        transaction: "tx_failed",
        operations: ["op_underfunded"],
      }),
    );
    expect(f.kind).toBe("insufficient_balance");
    expect(f.detail).toMatch(/friendbot/i);
  });

  it("surfaces the raw codes for a Horizon failure it has no special case for", () => {
    const f = classifyError(
      horizonError({
        transaction: "tx_failed",
        operations: ["op_malformed", "op_line_full"],
      }),
    );
    expect(f.kind).toBe("unknown");
    expect(f.title).toBe(
      "Horizon rejected the tx — tx_failed (op_malformed, op_line_full)",
    );
    expect(f.detail).toMatch(/result-codes/);
    expect(f.raw).toContain("ops=[op_malformed, op_line_full]");
  });

  it("still reports a tx_failed rejection when Horizon returns an empty code bag", () => {
    const f = classifyError(horizonError({}));
    expect(f.kind).toBe("unknown");
    expect(f.title).toBe("Horizon rejected the tx — tx_failed");
    // Unknown transaction code renders as "?" rather than dropping out of raw.
    expect(f.raw).toBe("Request failed with status code 400 · tx=?");
  });

  it("prefers the Horizon codes over a message that says otherwise", () => {
    // The axios message ("insufficient funds") would classify as
    // insufficient_balance on regex alone; the structured codes win.
    const f = classifyError(
      horizonError({ transaction: "tx_bad_seq" }, "insufficient funds"),
    );
    expect(f.kind).toBe("unknown");
    expect(f.title).toMatch(/expired or out of sequence/i);
  });
});

describe("classifyError · message fallbacks", () => {
  it("classifies an insufficient-funds message with no Horizon envelope", () => {
    const f = classifyError(new Error("insufficient funds for the fee"));
    expect(f.kind).toBe("insufficient_balance");
    expect(f.detail).toMatch(/friendbot/i);
    expect(f.raw).toBe("insufficient funds for the fee");
  });

  it("classifies a bare thrown string", () => {
    const f = classifyError("The user rejected the request");
    expect(f.kind).toBe("user_rejected");
    expect(f.raw).toBe("The user rejected the request");
  });

  it("falls back to generic advice when there is no message at all", () => {
    const f = classifyError(undefined);
    expect(f.kind).toBe("unknown");
    expect(f.raw).toBe("");
    expect(f.detail).toMatch(/something went wrong/i);
  });

  it("stringifies a non-object, non-Error rejection", () => {
    const f = classifyError(418);
    expect(f.kind).toBe("unknown");
    expect(f.raw).toBe("418");
    expect(f.detail).toBe("418");
  });
});

describe("classifyError · BotID refusals", () => {
  it("says a refused build or submit in plain words, keeping the raw line", () => {
    const raw = "POST /stellar/submit → 403 — refused";
    const f = classifyError(new ApiError(raw, 403, undefined, "bot_detected"));
    expect(f).toEqual({
      kind: "unknown",
      title: "Browser not verified",
      detail: BOT_DETECTED_MESSAGE,
      raw,
    });
  });
});

describe("network-aware remediation copy", () => {
  it("points at Friendbot on testnet", () => {
    const f = classifyError(
      horizonError({ transaction: "tx_insufficient_balance" }),
    );
    expect(f.detail).toContain("Top up via Friendbot and try again.");
    expect(wrongNetworkError().detail).toContain("Stellar Test Net");
  });

  it("never mentions Friendbot on mainnet", async () => {
    const mainnet = await loadOnMainnet();

    expect(mainnet.wrongNetworkError().detail).toContain(
      "Stellar Public network",
    );

    const broke = mainnet.classifyError(
      horizonError({ transaction: "tx_insufficient_balance" }),
    );
    expect(broke.detail).toContain("Fund the wallet with XLM and retry.");
    expect(broke.detail).not.toMatch(/friendbot/i);

    const noDest = mainnet.classifyError(
      horizonError({
        transaction: "tx_failed",
        operations: ["op_no_destination"],
      }),
    );
    expect(noDest.detail).not.toMatch(/friendbot|testnet/i);

    const lowReserve = mainnet.classifyError(
      horizonError({
        transaction: "tx_failed",
        operations: ["op_low_reserve"],
      }),
    );
    expect(lowReserve.detail).not.toMatch(/friendbot|testnet/i);
    expect(lowReserve.detail).toMatch(/1 XLM/);

    const badAuth = mainnet.classifyError(
      horizonError({ transaction: "tx_bad_auth" }),
    );
    expect(badAuth.detail).toContain("Stellar Public network");
  });
});

describe("wrongNetworkError", () => {
  it("builds the canonical wrong_network shape with switch-network advice", () => {
    const f = wrongNetworkError("raw detail");
    expect(f.kind).toBe("wrong_network");
    expect(f.title).toMatch(/wrong network/i);
    expect(f.detail).toMatch(/switch to .*(test net|public network)/i);
    expect(f.raw).toBe("raw detail");
  });
});

describe("isFriendlyError", () => {
  it("accepts a well-formed FriendlyError", () => {
    expect(isFriendlyError(wrongNetworkError())).toBe(true);
  });

  it("rejects plain Errors, partial shapes, and unknown kinds", () => {
    expect(isFriendlyError(new Error("wrong network"))).toBe(false);
    expect(isFriendlyError({ kind: "wrong_network", title: "x" })).toBe(false);
    expect(
      isFriendlyError({ kind: "nonsense", title: "x", detail: "y", raw: "z" }),
    ).toBe(false);
    expect(isFriendlyError(null)).toBe(false);
    expect(isFriendlyError("wrong network")).toBe(false);
  });
});
