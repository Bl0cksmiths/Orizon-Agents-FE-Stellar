"use client";
/**
 * The buyer's Reclaim control for an escrow v2 authorization that no
 * settlement took over.
 *
 * Offered only where this session holds the authorization id — the plan card
 * after a refused run, and the trace receipt of a run whose settlement failed
 * — and only once `expires_at` has passed: before then the contract refuses
 * with `Locked`, and a button that can only fail is worse than a time. So
 * until then it says when reclaim opens, and it re-reads the clock itself so
 * the button appears on time without a reload.
 *
 * The outcome is announced in a polite live region. "Already settled" and
 * "already reclaimed" are answers, not failures: the platform releases held
 * funds itself wherever it can, and a buyer who presses Reclaim after it did
 * is told their money is already back.
 */

import { useEffect, useId, useState } from "react";

import { formatLocalTime } from "@/components/disputes/window-state";
import { Button } from "@/components/ui/button";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import type { HeldAuthorization } from "@/lib/held-authorizations";
import { reclaimAuthorization, type ReclaimResult } from "@/lib/reclaim";
import { useWallet } from "@/lib/wallet";

/** How often the closed state re-reads the clock. The opening time is shown
 *  to the minute, so nothing finer can change what the buyer reads. */
const TICK_MS = 30_000;

/** "in about 12 minutes" — whole minutes, rounded up, never "0 minutes". */
function inAbout(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function outcomeSentence(result: ReclaimResult): string {
  switch (result.kind) {
    case "reclaimed":
      return "Reclaimed: the whole authorization is back in the wallet that paid.";
    case "declined":
      return "You declined the signature, so nothing was sent. You can reclaim whenever you are ready.";
    case "not_yet":
      return "The escrow says this authorization has not expired yet, so it cannot be reclaimed. Try again after the time shown.";
    case "already_settled":
      return "Nothing to reclaim: a settlement already took this authorization over, paying any delivered steps and returning the rest to the wallet that paid.";
    case "already_reclaimed":
      return "Nothing to reclaim: this authorization was already reclaimed, and its funds are back in the wallet that paid.";
    case "unavailable":
      return "Reclaim is not available from the console yet: the backend has no route to build the transaction. The escrow still allows it — see how to reclaim it directly.";
    case "nothing_held":
      return "Nothing to reclaim: this escrow takes no custody at authorization, so no funds left the wallet that paid.";
    case "failed":
      return `The reclaim did not go through. ${result.error.title}: ${result.error.detail}`;
  }
}

export function ReclaimControl({
  held,
  amount,
}: {
  held: HeldAuthorization;
  /** What the authorization holds, with its unit, when the page knows it. */
  amount?: string;
}): JSX.Element {
  const wallet = useWallet();
  const statusId = useId();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [phase, setPhase] = useState<"idle" | "signing" | "broadcasting">(
    "idle",
  );
  const [result, setResult] = useState<ReclaimResult | null>(null);

  const opensAtMs = held.expiresAt === null ? null : held.expiresAt * 1_000;
  const open = opensAtMs === null || nowMs >= opensAtMs;

  // Wakes at the opening moment itself, or every TICK_MS before it, so the
  // countdown moves and the button appears on time. Nothing ticks once open.
  useEffect(() => {
    if (opensAtMs === null || nowMs >= opensAtMs) return;
    const timer = setTimeout(
      () => setNowMs(Date.now()),
      Math.min(opensAtMs - nowMs + 250, TICK_MS),
    );
    return () => clearTimeout(timer);
  }, [opensAtMs, nowMs]);

  const isPayer = wallet.connected && wallet.address === held.payer;
  // A final answer ends the offer: there is nothing left to press for.
  const finished =
    result !== null &&
    (result.kind === "reclaimed" ||
      result.kind === "already_settled" ||
      result.kind === "already_reclaimed" ||
      result.kind === "nothing_held" ||
      result.kind === "unavailable");

  const run = async () => {
    if (phase !== "idle" || !isPayer) return;
    setResult(null);
    setPhase("signing");
    const outcome = await reclaimAuthorization({
      payer: held.payer,
      authIdHex: held.authIdHex,
      signXdr: (xdr) => wallet.signXdr(xdr),
      onSigned: () => setPhase("broadcasting"),
    });
    setPhase("idle");
    setResult(outcome);
    if (outcome.kind === "not_yet") setNowMs(Date.now());
    if (outcome.kind === "reclaimed") void wallet.refreshBalance();
  };

  return (
    <div className="space-y-2">
      {!open && opensAtMs !== null ? (
        <p className="text-sm leading-relaxed text-muted">
          Reclaim opens at{" "}
          <b className="text-text">{formatLocalTime(opensAtMs)}</b> (
          {inAbout(opensAtMs - nowMs)}), when the authorization expires. Until
          then the escrow keeps it for a settlement that may still pay the steps
          that delivered.
        </p>
      ) : finished ? null : !isPayer ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm leading-relaxed text-muted">
            {wallet.connected
              ? "The connected wallet is not the one that paid. Only the paying wallet can reclaim:"
              : "Connect the wallet that paid to reclaim:"}{" "}
            <span className="break-all font-mono text-[11px] text-text">
              {held.payer}
            </span>
          </p>
          {!wallet.connected && <ConnectWallet size="sm" />}
        </div>
      ) : (
        <Button
          type="button"
          variant="cyan"
          size="sm"
          onClick={() => void run()}
          disabled={phase !== "idle"}
          aria-describedby={statusId}
        >
          {phase === "signing"
            ? "◉ Sign in wallet…"
            : phase === "broadcasting"
              ? "◉ Reclaiming…"
              : `Reclaim ${amount ?? "held funds"} ▸`}
        </Button>
      )}
      {/* Always mounted, so a result is announced when it arrives rather
          than read out as new content on a region that just appeared. */}
      <p
        id={statusId}
        role="status"
        className="text-xs leading-relaxed text-muted"
      >
        {result ? outcomeSentence(result) : null}
        {result?.kind === "reclaimed" && (
          <>
            {" "}
            <StellarExpertLink
              kind="tx"
              id={result.hash}
              className="inline-flex min-h-6 items-center gap-[1ch]"
            >
              view reclaim on stellar.expert
              <span aria-hidden="true"> ▸</span>
            </StellarExpertLink>
          </>
        )}
      </p>
    </div>
  );
}
