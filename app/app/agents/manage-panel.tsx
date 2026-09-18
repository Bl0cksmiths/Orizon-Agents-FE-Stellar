"use client";

import { useState } from "react";
import {
  ApiError,
  buildSetActive,
  buildUpdatePrice,
  syncAgents,
} from "@/lib/api";
import { signAndSubmit } from "@/lib/sign-submit";
import { usdcToStroops, validatePriceUsdc } from "@/lib/register-validation";
import { rateLimitMessage } from "@/lib/rate-limit-message";
import { isListed } from "@/lib/routability";
import { useWallet } from "@/lib/wallet";
import { type FriendlyError } from "@/lib/wallet-errors";
import { focusRing } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { TxStatus, type TxState } from "@/components/ui/tx-status";
import type { Agent, XdrResponse } from "@/lib/types";

// Build errors the operator can act on; an unknown code stays generic. Mirrors
// the registration form's mapping so error handling reads the same everywhere.
const BUILD_ERRORS: Record<string, string> = {
  agent_not_found: "This agent is no longer registered on-chain.",
  owner_account_unfunded: "Fund this wallet on testnet before making changes.",
  build_failed: "Could not build the transaction. Please try again.",
};

const inputCls = `mt-1.5 w-full bg-bg/60 border border-input p-2.5 font-mono text-sm placeholder:text-muted focus:border-violet transition disabled:opacity-50 ${focusRing}`;
const labelCls = "font-mono text-[10px] uppercase tracking-[0.22em] text-muted";

