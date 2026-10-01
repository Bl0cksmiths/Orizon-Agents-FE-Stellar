"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { ErrorNote } from "@/components/ui/error-note";
import { TxStatus, type TxState } from "@/components/ui/tx-status";
import { HORIZON_URL, NETWORK_PASSPHRASE, useWallet } from "@/lib/wallet";
import { classifyError, type FriendlyError } from "@/lib/wallet-errors";
import { NETWORK_LABEL } from "@/components/ui/stellar-link";
import { focusRing } from "@/lib/ui";

// Display label for the configured network — "mainnet" | "testnet".
// stellar-sdk's BASE_FEE ("100" stroops) — inlined so the render path doesn't
// need the SDK loaded.
const BASE_FEE_STROOPS = "100";

function isValidGAddress(s: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(s.trim());
}

function trimMemo(m: string): string {
  // Memo.text is up to 28 bytes UTF-8.
  let s = m;
  while (new TextEncoder().encode(s).length > 28) {
    s = s.slice(0, -1);
  }
  return s;
}

export default function SendPage() {
  const wallet = useWallet();

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<{
    amount: string;
    destination: string;
    memo: string | null;
  } | null>(null);
  const [err, setErr] = useState<FriendlyError | null>(null);

  const submitting =
    txState !== "idle" && txState !== "success" && txState !== "failed";

  // null = the balance is *unknown* (loading, failed, or malformed), never
  // "zero". Horizon returning garbage must not read as a spendable number.
  const parsedBalance =
    wallet.xlmBalance === null ? NaN : parseFloat(wallet.xlmBalance);
  const balanceNum = Number.isFinite(parsedBalance) ? parsedBalance : null;
  const amountNum = amount ? parseFloat(amount) : NaN;
  // The fetch finished and failed — distinct from "still loading", which must
  // not flash a red box on first paint. The wallet keeps the previous error
  // while a retry is in flight, so this frame stays put for the whole
  // recovery instead of alternating with the neutral "checking…" state.
  const balanceUnavailable =
    balanceNum === null && wallet.balanceError !== null;
  // A recheck *after* a failure is still a failure until it resolves: the
  // balance is unknown, the send stays blocked, and the surface stays red.
  const balanceRechecking = balanceUnavailable && wallet.balanceLoading;

  const validation = useMemo(() => {
    if (!destination) return "destination required";
    if (!isValidGAddress(destination))
      return "destination must be a 56-char G… address";
    if (wallet.address && destination.trim() === wallet.address) {
      return "destination cannot be your own address";
    }
    if (!amount) return "amount required";
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return "amount must be > 0";
    // An unverifiable balance BLOCKS the send. This guard used to be skipped
    // whenever the balance fetch failed, so a downed Horizon turned the
    // affordability check off and the user only learned the payment was
    // unaffordable after signing it.
    if (balanceNum === null) {
      // Once the balance has failed, a recheck does not soften the block —
      // saying "checking…" again would read like a fresh, healthy load.
      if (wallet.balanceError !== null) {
        return wallet.balanceLoading
          ? "balance unavailable — rechecking with Horizon…"
          : "balance unavailable — cannot verify this payment is affordable";
      }
      return wallet.balanceLoading
        ? "checking your balance…"
        : "balance unavailable — cannot verify this payment is affordable";
    }
    if (amountNum > balanceNum - 0.0001) {
      return `amount exceeds balance (${balanceNum.toFixed(4)} XLM available)`;
    }
    return null;
  }, [
    destination,
    amount,
    amountNum,
    balanceNum,
    wallet.address,
    wallet.balanceLoading,
    wallet.balanceError,
  ]);

  const send = async () => {
    if (!wallet.connected || !wallet.address) return;
    if (validation) return;

    setErr(null);
    setTxHash(null);
    setLastSent(null);

    try {
      setTxState("building");
      // Lazy-load the (large) stellar-sdk on first send so it stays out of
      // the initial page bundle.
      const { Asset, Horizon, Memo, Operation, TransactionBuilder } =
        await import("@stellar/stellar-sdk");
      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(wallet.address);

      const memoTrimmed = memo.trim() ? trimMemo(memo.trim()) : "";
      const builder = new TransactionBuilder(account, {
        fee: BASE_FEE_STROOPS,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.payment({
            destination: destination.trim(),
            asset: Asset.native(),
            amount: amountNum.toFixed(7),
          }),
        )
        .setTimeout(60);

      const tx = (
        memoTrimmed ? builder.addMemo(Memo.text(memoTrimmed)) : builder
      ).build();

      setTxState("signing");
      const signedXdr = await wallet.signXdr(tx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      setTxState("broadcasting");
      const signedTx = TransactionBuilder.fromXDR(
        signedXdr,
        NETWORK_PASSPHRASE,
      );
      // Brief "pending" frame so users see the lifecycle stage explicitly.
      setTxState("pending");
      const result = await server.submitTransaction(signedTx);

      setTxHash(result.hash);
      setLastSent({
        amount: `${amountNum.toFixed(7)} XLM`,
        destination: destination.trim(),
        memo: memoTrimmed || null,
      });
      setTxState("success");
      setDestination("");
      setAmount("");
      setMemo("");
      wallet.refreshBalance();
    } catch (e: unknown) {
      setErr(classifyError(e));
      setTxState("failed");
    }
  };

  const reset = () => {
    setTxState("idle");
    setTxHash(null);
    setErr(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Send XLM</h1>
          <p className="mt-1 text-sm text-muted">
            Plain Stellar payment — sign with any supported wallet, broadcast
            through Horizon {NETWORK_LABEL}.
          </p>
        </div>
        <ConnectWallet size="md" />
      </div>

      {!wallet.connected && (
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-1">
                ▸ wallet required
              </div>
              <div className="text-sm">
                Connect a Stellar wallet on{" "}
                <b className="text-text">{NETWORK_LABEL}</b> to send a payment.
              </div>
            </div>
            <ConnectWallet size="md" />
          </div>
        </Card>
      )}

      {wallet.connected && (
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
              ▸ payment
            </div>
            <Badge tone="cyan" dot>
              {NETWORK_LABEL}
            </Badge>
          </div>

          {balanceUnavailable && (
            <ErrorNote
              className="clip-cyber-sm mb-5"
              onRetry={() => void wallet.refreshBalance()}
              retrying={balanceRechecking}
            >
              ⚠ balance unavailable — {wallet.balanceError}. Sending is blocked
              until Horizon confirms what you can afford.
            </ErrorNote>
          )}

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="send-destination"
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted"
                >
                  destination
                </label>
                <input
                  id="send-destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="G… 56 chars"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={submitting}
                  aria-invalid={Boolean(validation?.startsWith("destination"))}
                  aria-describedby={validation ? "send-validation" : undefined}
                  className={`mt-1.5 w-full bg-bg/60 border border-input p-3 font-mono text-sm placeholder:text-muted focus:border-violet transition disabled:opacity-50 ${focusRing}`}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr,1fr]">
                <div>
                  <label
                    htmlFor="send-amount"
                    className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted"
                  >
                    amount (XLM)
                  </label>
                  <input
                    id="send-amount"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="1.0000000"
                    inputMode="decimal"
                    disabled={submitting}
                    className={`mt-1.5 w-full bg-bg/60 border border-input p-3 font-mono text-sm placeholder:text-muted focus:border-violet transition disabled:opacity-50 ${focusRing}`}
                  />
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
                    <span>
                      available:{" "}
                      {balanceNum === null ? (
                        <span
                          className={
                            wallet.balanceLoading && !balanceUnavailable
                              ? "text-muted"
                              : "text-magenta"
                          }
                        >
                          {balanceRechecking
                            ? "rechecking…"
                            : wallet.balanceLoading
                              ? "checking…"
                              : "unknown"}
                        </span>
                      ) : (
                        <span className="text-cyan">
                          {balanceNum.toFixed(4)} XLM
                        </span>
                      )}
                    </span>
                    {balanceNum !== null && balanceNum > 1 && (
                      <button
                        type="button"
                        onClick={() => setAmount("1")}
                        // 24px tall (WCAG 2.5.8): the bare label was 15px.
                        className={`inline-flex min-h-6 items-center hover:text-text transition ${focusRing}`}
                      >
                        ▸ 1 XLM
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="send-memo"
                    className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted"
                  >
                    memo (optional · ≤28 bytes)
                  </label>
                  <input
                    id="send-memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="Yellow Belt"
                    maxLength={28}
                    disabled={submitting}
                    className={`mt-1.5 w-full bg-bg/60 border border-input p-3 font-mono text-sm placeholder:text-muted focus:border-violet transition disabled:opacity-50 ${focusRing}`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
              {validation ? (
                <ErrorNote
                  id="send-validation"
                  className="border-0 bg-transparent p-0 text-[11px]"
                >
                  ⚠ {validation}
                </ErrorNote>
              ) : (
                <div className="font-mono text-[11px] text-muted">
                  ready · base fee {BASE_FEE_STROOPS} stroops · timeout 60s
                </div>
              )}
              <div className="flex gap-2">
                {(txState === "success" || txState === "failed") && (
                  <Button
                    variant="outline"
                    size="md"
                    type="button"
                    onClick={reset}
                  >
                    reset
                  </Button>
                )}
                <Button
                  variant="cyan"
                  size="md"
                  type="submit"
                  disabled={Boolean(validation) || submitting}
                >
                  {submitting
                    ? txState === "building"
                      ? "◉ Building…"
                      : txState === "signing"
                        ? "◉ Wallet…"
                        : txState === "broadcasting"
                          ? "◉ Broadcasting…"
                          : "◉ Pending…"
                    : "Send XLM ▸"}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <TxStatus
        state={txState}
        hash={txHash ?? undefined}
        amount={lastSent?.amount}
        destination={lastSent?.destination}
        memo={lastSent?.memo}
        error={err}
      />
    </div>
  );
}
