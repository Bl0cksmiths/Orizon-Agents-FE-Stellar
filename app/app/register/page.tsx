"use client";

import { useState } from "react";
import {
  ApiError,
  agentIdAvailable,
  buildRegisterAgent,
  syncAgents,
} from "@/lib/api";
import {
  normalizeSkills,
  usdcToStroops,
  validateAgentId,
  validateName,
  validatePriceUsdc,
  validateSkills,
} from "@/lib/register-validation";
import { isAgentAlreadyExists } from "@/lib/register-submit";
import { signAndSubmit } from "@/lib/sign-submit";
import { buildRegistrationEvidence } from "@/lib/registration-evidence";
import { rateLimitMessage } from "@/lib/rate-limit-message";
import { getStellarNetwork } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useAsyncAction } from "@/lib/use-async-action";
import { useWallet } from "@/lib/wallet";
import { type FriendlyError } from "@/lib/wallet-errors";
import { focusRing, inlineLink } from "@/lib/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { ErrorNote } from "@/components/ui/error-note";
import { SkillsInput } from "@/components/ui/skills-input";
import { TxStatus, type TxState } from "@/components/ui/tx-status";
import {
  NETWORK_LABEL,
  StellarExpertLink,
  defaultExplorerNetwork,
} from "@/components/ui/stellar-link";

// The build endpoint speaks stable error codes (story 1.03). Map the ones a
// full form can hit to friendly copy; a code we don't recognise stays generic.
const FORM_LEVEL_ERRORS: Record<string, string> = {
  owner_account_unfunded: "Fund this wallet on testnet before registering.",
  id_taken: "That agent ID was just taken — pick another.",
  id_reserved: "That agent ID is reserved for the seeded catalog.",
  build_failed: "Could not build the transaction. Please try again.",
};

const inputCls = `mt-1.5 w-full bg-bg/60 border border-input p-3 font-mono text-sm placeholder:text-muted focus:border-violet transition disabled:opacity-50 ${focusRing}`;
const labelCls = "font-mono text-[10px] uppercase tracking-[0.22em] text-muted";

