"use client";

/**
 * Bind an execution endpoint to an owned agent (story 2.01).
 *
 * The operator names an agent and an HTTPS endpoint; the registry answers with
 * a challenge; the wallet that owns the agent signs it; the signature is
 * presented back and the endpoint is bound. Re-binding is a first-class
 * action, not an error — it re-points a live agent, which is why the current
 * binding is shown before anything is signed and the button says "Replace".
 *
 * Architecturally this is the register form's sibling: the same async-action
 * hooks, the same inline-validation-then-sign shape, the same shared
 * primitives. Everything pure — URL normalization, expiry arithmetic, the
 * error-code → placement mapping — lives in lib/bind-ui.ts and is unit-tested
 * there; what is left here is state and markup.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  bindAgent,
  checkBindEndpoint,
  createBindChallenge,
  getAgentBindingOrNull,
  listAgents,
} from "@/lib/api";
import {
  bindErrorView,
  bindPhaseMessage,
  challengeExpiresAtMs,
  endpointRefusalText,
  formatBoundAt,
  formatValidity,
  isBindBusy,
  isChallengeExpired,
  normalizeEndpointUrl,
  secondsRemaining,
  validateEndpointUrl,
  type BindErrorView,
  type BindPhase,
} from "@/lib/bind-ui";
import { TRUST_BOUNDARY } from "@/lib/binding-status";
import { validateAgentId } from "@/lib/register-validation";
import { useAsyncAction } from "@/lib/use-async-action";
import { useFetch } from "@/lib/use-fetch";
import { useWallet } from "@/lib/wallet";
import { classifyError, type FriendlyError } from "@/lib/wallet-errors";
import { focusRing, inlineLink } from "@/lib/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { ErrorNote } from "@/components/ui/error-note";
import { KVRow } from "@/components/ui/kv-row";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import type { AgentBinding, BindChallenge } from "@/lib/types";

const inputCls = `mt-1.5 w-full bg-bg/60 border border-input p-3 font-mono text-sm placeholder:text-muted focus:border-violet transition disabled:opacity-50 ${focusRing}`;
const labelCls = "font-mono text-[10px] uppercase tracking-[0.22em] text-muted";
const hintCls = "mt-1 font-mono text-[11px] text-muted";

/** How long the operator has to stop typing before a field is checked against
 * the backend. Long enough that a typed-out URL costs one request, short
 * enough that the verdict lands before they reach for the button. */
const CHECK_DEBOUNCE_MS = 400;

function shortG(g: string): string {
  return g.length <= 12 ? g : `${g.slice(0, 6)}…${g.slice(-6)}`;
}

