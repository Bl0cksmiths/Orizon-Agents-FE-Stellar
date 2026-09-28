/**
 * What a buyer is told when their authorization CONFIRMED but no run took it
 * over — the plan had expired, the authorization did not fit the plan, or the
 * run could not be started.
 *
 * Under escrow v1 this was harmless: an authorization only capped a later
 * charge and lapsed by itself. Escrow v2 takes custody at authorize, so by the
 * time `execute` refuses, the cap has already left the wallet, and it does
 * not come back by lapsing. The platform hands it back itself where it can —
 * a settlement that pays nobody — and says so with the transaction
 * (`FundsReturnedNotice`); this notice is for when it did not. The buyer then
 * takes it back with `reclaim`: theirs alone to call, and only once the
 * authorization has expired (`Locked` before then, so a settlement can still
 * pay the steps that delivered).
 *
 * The Reclaim control is the way back. The contract, the authorization id,
 * the payer and a command stay available underneath it, for a buyer whose
 * backend does not build the reclaim transaction yet.
 */

import { formatLocalTime } from "@/lib/local-time";
import { ReclaimControl } from "@/components/escrow/reclaim-control";
import { NETWORK_LABEL, StellarExpertLink } from "@/components/ui/stellar-link";
import type { HeldAuthorization } from "@/lib/held-authorizations";

export type { HeldAuthorization };

export const ESCROW_HELD_NOTICE_ID = "escrow-held-notice";

export function EscrowHeldNotice({
  held,
  amount,
  escrowId,
  runRefused,
  releaseFailed = false,
}: {
  held: HeldAuthorization;
  /** The cap that moved, formatted with its unit (or bare while unknown). */
  amount: string;
  /** The escrow contract id from GET /stellar/network; null until read. */
  escrowId: string | null;
  /**
   * True when the backend definitively refused to start a run. False when
   * the request to start one FAILED without an answer — a timeout or a
   * dropped connection may still have started a run that will settle, so
   * the copy must not say none will.
   */
  runRefused: boolean;
  /** The platform tried to return the custody and could not. */
  releaseFailed?: boolean;
}): JSX.Element {
  const when =
    held.expiresAt !== null
      ? `from ${formatLocalTime(held.expiresAt * 1_000)}, when the authorization expires`
      : "once the authorization expires";
  return (
    <section
      id={ESCROW_HELD_NOTICE_ID}
      aria-labelledby={`${ESCROW_HELD_NOTICE_ID}-heading`}
      className="mt-4 clip-cyber-sm border border-magenta/40 bg-magenta/5 p-4"
    >
      <h3
        id={`${ESCROW_HELD_NOTICE_ID}-heading`}
        className="text-sm font-semibold tracking-tight"
      >
        Your funds are held in escrow
      </h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
        <p>
          The authorization you signed moved up to{" "}
          <b className="text-text">{amount}</b> from your wallet into escrow.{" "}
          {runRefused
            ? "No run was started, so no agent was paid from it and no settlement will spend it."
            : "The console could not confirm that a run started. If one did, it settles as usual and returns what it does not spend."}{" "}
          {releaseFailed
            ? "The platform tried to return it to you and could not, so it stays in escrow until you reclaim it."
            : runRefused
              ? "It stays in escrow until you reclaim it."
              : "If none did, it stays in escrow until you reclaim it."}
        </p>
        <p>You can reclaim all of it {when}. Only the wallet that paid can.</p>
      </div>
      <div className="mt-3">
        <ReclaimControl held={held} amount={amount} />
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer hover:text-text">
          Reclaim without the console
        </summary>
        <p className="mt-2 leading-relaxed">
          Call <code className="font-mono text-text">reclaim</code> on the
          escrow contract from the wallet that paid, with these values — for
          example with the Stellar CLI. The escrow refuses a reclaim of an
          authorization that was settled, so trying one costs only the network
          fee.
        </p>
        <dl className="mt-3 space-y-2 font-mono text-[11px]">
          <div>
            <dt className="text-muted uppercase tracking-widest text-[10px]">
              escrow contract
            </dt>
            <dd className="break-all text-text">
              {escrowId ?? "not known yet — see /api/stellar/network"}
            </dd>
          </div>
          <div>
            <dt className="text-muted uppercase tracking-widest text-[10px]">
              authorization id
            </dt>
            <dd className="break-all text-text">{held.authIdHex}</dd>
          </div>
          <div>
            <dt className="text-muted uppercase tracking-widest text-[10px]">
              payer
            </dt>
            <dd className="break-all text-text">{held.payer}</dd>
          </div>
        </dl>
        {/* Wraps rather than scrolls: the page clips horizontal overflow,
            and a command cut off at 360px is a command that cannot be
            copied. */}
        <pre className="mt-3 whitespace-pre-wrap break-all bg-bg/60 p-3 font-mono text-[11px] text-text">
          {`stellar contract invoke --network ${NETWORK_LABEL} --source <your-key> --id ${escrowId ?? "<escrow-contract>"} -- reclaim --payer ${held.payer} --auth_id ${held.authIdHex}`}
        </pre>
      </details>
    </section>
  );
}

/**
 * The platform handed the custody straight back: a settlement that paid
 * nobody and returned every stroop, confirmed in `txHash`. Said as a fact
 * with its evidence, because it is one — the backend sends the hash only once
 * that transaction confirmed.
 */
export function FundsReturnedNotice({
  amount,
  txHash,
}: {
  amount: string;
  txHash: string;
}): JSX.Element {
  return (
    <section
      aria-labelledby="escrow-returned-heading"
      className="mt-4 clip-cyber-sm border border-cyan/40 bg-cyan/5 p-4"
    >
      <h3
        id="escrow-returned-heading"
        className="text-sm font-semibold tracking-tight"
      >
        Your funds were returned
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        No run was started, so the platform returned the whole authorization —
        up to <b className="text-text">{amount}</b> — from escrow to your
        wallet, and paid no agent from it.
      </p>
      <StellarExpertLink
        kind="tx"
        id={txHash}
        className="mt-2 inline-flex min-h-6 items-center gap-[1ch]"
      >
        view the return on stellar.expert
        <span aria-hidden="true"> ▸</span>
      </StellarExpertLink>
    </section>
  );
}