export default function RegisterPage() {
  const wallet = useWallet();
  const owner = wallet.address ?? "";

  // The evidence block and explorer links must name the chain the transaction
  // actually landed on — which is whatever the backend reports, not the
  // passphrase this bundle was built against. The two diverge during a network
  // flip, and this page is where the grant's evidence is captured. Falls back to
  // the build-time value only until the fetch resolves.
  const { data: networkInfo } = useFetch(getStellarNetwork, []);
  const liveNetwork = networkInfo?.network ?? defaultExplorerNetwork;
  const networkLabel = networkInfo?.network ?? NETWORK_LABEL;

  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [priceStr, setPriceStr] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const touch = (field: string) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));

  // Synchronous field validity — the async id-availability gate is added in a
  // follow-up. Errors only surface once a field has been touched.
  const idError = validateAgentId(agentId);
  const nameError = validateName(name);
  const skillsError = validateSkills(skills);
  const priceError = validatePriceUsdc(priceStr);

  const priceNum = Number(priceStr);
  const stroops =
    priceStr.trim() !== "" && !priceError ? usdcToStroops(priceNum) : null;

  // The submit runs the tx lifecycle by hand (not through useAsyncAction) so
  // the ApiError's stable `code` survives the build step and each stage can
  // drive the TxStatus machine. building → signing → broadcasting → pending →
  // success | failed.
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const submitting =
    txState === "building" ||
    txState === "signing" ||
    txState === "broadcasting" ||
    txState === "pending";

  // On-chain id availability, checked on blur once the id is locally valid.
  // useAsyncAction is race- and unmount-safe, so a slow check for an old id
  // can never overwrite a newer one. The result is reset on every keystroke,
  // so stale availability never leaks past an edit.
  const idCheck = useAsyncAction(agentIdAvailable);
  const idAvailable = idCheck.data?.available === true;
  const idUnavailableMsg =
    idCheck.data && !idCheck.data.available
      ? ((idCheck.data.reason === "id_taken"
          ? "Already registered — pick another id."
          : idCheck.data.message) ?? "That id is not available.")
      : null;

  function runIdCheck() {
    touch("agent_id");
    if (!validateAgentId(agentId)) idCheck.run(agentId);
  }

  const syncValid =
    !idError && !nameError && !skillsError && !priceError && owner !== "";
  // The button stays disabled until the id check has returned available —
  // never let an operator sign against an unverified id (story 1.04 rule).
  const canSubmit = syncValid && idAvailable && wallet.connected && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ agent_id: true, name: true, skills: true, price_usdc: true });
    setFormError(null);
    setTxError(null);
    setNotice(null);
    if (!canSubmit) return;

    // 1. Build the unsigned XDR. A duplicate/reserved id is caught here (the
    // build simulates), so it surfaces as a field-level form error, not a
    // failed transaction — the operator just changes the id, form intact.
    setTxState("building");
    let xdr: string;
    try {
      ({ xdr } = await buildRegisterAgent({
        owner,
        agent_id: agentId,
        name: name.trim(),
        skills: normalizeSkills(skills),
        price_usdc: priceNum,
      }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "id_taken" || code === "id_reserved") idCheck.reset();
      setFormError(
        rateLimitMessage(err) ??
          (code && FORM_LEVEL_ERRORS[code]) ??
          "Could not prepare the registration. Please try again.",
      );
      setTxState("idle");
      return;
    }

    // 2–5. Sign, submit and interpret through the shared sequence — the same
    // path agent management uses, so error handling can't drift — driving the
    // tx machine off the returned stage. onSigned advances signing → broadcasting.
    setTxState("signing");
    const r = await signAndSubmit(xdr, wallet.signXdr, {
      onSigned: () => setTxState("broadcasting"),
    });

    if (r.stage === "rejected") {
      // A declined prompt is a normal action — keep the form, stay neutral.
      setNotice(
        "Signing cancelled — your details are saved. Click Register when you're ready.",
      );
      setTxState("idle");
      return;
    }
    if (r.stage === "sign_error") {
      setTxError(r.error);
      setTxState("failed");
      return;
    }
    if (r.stage === "submit_error") {
      // A dropped network mid-submit may still have landed; never auto-retry.
      setTxError({
        kind: "unknown",
        title: "Submission interrupted",
        detail:
          "The network dropped while submitting. Your transaction may still have landed — check Stellar Expert for your agent before registering again.",
        raw: "",
      });
      setTxState("failed");
      return;
    }

    // settled — a FAILED tx still returns 200 + a hash.
    setTxHash(r.outcome.hash);
    if (!r.outcome.ok) {
      // A duplicate id reaches here only as a rare race (the build preflight
      // catches it first); recover to the form so the operator changes the id.
      if (isAgentAlreadyExists(r.result)) {
        idCheck.reset();
        setFormError(r.outcome.message);
        setTxState("idle");
        return;
      }
      setTxError({
        kind: "unknown",
        title: "Registration failed",
        detail: r.outcome.message,
        raw: r.result.diagnostic ?? r.result.status,
      });
      setTxState("failed");
      return;
    }

    // Confirmed. Index it so the marketplace shows it without a reload (the
    // submit endpoint already kicks a server-side sync on SUCCESS; awaiting
    // here is the deterministic belt-and-suspenders), then show the success card.
    setTxState("pending");
    try {
      await syncAgents();
    } catch {
      // ignore — the server already kicked a sync; the agents page refetches
    }
    setTxState("success");
  }

  // Capture the whole evidence bundle (id, owner, tx, both explorer links,
  // network, timestamp) in one click, at the moment of the run — story 1.07.
  async function copyEvidence() {
    if (!txHash) return;
    const block = buildRegistrationEvidence({
      agentId,
      owner,
      txHash,
      network: liveNetwork,
    });
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked — the tx hash and links stay visible above to copy
      // by hand; capture is never lost.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Register an Agent
          </h1>
          <p className="mt-1 text-sm text-muted">
            List your agent on Orizon — permissionless, no signup, on Stellar{" "}
            {networkLabel}. Your connected wallet is the owner.
          </p>
        </div>
        <ConnectWallet size="md" />
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
            ▸ agent details
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            owner ·{" "}
            {wallet.connected ? (
              <span className="text-text break-all" title={owner}>
                {owner.slice(0, 6)}…{owner.slice(-6)}
              </span>
            ) : (
              <span className="text-magenta">connect a wallet</span>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="reg-agent-id" className={labelCls}>
              agent id
            </label>
            <input
              id="reg-agent-id"
              value={agentId}
              onChange={(e) => {
                setAgentId(e.target.value);
                idCheck.reset();
              }}
              onBlur={runIdCheck}
              placeholder="weather_bot"
              spellCheck={false}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={Boolean(
                (touched.agent_id && idError) ||
                idUnavailableMsg ||
                idCheck.error,
              )}
              aria-describedby={
                (touched.agent_id && idError) ||
                idUnavailableMsg ||
                idCheck.error
                  ? "reg-agent-id-err"
                  : undefined
              }
              className={inputCls}
            />
            {touched.agent_id && idError ? (
              <ErrorNote
                id="reg-agent-id-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {idError}
              </ErrorNote>
            ) : idCheck.pending ? (
              <div className="mt-1 font-mono text-[11px] text-muted">
                ◉ checking availability…
              </div>
            ) : idCheck.error ? (
              <ErrorNote
                id="reg-agent-id-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ Couldn&apos;t check availability — try again.
              </ErrorNote>
            ) : idUnavailableMsg ? (
              <ErrorNote
                id="reg-agent-id-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {idUnavailableMsg}
              </ErrorNote>
            ) : idAvailable ? (
              <div className="mt-1 font-mono text-[11px] text-cyan">
                ✓ available
              </div>
            ) : (
              <div className="mt-1 font-mono text-[11px] text-muted">
                letters, digits and underscore · 1–32 chars
              </div>
            )}
          </div>

          <div>
            <label htmlFor="reg-name" className={labelCls}>
              display name
            </label>
            <input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => touch("name")}
              placeholder="Weather Bot"
              disabled={submitting}
              aria-invalid={Boolean(touched.name && nameError)}
              aria-describedby={
                touched.name && nameError ? "reg-name-err" : undefined
              }
              className={inputCls}
            />
            {touched.name && nameError ? (
              <ErrorNote
                id="reg-name-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {nameError}
              </ErrorNote>
            ) : null}
          </div>

          <div>
            <label htmlFor="reg-skills" className={labelCls}>
              skills
            </label>
            <div className="mt-1.5">
              <SkillsInput
                id="reg-skills"
                value={skills}
                onChange={setSkills}
                onBlur={() => touch("skills")}
                disabled={submitting}
                aria-invalid={Boolean(touched.skills && skillsError)}
                aria-describedby={
                  touched.skills && skillsError ? "reg-skills-err" : undefined
                }
              />
            </div>
            {touched.skills && skillsError ? (
              <ErrorNote
                id="reg-skills-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {skillsError}
              </ErrorNote>
            ) : (
              <div className="mt-1 font-mono text-[11px] text-muted">
                up to 16 · Enter or comma to add
              </div>
            )}
          </div>

          <div>
            <label htmlFor="reg-price" className={labelCls}>
              price per step (USDC)
            </label>
            <input
              id="reg-price"
              inputMode="decimal"
              value={priceStr}
              onChange={(e) =>
                setPriceStr(e.target.value.replace(/[^0-9.]/g, ""))
              }
              onBlur={() => touch("price_usdc")}
              placeholder="0.054"
              disabled={submitting}
              aria-invalid={Boolean(touched.price_usdc && priceError)}
              aria-describedby={
                touched.price_usdc && priceError ? "reg-price-err" : undefined
              }
              className={inputCls}
            />
            {touched.price_usdc && priceError ? (
              <ErrorNote
                id="reg-price-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {priceError}
              </ErrorNote>
            ) : (
              <div className="mt-1 font-mono text-[11px] text-muted">
                {stroops !== null
                  ? `= ${stroops.toLocaleString()} stroops on-chain`
                  : "entered in USDC, converted once at submit"}
              </div>
            )}
          </div>

          {formError ? <ErrorNote>{formError}</ErrorNote> : null}
          {notice ? (
            <div className="font-mono text-[11px] text-muted">{notice}</div>
          ) : null}

          <TxStatus
            state={txState}
            hash={txHash ?? undefined}
            error={txError}
          />

          {txState === "success" ? (
            <div className="border border-cyan/30 bg-cyan/5 p-4 space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
                ▸ next step
              </div>
              <p className="text-sm text-text">
                <b className="font-mono">{agentId}</b> is registered on-chain by{" "}
                <StellarExpertLink
                  kind="account"
                  id={owner}
                  network={liveNetwork}
                  className={`font-mono ${inlineLink}`}
                >
                  {owner.slice(0, 4)}…{owner.slice(-4)}
                </StellarExpertLink>
                . Bind an execution endpoint (story 2.05) so it can take work —
                or see it in the marketplace now.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ButtonLink variant="cyan" size="sm" href="/app/agents">
                  View in marketplace ▸
                </ButtonLink>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyEvidence}
                >
                  {copied ? "✓ evidence copied" : "⧉ copy evidence"}
                </Button>
              </div>
              <p className="font-mono text-[10px] leading-relaxed text-muted">
                Copy evidence grabs the agent id, wallet, tx hash and both
                stellar.expert links for the evidence index (stories 1.07 /
                5.05).
              </p>
            </div>
          ) : null}

          {txState === "success" ? null : (
            <div className="flex items-center gap-3 pt-1">
              <Button
                type="submit"
                variant="cyan"
                size="md"
                disabled={!canSubmit}
              >
                {submitting ? "◉ Working…" : "Register agent ▸"}
              </Button>
              {!wallet.connected ? (
                <span className="font-mono text-[11px] text-muted">
                  connect a wallet to register
                </span>
              ) : null}
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
