import { IS_MAINNET } from "@/lib/env";
import { assetLabel, decimalToStroops, formatStroops } from "@/lib/money";
import { classifyError, type FriendlyError } from "@/lib/wallet-errors";

/**
 * The buyer's side of PaymentEscrow v2, in one place.
 *
 * v2 takes CUSTODY at `authorize`: the one signature the buyer gives moves the
 * plan's maximum from their wallet into the escrow contract, in that same
 * transaction. `settle` then pays each delivered step's operator out of it and
 * returns the unspent remainder to the buyer; `reclaim` lets the buyer take an
 * authorization back that was never settled, once it has expired. v1 did none
 * of this — its `authorize` recorded a cap and moved nothing — so every number
 * and sentence the console attaches to authorizing is decided here, against
 * the frozen v2 interface (contracts repo `docs/escrow-v2-interface.md`).
 */

/**
 * How long until a signed authorization EXPIRES, in seconds — the
 * `ttl_seconds` sent to `POST /stellar/build/authorize`, which stamps
 * `expires_at = now + ttl` into the authorization.
 *
 * Under escrow v2 the expiry is the point at which the buyer may take their
 * custody back: `reclaim` is refused before it (`Locked`) and allowed after.
 * `settle` is NOT cut off by it (interface amendment for finding S3) — a long
 * run can still pay the operators it used after expiry — but once the buyer
 * may reclaim, whichever of `settle` and `reclaim` lands first wins. So the
 * one number is a trade-off between the two parties the custody protects:
 *
 * - Too SHORT, and a slow run — a cold agent endpoint, an LLM retry, a
 *   settlement queued behind the seal — is still going when the buyer may
 *   reclaim, and a reclaim that lands first leaves operators who delivered
 *   unpaid. The backend also refuses to execute against an authorization
 *   whose remaining life cannot cover a worst-case run of the plan.
 * - Too LONG, and a run that never settles — and that the platform could not
 *   release automatically — keeps the buyer's funds locked for that long
 *   before they can reclaim them.
 *
 * The backend accepts 30–3600 s (`AuthorizeReq.ttl_seconds`). The worst case
 * it plans for is six steps at about 120 s each plus the settle — around 15
 * minutes — before the wallet prompt and cold starts are counted. 1800 s,
 * half an hour, covers that with margin and still frees a stuck authorization
 * the same afternoon. v1's 600 s dated from when an expiry only lapsed a cap;
 * under custody it is also the buyer's lock-up, so it is set here and nowhere
 * else.
 */
export const AUTHORIZE_TTL_SECONDS = 1800;

// ── can the wallet cover it? ─────────────────────────────────────

/**
 * The XLM every Stellar account must keep and can never spend: two base
 * reserves of 0.5 XLM. Each trustline, offer or extra signer adds another 0.5,
 * and the native balance Horizon reports does not say how many the wallet
 * has — so this is a FLOOR on what is locked, and a wallet near the line can
 * still be refused by the chain. That refusal is mapped too
 * (`classifyAuthorizeError`); the pre-check only catches the plain shortfall
 * before the buyer is asked to sign anything.
 */
export const BASE_RESERVE_STROOPS = 10_000_000n;

/**
 * Room left for the authorize transaction's own fee. A Soroban invoke that
 * moves one token balance costs a few hundredths of an XLM in inclusion and
 * resource fees on testnet; a tenth leaves margin without refusing a wallet
 * that can plainly pay.
 */
export const AUTHORIZE_FEE_HEADROOM_STROOPS = 1_000_000n;

/**
 * Whether the connected wallet can fund an authorization of `cap`.
 *
 * - `enough`: it can, as far as the balance shows.
 * - `short`: it cannot — `needed` is the cap plus the fee headroom plus the
 *   base reserve, `available` the native balance read.
 * - `unknown`: the balance has not been read (loading, failed, or not a
 *   number). Never treated as zero and never as enough; the chain decides.
 * - `not_native`: the escrow's token is not XLM, so the XLM balance says
 *   nothing about whether the cap can be moved.
 */
export type EscrowFunds =
  | { kind: "enough" }
  | { kind: "short"; needed: bigint; available: bigint }
  | { kind: "unknown" }
  | { kind: "not_native" };

export function checkEscrowFunds(input: {
  /** The wallet's native balance as Horizon reports it; null when unknown. */
  balance: string | null;
  /** The maximum the authorization moves into escrow, in stroops. */
  cap: bigint;
  /** What the escrow's SAC wraps, from GET /stellar/network; null until read. */
  asset: string | null | undefined;
}): EscrowFunds {
  const { balance, cap, asset } = input;
  // The unit is not known until the network read lands: say nothing rather
  // than compare a USDC cap against an XLM balance.
  if (!asset || !assetLabel(asset)) return { kind: "unknown" };
  if (asset !== "native") return { kind: "not_native" };
  if (balance === null) return { kind: "unknown" };
  // Horizon's balance is a 7-decimal string, read digit by digit: compared
  // in stroops, so 0.1 + 0.2 cannot refuse a wallet holding 0.3.
  const available = decimalToStroops(balance.trim());
  if (available === null) return { kind: "unknown" };
  const needed = cap + AUTHORIZE_FEE_HEADROOM_STROOPS + BASE_RESERVE_STROOPS;
  return available >= needed
    ? { kind: "enough" }
    : { kind: "short", needed, available };
}