export function ManagePanel({
  agent,
  owner,
  onChanged,
}: {
  agent: Agent;
  owner: string;
  onChanged: () => void;
}) {
  const wallet = useWallet();
  const [priceStr, setPriceStr] = useState(agent.price.toFixed(3));
  const [confirmingDelist, setConfirmingDelist] = useState(false);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<FriendlyError | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submitting =
    txState === "building" ||
    txState === "signing" ||
    txState === "broadcasting" ||
    txState === "pending";

  // A delisted agent syncs back as status "offline" (registry_sync maps
  // active → online/offline); anything else is currently listed. The shared
  // predicate, so this control and every routing surface agree on the rule.
  const listed = isListed(agent);

  const priceError = validatePriceUsdc(priceStr);
  const priceNum = Number(priceStr);
  const stroops =
    priceStr.trim() !== "" && !priceError ? usdcToStroops(priceNum) : null;
  const priceUnchanged = !priceError && Math.abs(priceNum - agent.price) < 1e-9;

  // Build → sign → submit → interpret through the SAME shared sequence the
  // registration form uses, so a second, subtly different signing path can
  // never drift. The caller only supplies the build and a success label.
  async function run(build: () => Promise<XdrResponse>, doneLabel: string) {
    setFormError(null);
    setTxError(null);
    setNotice(null);
    setDone(null);

    setTxState("building");
    let xdr: string;
    try {
      ({ xdr } = await build());
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setFormError(
        rateLimitMessage(err) ??
          (code && BUILD_ERRORS[code]) ??
          "Could not prepare the change. Please try again.",
      );
      setTxState("idle");
      return;
    }

    setTxState("signing");
    const r = await signAndSubmit(xdr, wallet.signXdr, {
      onSigned: () => setTxState("broadcasting"),
    });

    if (r.stage === "rejected") {
      setNotice("Signing cancelled — nothing changed.");
      setTxState("idle");
      return;
    }
    if (r.stage === "sign_error") {
      setTxError(r.error);
      setTxState("failed");
      return;
    }
    if (r.stage === "submit_error") {
      setTxError({
        kind: "unknown",
        title: "Submission interrupted",
        detail:
          "The network dropped while submitting. Your change may still have landed — check Stellar Expert before trying again.",
        raw: "",
      });
      setTxState("failed");
      return;
    }

    setTxHash(r.outcome.hash);
    if (!r.outcome.ok) {
      setTxError({
        kind: "unknown",
        title: "Change failed",
        detail: r.outcome.message,
        raw: r.result.diagnostic ?? r.result.status,
      });
      setTxState("failed");
      return;
    }

    // Confirmed. Refresh the marketplace so the row reflects the change now,
    // rather than at the next scheduled sync.
    setTxState("pending");
    try {
      await syncAgents();
    } catch {
      // ignore — the server already kicked a sync; the page refetches
    }
    setTxState("success");
    setDone(doneLabel);
    onChanged();
  }

  function changePrice() {
    if (priceError || priceUnchanged || submitting) return;
    void run(
      () =>
        buildUpdatePrice({ owner, agent_id: agent.id, price_usdc: priceNum }),
      `Price updated to ${priceNum.toFixed(3)} USDC.`,
    );
  }

  function setActive(active: boolean) {
    setConfirmingDelist(false);
    void run(
      () => buildSetActive({ owner, agent_id: agent.id, active }),
      active ? "Agent relisted." : "Agent delisted.",
    );
  }

  return (
    <div className="border border-border/60 bg-bg/40 p-4">
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Change price */}
        <div>
          <label htmlFor={`price-${agent.id}`} className={labelCls}>
            New price · current {agent.price.toFixed(3)} USDC
          </label>
          <input
            id={`price-${agent.id}`}
            className={inputCls}
            inputMode="decimal"
            value={priceStr}
            disabled={submitting}
            onChange={(e) => setPriceStr(e.target.value)}
            aria-invalid={priceError ? true : undefined}
          />
          <div className="mt-1 font-mono text-[10px] text-muted">
            {priceError
              ? priceError
              : stroops !== null
                ? `${stroops.toLocaleString()} stroops`
                : " "}
          </div>
          <Button
            variant="cyan"
            size="sm"
            className="mt-2"
            disabled={!!priceError || priceUnchanged || submitting}
            onClick={changePrice}
          >
            Update price
          </Button>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted">
            A price change applies to future plans only. A buyer who already
            authorized a workflow is charged the price they signed against.
          </p>
        </div>

        {/* Listing status */}
        <div>
          <span className={labelCls}>
            Listing · {listed ? "listed" : "delisted"}
          </span>
          {listed ? (
            confirmingDelist ? (
              <div className="mt-1.5">
                {/* The previous wording here — "delisting stops new work
                    being routed to this agent" — was false. The planner builds
                    its candidate list from `is_dispatchable` and the
                    reputation floor and never reads the active flag, so a
                    delisted agent is still offered work. An operator who
                    delisted to take their service down and believed that
                    sentence would have left a live endpoint answering jobs.
                    Until the orchestrator honours the flag, this says what
                    delisting actually does. */}
                <p className="font-mono text-[11px] leading-relaxed text-text">
                  Delisting marks the agent inactive on-chain and shows it as
                  offline in the registry. It does not currently stop the
                  orchestrator offering work to your endpoint — the planner does
                  not read the listing flag yet — so take the endpoint itself
                  down if you need work to stop. In-flight authorized work is
                  unaffected, and your reputation and history are retained. You
                  can relist any time.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setActive(false)}
                  >
                    Confirm delist
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setConfirmingDelist(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setConfirmingDelist(true)}
                >
                  Delist
                </Button>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted">
                  Delisting is reversible and never a delete — history and
                  reputation survive.
                </p>
              </div>
            )
          ) : (
            <div className="mt-1.5">
              <Button
                variant="cyan"
                size="sm"
                disabled={submitting}
                onClick={() => setActive(true)}
              >
                Relist
              </Button>
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted">
                Relisting makes the agent routable in new plans again.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Shared status surface */}
      {(txState !== "idle" || formError || notice || done) && (
        <div className="mt-4 space-y-2">
          <TxStatus
            state={txState}
            hash={txHash ?? undefined}
            error={txError}
          />
          {done && txState === "success" && (
            <p className="font-mono text-xs text-cyan">{done}</p>
          )}
          {notice && <p className="font-mono text-xs text-muted">{notice}</p>}
          {formError && <ErrorNote>{formError}</ErrorNote>}
        </div>
      )}
    </div>
  );
}
