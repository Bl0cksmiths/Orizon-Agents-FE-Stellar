/**
 * What a buyer is told when their authorization CONFIRMED but no run will
 * settle it — the plan had expired, or the run could not be started.
 *
 * Under escrow v1 this was harmless: an authorization only capped a later
 * charge and lapsed by itself. Escrow v2 takes custody at authorize, so by the
 * time `execute` refuses, the cap has already left the wallet. Nothing will
 * return it on its own: `settle` is the only path that pays anyone or refunds
 * the remainder, and without a run there is nothing to settle. The buyer gets
 * it back with `reclaim` — theirs alone to call, and only once the
 * authorization has expired (`Locked` before then, so the settler cannot be
 * raced for work that was delivered).
 *
 * The console has no reclaim button: the backend has no route that builds a
 * reclaim transaction, and inventing one here would be a feature, not copy.
 * So the notice gives the buyer everything a reclaim needs — the contract, the
 * authorization id, their address and the earliest time — and one command
 * that does it.
 */

import { formatLocalTime } from "@/components/disputes/window-state";
import { NETWORK_LABEL } from "@/components/ui/stellar-link";

import type { HeldAuthorization } from "@/lib/held-authorizations";

export type { HeldAuthorization };

export const ESCROW_HELD_NOTICE_ID = "escrow-held-notice";

export function EscrowHeldNotice({
  held,
  amount,
  escrowId,
  runRefused,
}: {
  held: HeldAuthorization;
  /**
   * True when the backend definitively refused to start a run (the plan had
   * expired). False when the request to start one FAILED — a timeout or a
   * dropped connection may still have started a run that will settle, so
   * the copy must not say none will.
   */
  runRefused: boolean;
  /** The cap that moved, formatted with its unit (or bare while unknown). */
  amount: string;
  /** The escrow contract id from GET /stellar/network; null until read. */
  escrowId: string | null;
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
            ? "No run was started, so no agent was paid from it and nothing will settle it: it does not come back on its own."
            : "The console could not confirm that a run started. If one did, it settles as usual and returns what it does not spend. If none did, nothing will settle this authorization and it does not come back on its own."}
        </p>
        <p>
          You can reclaim all of it {when}. Only the wallet that paid can
          reclaim, and the console has no reclaim button yet: call{" "}
          <code className="font-mono text-text">reclaim</code> on the escrow
          contract with these values, for example with the Stellar CLI.
          {runRefused
            ? null
            : " The escrow refuses a reclaim of an authorization that was settled, so trying one costs only the network fee."}
        </p>
      </div>
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
      {/* Wraps rather than scrolls: the page clips horizontal overflow, and
          a command cut off at 360px is a command that cannot be copied. */}
      <pre className="mt-3 whitespace-pre-wrap break-all bg-bg/60 p-3 font-mono text-[11px] text-text">
        {`stellar contract invoke --network ${NETWORK_LABEL} --source <your-key> --id ${escrowId ?? "<escrow-contract>"} -- reclaim --payer ${held.payer} --auth_id ${held.authIdHex}`}
      </pre>
    </section>
  );
}