// ── saying so ────────────────────────────────────────────────────

const TOP_UP = IS_MAINNET
  ? "Fund the wallet with XLM and try again."
  : "Top it up via Friendbot and try again.";

/** Exact, to the stroop, trailing zeros dropped: 1.223, never 1.2230000. */
const xlm = (stroops: bigint) => formatStroops(stroops, "native");

/**
 * The typed error for a wallet the pre-check found short. Raised before
 * anything is built or signed, so it says nothing moved — and it says why the
 * figure is more than the plan's price: under custody the whole maximum
 * leaves the wallet at signing, and the account has to keep its reserve and
 * pay the fee on top.
 */
export function insufficientEscrowFunds(
  funds: Extract<EscrowFunds, { kind: "short" }>,
): FriendlyError {
  return {
    kind: "insufficient_balance",
    title: "Not enough XLM to fund this authorization",
    detail:
      `Authorizing moves the plan's maximum into escrow as soon as you sign, ` +
      `so the wallet needs at least ${xlm(funds.needed)}: the maximum, about ` +
      `${xlm(AUTHORIZE_FEE_HEADROOM_STROOPS)} for the network fee, and the ` +
      `${xlm(BASE_RESERVE_STROOPS)} every account must keep. It holds ` +
      `${xlm(funds.available)}. Nothing was signed or moved. ${TOP_UP}`,
    raw: `escrow pre-check: needed ${funds.needed} stroops, available ${funds.available} stroops`,
  };
}

/**
 * What the chain says when the payer cannot fund the custody transfer.
 *
 * `authorize` calls the token's `transfer(payer → escrow)` inside the same
 * invocation, so a short wallet fails in the Stellar Asset Contract rather
 * than in the escrow: the SAC's `BalanceError` is contract error #10, worded
 * "balance is not sufficient to spend", and native XLM that would dip below
 * the reserve is refused as "resulting balance is not within the allowed
 * range". The escrow's own codes (1–9, 101, 102) have no #10, so the code is
 * unambiguous inside an authorize. The backend's diagnostic summary prints
 * that error as the Python SDK's XDR repr (`SCError [type=0,
 * contract_code=<Uint32 [uint32=10]>]`, type 0 being SCE_CONTRACT), so both
 * spellings are matched. A wallet that cannot pay the FEE is refused earlier,
 * by the network, with `tx_insufficient_balance`.
 */
const ESCROW_FUNDS_REFUSALS = [
  /balance is not sufficient/i,
  /resulting balance is not within the allowed range/i,
  /Error\(Contract, #10\)/,
  /SCError \[type=0, contract_code=<Uint32 \[uint32=10\]>/,
  /tx_insufficient_balance/i,
  /op_underfunded/i,
];

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "";
}

/**
 * A failure anywhere on the authorize path, classified for the buyer.
 *
 * Two refusals are specific to custody and read differently from the shared
 * wallet classifier's:
 *
 * - The chain refusing the transfer for want of funds (above) is an
 *   `insufficient_balance` that says what the funds were FOR.
 * - The backend's `build_failed` on `/stellar/build/authorize`. The backend
 *   simulates the transaction to prepare it, and under v2 a simulation that
 *   cannot move the maximum fails there — but the answer carries no reason,
 *   so the copy names the likely cause without claiming it.
 *
 * Everything else is `classifyError`'s, unchanged.
 */
export function classifyAuthorizeError(e: unknown): FriendlyError {
  const raw = messageOf(e);
  if (ESCROW_FUNDS_REFUSALS.some((re) => re.test(raw))) {
    return {
      kind: "insufficient_balance",
      title: "Not enough XLM to fund this authorization",
      detail:
        "The network refused to move the plan's maximum from your wallet into " +
        "escrow: the balance cannot cover it together with the fee and the " +
        `reserve every account keeps. Nothing was moved. ${TOP_UP}`,
      raw,
    };
  }
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code?: unknown }).code
      : undefined;
  if (code === "build_failed") {
    return {
      kind: "unknown",
      title: "The authorization could not be prepared",
      detail:
        "The backend could not build this authorization, so nothing was signed " +
        "or moved. Authorizing moves the plan's maximum into escrow, so the " +
        "most common cause is a wallet that cannot cover it plus the fee and " +
        "reserve — check your balance, then try again.",
      raw,
    };
  }
  return classifyError(e);
}
