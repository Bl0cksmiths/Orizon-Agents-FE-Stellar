import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { escrowErrorCode, reclaimAuthorization } from "./reclaim";
import type { SubmitResult } from "./types";

const PAYER = "GBPAYER".padEnd(56, "A");
const AUTH = "0123456789abcdef0123456789abcdef";
const HASH = "f".repeat(64);

/** A route refusal as lib/api builds it from the error envelope. */
const refused = (status: number, code: string | undefined, message = "no") =>
  new ApiError(
    `POST /stellar/build/reclaim → ${status} — ${message}`,
    status,
    undefined,
    code,
    code === undefined
      ? { detail: "Not Found" }
      : { detail: code, error: { code, message } },
  );

function run(
  over: {
    build?: () => Promise<{ xdr: string }>;
    sign?: (xdr: string) => Promise<string>;
    submit?: (signed: string) => Promise<SubmitResult>;
  } = {},
) {
  const build = vi.fn(over.build ?? (async () => ({ xdr: "UNSIGNED" })));
  const sign = vi.fn(over.sign ?? (async () => "SIGNED"));
  const submit = vi.fn(
    over.submit ??
      (async (): Promise<SubmitResult> => ({
        hash: HASH,
        status: "SUCCESS",
        return_value: null,
      })),
  );
  const result = reclaimAuthorization({
    payer: PAYER,
    authIdHex: AUTH,
    signXdr: sign,
    build,
    submit,
  });
  return { result, build, sign, submit };
}

describe("reclaimAuthorization", () => {
  it("builds for the payer and authorization, signs, submits, and reports the hash", async () => {
    const { result, build, sign, submit } = run();
    await expect(result).resolves.toEqual({ kind: "reclaimed", hash: HASH });
    expect(build).toHaveBeenCalledWith({ payer: PAYER, auth_id_hex: AUTH });
    expect(sign).toHaveBeenCalledWith("UNSIGNED");
    expect(submit).toHaveBeenCalledWith("SIGNED");
  });

  // The route may land after this client: its absence is an answer.
  it("reports a missing route as unavailable, never as a failure", async () => {
    const { result, sign } = run({
      build: async () => {
        throw refused(404, undefined, "Not Found");
      },
    });
    await expect(result).resolves.toEqual({ kind: "unavailable" });
    expect(sign).not.toHaveBeenCalled();
  });

  // An authorization the route could not find is not the route missing.
  it("keeps the route's own 404 a failure with its sentence", async () => {
    const { result } = run({
      build: async () => {
        throw refused(404, "authorization_not_found", "no such authorization");
      },
    });
    const r = await result;
    expect(r.kind).toBe("failed");
    if (r.kind === "failed") {
      expect(r.error.detail).toBe(
        "No such authorization. Nothing was signed or sent.",
      );
    }
  });

  it.each([
    ["authorization_locked", "not_yet"],
    ["authorization_settled", "already_settled"],
    ["authorization_revoked", "already_reclaimed"],
    ["reclaim_unsupported", "nothing_held"],
  ])("maps the route's %s before the wallet is asked", async (code, kind) => {
    const { result, sign } = run({
      build: async () => {
        throw refused(409, code);
      },
    });
    await expect(result).resolves.toEqual({ kind });
    expect(sign).not.toHaveBeenCalled();
  });

  // The contract's own codes, when a transaction reaches the ledger anyway.
  it.each([
    [9, "not_yet"],
    [7, "already_settled"],
    [6, "already_reclaimed"],
  ])("maps contract error #%s on a failed transaction", async (code, kind) => {
    const { result } = run({
      submit: async () => ({
        hash: HASH,
        status: "FAILED",
        return_value: null,
        diagnostic: `<SCVal [type=2, error=<SCError [type=0, contract_code=<Uint32 [uint32=${code}]>]>]>`,
      }),
    });
    await expect(result).resolves.toEqual({ kind });
  });

  it("reports a declined signature as declined, with nothing sent", async () => {
    const { result, submit } = run({
      sign: async () => {
        throw new Error("User declined access");
      },
    });
    await expect(result).resolves.toEqual({ kind: "declined" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps any other failed transaction a failure, with its hash", async () => {
    const { result } = run({
      submit: async () => ({
        hash: HASH,
        status: "FAILED",
        return_value: null,
        diagnostic: "Error(Contract, #1)",
      }),
    });
    const r = await result;
    expect(r.kind).toBe("failed");
    if (r.kind === "failed") expect(r.hash).toBe(HASH);
  });
});

describe("escrowErrorCode", () => {
  it("reads both spellings of a contract error", () => {
    expect(escrowErrorCode("HostError: Error(Contract, #9)")).toBe(9);
    expect(
      escrowErrorCode("<SCError [type=0, contract_code=<Uint32 [uint32=7]>]>"),
    ).toBe(7);
    expect(escrowErrorCode("tx_bad_seq")).toBeNull();
  });
});