function BindPageInner() {
  const wallet = useWallet();
  const owner = wallet.address ?? "";

  // The agent handed over by whoever sent the operator here — the registration
  // success card and the marketplace's bind links both build this URL with
  // `bindHref`, so an id that was just watched onto the chain is never retyped
  // from memory. Read once, as a seed: this is a form field, and the operator
  // has to stay free to edit or clear it. (Nothing routes from one ?agent= to
  // another without leaving the page, so there is no re-seed to get wrong.)
  const handedOffAgentId = useSearchParams().get("agent") ?? "";

  const [agentId, setAgentId] = useState(handedOffAgentId);
  const [endpointRaw, setEndpointRaw] = useState("");
  // A handed-off id arrives already in the field, so it can never be blurred —
  // count it touched from the start or a malformed one would sit there
  // unremarked until the operator poked a field they had no reason to poke.
  const [touched, setTouched] = useState<Record<string, boolean>>(
    handedOffAgentId === "" ? {} : { agent_id: true },
  );
  const touch = (field: string) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));

  const agentIdError = validateAgentId(agentId);
  const endpointSyntaxError = validateEndpointUrl(endpointRaw);
  const endpointUrl = normalizeEndpointUrl(endpointRaw);

  // The agents this wallet owns on-chain, offered as one-click fills. Purely
  // best-effort: a failed read is silent, because the id field works on its
  // own and a banner about a convenience would only be noise.
  const { data: agents } = useFetch(listAgents, []);
  const ownedAgents = useMemo(
    () =>
      owner === "" || !agents
        ? []
        : agents.filter((a) => a.owner === owner).slice(0, 8),
    [agents, owner],
  );

  // ── Inline endpoint preflight ────────────────────────────────
  // The backend applies its policy without opening a connection, so a refused
  // URL becomes a field hint naming the rule instead of a bare 422 that only
  // arrives after the operator has signed.
  const {
    run: runEndpointCheck,
    reset: resetEndpointCheck,
    data: endpointVerdict,
    pending: endpointChecking,
    error: endpointCheckFailed,
  } = useAsyncAction(checkBindEndpoint);

  useEffect(() => {
    resetEndpointCheck();
    if (endpointSyntaxError !== null) return;
    const timer = setTimeout(() => {
      void runEndpointCheck(endpointUrl);
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [endpointUrl, endpointSyntaxError, runEndpointCheck, resetEndpointCheck]);

  // ── Current binding ──────────────────────────────────────────
  // `getAgentBindingOrNull` so an agent that has never been bound — where every
  // agent starts — reads as the ordinary state it is rather than an error.
  const {
    run: lookUpBinding,
    reset: resetBindingLookup,
    data: currentBinding,
    pending: bindingLoading,
    error: bindingLookupFailed,
  } = useAsyncAction(getAgentBindingOrNull);

  useEffect(() => {
    resetBindingLookup();
    if (agentIdError !== null) return;
    const timer = setTimeout(() => {
      void lookUpBinding(agentId);
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [agentId, agentIdError, lookUpBinding, resetBindingLookup]);

  // ── The bind sequence ────────────────────────────────────────
  const [phase, setPhase] = useState<BindPhase>("idle");
  const [challenge, setChallenge] = useState<{
    value: BindChallenge;
    expiresAtMs: number;
  } | null>(null);
  const [result, setResult] = useState<AgentBinding | null>(null);
  const [errorView, setErrorView] = useState<BindErrorView | null>(null);
  const [walletError, setWalletError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set from an ApiError's Retry-After: the submit stays disabled for exactly
  // as long as the limiter asked, rather than spending another request to be
  // told the same thing.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(0);

  const busy = isBindBusy(phase);
  const challengeExpiresAt = challenge?.expiresAtMs ?? null;

  // One 1s ticker drives both the challenge countdown and the rate-limit
  // cooldown, and stops itself the moment neither is live — `ticking` goes
  // false as soon as the last deadline passes.
  const ticking =
    (challengeExpiresAt !== null && Number.isFinite(challengeExpiresAt)) ||
    cooldownUntil > nowMs;
  useEffect(() => {
    if (!ticking) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const cooldownSeconds =
    cooldownUntil > nowMs ? Math.ceil((cooldownUntil - nowMs) / 1_000) : 0;
  const validityLabel =
    challengeExpiresAt === null
      ? ""
      : formatValidity(secondsRemaining(challengeExpiresAt, nowMs));

  const endpointRefused = endpointVerdict?.allowed === false;
  // The preflight is advisory, so only an explicit refusal blocks: when the
  // check itself failed, the bind attempt is still allowed through and the
  // backend gets the final word. Blocking on an unavailable adviser would make
  // one flaky endpoint disable the whole screen.
  const canSubmit =
    agentIdError === null &&
    endpointSyntaxError === null &&
    !endpointRefused &&
    !endpointChecking &&
    wallet.connected &&
    !busy &&
    cooldownSeconds === 0 &&
    phase !== "success";

  function fail(err: unknown) {
    const view = bindErrorView(err);
    setErrorView(view);
    if (view.retryAfterMs !== undefined) {
      setCooldownUntil(Date.now() + view.retryAfterMs);
      setNowMs(Date.now());
    }
    setPhase("idle");
  }

  /**
   * The whole sequence: challenge → wallet signature → bind. Separate from the
   * form handler so the error banner's retry runs exactly the same path rather
   * than a second, subtly different one.
   */
  async function runBind() {
    setTouched({ agent_id: true, endpoint_url: true });
    setErrorView(null);
    setWalletError(null);
    setNotice(null);
    if (!canSubmit) return;

    // 1. Ask the registry for the exact string to sign. Every attempt starts
    // from a fresh challenge, so a retry is never a doomed replay of a nonce
    // that has already been spent or expired.
    setPhase("challenging");
    let issued: BindChallenge;
    try {
      issued = await createBindChallenge(agentId, endpointUrl);
    } catch (err) {
      fail(err);
      return;
    }
    const expiresAtMs = challengeExpiresAtMs(issued, Date.now());
    setChallenge({ value: issued, expiresAtMs });
    setNowMs(Date.now());

    // 2. The wallet signs the message VERBATIM — never a locally rebuilt one,
    // since the backend embeds its own normalization of the URL.
    setPhase("awaiting_signature");
    let signature: string;
    try {
      signature = await wallet.signMessage(issued.message);
    } catch (err) {
      const friendly = classifyError(err);
      setChallenge(null);
      setPhase("idle");
      if (friendly.kind === "user_rejected") {
        // A declined prompt is a normal action — keep the form, stay neutral.
        setNotice(
          "Signing cancelled — nothing was bound. Your details are still here; press Bind endpoint when you're ready.",
        );
        return;
      }
      setWalletError(friendly);
      return;
    }

    // 3. The nonce may have died while the popup sat open. Re-requesting costs
    // one round trip; submitting anyway costs a `challenge_invalid` that reads
    // like the wallet did something wrong.
    if (isChallengeExpired(expiresAtMs, Date.now())) {
      setChallenge(null);
      setPhase("idle");
      setNotice(
        "That challenge expired while the wallet was open. Press Bind endpoint to request a fresh one and sign again.",
      );
      return;
    }

    // 4. Present the signature. `replaced` tells the operator whether they
    // just re-pointed a live agent or bound its first endpoint.
    setPhase("binding");
    try {
      const bound = await bindAgent(agentId, {
        endpoint_url: endpointUrl,
        signature,
      });
      setChallenge(null);
      setResult(bound);
      setPhase("success");
      // The panel above is now a lie — it still says what the agent pointed at
      // a second ago. Re-read it so the confirmation and the "current binding"
      // it sits beneath cannot contradict each other.
      void lookUpBinding(agentId);
    } catch (err) {
      setChallenge(null);
      fail(err);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runBind();
  }

  /**
   * Editing a field invalidates whatever the last attempt concluded. Above all
   * a success: that card names an agent and an endpoint, and leaving it up
   * while either is being retyped claims a binding that was never made.
   */
  function clearOutcome() {
    setErrorView(null);
    setWalletError(null);
    setNotice(null);
    if (phase === "success") {
      setPhase("idle");
      setResult(null);
    }
  }

  function bindAnother() {
    setPhase("idle");
    setResult(null);
    setErrorView(null);
    setWalletError(null);
    setNotice(null);
    setEndpointRaw("");
    setTouched({});
    // The agent now has a binding it did not have a moment ago; refresh the
    // panel so the form opens on the truth rather than a stale "not bound".
    if (agentIdError === null) void lookUpBinding(agentId);
  }

  // Field-level errors. A backend code that belongs to a field outranks the
  // local validator: it is newer, and it is the answer to the value on screen.
  const agentFieldError: string | null =
    errorView?.placement === "agent_field"
      ? errorView.message
      : touched.agent_id && agentIdError !== null
        ? agentIdError
        : null;

  const endpointFieldError: string | null =
    errorView?.placement === "endpoint_field"
      ? errorView.message
      : touched.endpoint_url && endpointSyntaxError !== null
        ? endpointSyntaxError
        : endpointRefused && endpointVerdict
          ? endpointRefusalText(endpointVerdict)
          : null;

  const bannerError = errorView?.placement === "banner" ? errorView : null;
  const phaseMessage = bindPhaseMessage(phase);
  const replacing = currentBinding !== null && phase !== "success";
  const ownerMismatch =
    currentBinding !== null && owner !== "" && currentBinding.owner !== owner;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Bind an Endpoint
          </h1>
          <p className="mt-1 text-sm text-muted">
            Point one of your agents at the HTTPS endpoint that runs its work.
            The wallet that owns the agent signs the binding — nothing else can
            authorize it.
          </p>
        </div>
        <ConnectWallet size="md" />
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
            ▸ endpoint binding
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            signing wallet ·{" "}
            {wallet.connected ? (
              <span className="text-text break-all" title={owner}>
                {shortG(owner)}
              </span>
            ) : (
              <span className="text-magenta">connect a wallet</span>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
          <div>
            <label htmlFor="bind-agent-id" className={labelCls}>
              agent id
            </label>
            <input
              id="bind-agent-id"
              value={agentId}
              onChange={(e) => {
                setAgentId(e.target.value);
                clearOutcome();
              }}
              onBlur={() => touch("agent_id")}
              placeholder="weather_bot"
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              aria-invalid={agentFieldError !== null}
              aria-describedby={
                agentFieldError !== null
                  ? "bind-agent-id-err"
                  : "bind-agent-id-hint"
              }
              className={inputCls}
            />
            {agentFieldError !== null ? (
              <ErrorNote
                id="bind-agent-id-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {agentFieldError}
              </ErrorNote>
            ) : (
              <div id="bind-agent-id-hint" className={hintCls}>
                the id you registered on-chain · letters, digits and underscore
              </div>
            )}

            {ownedAgents.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                  your agents
                </span>
                {ownedAgents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAgentId(a.id);
                      touch("agent_id");
                      clearOutcome();
                    }}
                    className={`clip-cyber-sm border border-border px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-violet/60 hover:text-text disabled:opacity-50 ${focusRing}`}
                  >
                    {a.id}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Current binding — shown before anything is signed, because a
              re-bind silently re-points live traffic. */}
          <div className="border border-border/60 bg-bg/40 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              current binding
            </div>
            <div className="mt-2">
              {agentIdError !== null ? (
                <p className="font-mono text-[11px] text-muted">
                  enter an agent id to see what it points at today
                </p>
              ) : bindingLoading ? (
                <p className="font-mono text-[11px] text-muted">
                  ◉ reading the registry…
                </p>
              ) : bindingLookupFailed !== null ? (
                <ErrorNote
                  className="border-0 bg-transparent p-0 text-[11px]"
                  onRetry={() => {
                    void lookUpBinding(agentId);
                  }}
                  retryLabel="retry"
                >
                  ⚠ Couldn&apos;t read the current binding.
                </ErrorNote>
              ) : currentBinding ? (
                <dl className="space-y-2 font-mono text-xs">
                  <KVRow
                    k="endpoint"
                    value={currentBinding.endpoint_url}
                    divider={false}
                    valueClassName="text-cyan"
                  />
                  <KVRow
                    k="owner"
                    divider={false}
                    valueClassName={ownerMismatch ? "text-magenta" : undefined}
                  >
                    <span title={currentBinding.owner}>
                      {shortG(currentBinding.owner)}
                    </span>
                  </KVRow>
                  <KVRow
                    k="bound"
                    value={formatBoundAt(currentBinding.bound_at)}
                    divider={false}
                  />
                </dl>
              ) : (
                <p className="font-mono text-[11px] text-muted">
                  no endpoint bound yet — this will be the agent&apos;s first.
                </p>
              )}
            </div>
            {ownerMismatch ? (
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-magenta">
                ⚠ This agent is owned by another account. Only its owner can
                bind an endpoint for it — connect that wallet to continue.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="bind-endpoint" className={labelCls}>
              {replacing ? "replacement endpoint url" : "endpoint url"}
            </label>
            <input
              id="bind-endpoint"
              value={endpointRaw}
              onChange={(e) => {
                setEndpointRaw(e.target.value);
                clearOutcome();
              }}
              onBlur={() => touch("endpoint_url")}
              placeholder="https://agent.example.com/run"
              spellCheck={false}
              autoComplete="off"
              inputMode="url"
              disabled={busy}
              aria-invalid={endpointFieldError !== null}
              aria-describedby={
                endpointFieldError !== null
                  ? "bind-endpoint-err"
                  : "bind-endpoint-hint"
              }
              className={inputCls}
            />
            {endpointFieldError !== null ? (
              <ErrorNote
                id="bind-endpoint-err"
                className="border-0 bg-transparent p-0 mt-1 text-[11px]"
              >
                ⚠ {endpointFieldError}
              </ErrorNote>
            ) : endpointChecking ? (
              <div id="bind-endpoint-hint" className={hintCls}>
                ◉ checking the endpoint policy…
              </div>
            ) : endpointCheckFailed !== null ? (
              <div id="bind-endpoint-hint" className={hintCls}>
                couldn&apos;t preflight this URL — the bind itself will decide
              </div>
            ) : endpointVerdict?.allowed ? (
              <div
                id="bind-endpoint-hint"
                className="mt-1 font-mono text-[11px] text-cyan"
              >
                ✓ endpoint allowed
              </div>
            ) : (
              <div id="bind-endpoint-hint" className={hintCls}>
                where the agent receives work · https is assumed when you omit
                the scheme
              </div>
            )}
          </div>

          {/* AC-6, and it sits inside the form on purpose. This is a fact
              about the value in the field directly above it — the endpoint is
              the one part of an agent that is not on the chain — so it is read
              while the operator decides what to bind rather than after they
              have bound it. Down in the explainer card it would be
              documentation; here it is part of doing the binding, and it is
              what makes the "you can bind again" below it credible. The
              wording is shared (lib/binding-status): the registration flow
              makes the same claim, and two drifting copies of a claim about
              what is and is not permanent is worse than one. */}
          <p className="border-l-2 border-violet/60 bg-violet/5 py-2.5 pl-3.5 pr-3 text-sm leading-relaxed text-muted">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
              trust boundary
            </span>
            <br />
            {TRUST_BOUNDARY}
          </p>

          {replacing ? (
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              Binding replaces the endpoint above. Work already routed keeps the
              endpoint it was routed to; everything after this lands on the new
              one.
            </p>
          ) : null}

          {bannerError ? (
            <ErrorNote
              onRetry={
                bannerError.retryable && cooldownSeconds === 0
                  ? () => {
                      void runBind();
                    }
                  : undefined
              }
              retryLabel="try again"
              retrying={busy}
            >
              {bannerError.message}
              {cooldownSeconds > 0 ? ` (retry in ${cooldownSeconds}s)` : ""}
            </ErrorNote>
          ) : null}

          {walletError ? (
            <ErrorNote>
              {walletError.title} — {walletError.detail}
            </ErrorNote>
          ) : null}

          {notice ? (
            <div className="font-mono text-[11px] leading-relaxed text-muted">
              {notice}
            </div>
          ) : null}

          {/* The only notice a screen-reader user gets that the browser is
              idle because a popup in ANOTHER window wants their attention. */}
          <p
            role="status"
            aria-live="polite"
            className="font-mono text-[11px] leading-relaxed text-text min-h-[1rem]"
          >
            {phase === "awaiting_signature" ? "◉ " : ""}
            {phaseMessage ?? ""}
            {phase === "awaiting_signature" && validityLabel !== ""
              ? ` · challenge valid for ${validityLabel}`
              : ""}
          </p>

          {phase === "success" && result ? (
            <div className="border border-cyan/30 bg-cyan/5 p-4 space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
                ✓ {result.replaced ? "endpoint replaced" : "endpoint bound"}
              </div>
              <p className="text-sm text-text">
                <b className="font-mono">{result.agent_id}</b> now receives work
                at{" "}
                <span className="font-mono break-all text-cyan">
                  {result.endpoint_url}
                </span>
                {result.replaced
                  ? " — this superseded the endpoint it was pointing at before."
                  : " — its first binding."}
              </p>
              <dl className="space-y-2 font-mono text-xs">
                <KVRow k="owner" value={shortG(result.owner)} divider={false} />
                <KVRow
                  k="bound"
                  value={formatBoundAt(result.bound_at)}
                  divider={false}
                />
              </dl>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <ButtonLink variant="cyan" size="sm" href="/app/agents">
                  View in marketplace ▸
                </ButtonLink>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={bindAnother}
                >
                  Bind another endpoint
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="submit"
                variant="cyan"
                size="md"
                disabled={!canSubmit}
              >
                {phase === "challenging"
                  ? "◉ Requesting challenge…"
                  : phase === "awaiting_signature"
                    ? "◉ Check your wallet…"
                    : phase === "binding"
                      ? "◉ Binding…"
                      : replacing
                        ? "Replace endpoint ▸"
                        : "Bind endpoint ▸"}
              </Button>
              {!wallet.connected ? (
                <span className="font-mono text-[11px] text-muted">
                  connect the owner wallet to sign
                </span>
              ) : cooldownSeconds > 0 ? (
                <span className="font-mono text-[11px] text-muted">
                  rate limited · retry in {cooldownSeconds}s
                </span>
              ) : null}
            </div>
          )}
        </form>
      </Card>

      <Card>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
          ▸ how binding works
        </div>
        <ol className="mt-3 space-y-2 text-sm text-muted list-decimal pl-5">
          <li>
            The registry issues a one-time challenge naming your agent, the
            endpoint and a nonce.
          </li>
          <li>
            Your wallet signs that exact string. The signature proves the
            binding came from the account that owns the agent — no password, no
            account to create.
          </li>
          <li>
            The challenge is short-lived. If it expires while the wallet popup
            is open, a fresh one is requested rather than a dead signature
            submitted.
          </li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          No agent yet?{" "}
          <Link href="/app/register" className={inlineLink}>
            Register one first
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

/**
 * Shell for the Suspense boundary. Reading the handed-off agent id with
 * `useSearchParams` opts this whole page into client-side rendering, so this
 * fallback — not the form — is what ships in the prerendered HTML. A one-line
 * "loading…" would reserve none of the binding card's height and the real
 * layout would slam in underneath it, moving the agent id field out from under
 * a cursor already on its way there. This mirrors the live structure (header,
 * the binding card with both fields and the current-binding panel between
 * them, then the explainer) so the swap is a fill, not a jump.
 */
function BindSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <LoadingStatus label="Loading the binding form…" />
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Bind an Endpoint
          </h1>
          <Skeleton className="mt-2 h-4 w-[32rem] max-w-full" />
          <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="mt-5 space-y-5">
          {/* agent id */}
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-1.5 h-[46px] w-full" />
            <Skeleton className="mt-1 h-3 w-80 max-w-full" />
          </div>
          {/* current binding */}
          <div className="border border-border/60 bg-bg/40 p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-3 w-64 max-w-full" />
          </div>
          {/* endpoint url */}
          <div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-1.5 h-[46px] w-full" />
            <Skeleton className="mt-1 h-3 w-80 max-w-full" />
          </div>
          {/* trust boundary */}
          <Skeleton className="h-[72px] w-full" />
          <Skeleton className="h-10 w-44" />
        </div>
      </Card>

      <Card>
        <Skeleton className="h-3 w-36" />
        <div className="mt-3 space-y-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </Card>
    </div>
  );
}

export default function BindPage() {
  return (
    <Suspense fallback={<BindSkeleton />}>
      <BindPageInner />
    </Suspense>
  );
}
