"use client";
/**
 * What one agent has actually been paid — and the limits of that claim.
 *
 * The honest answer on this deployment is "nothing", and an empty state would
 * deliver that in the most damaging way available: to an operator, a blank
 * settlement card reads as "nobody wanted your agent". That reading is false.
 * Nothing has settled to anyone here, for reasons that live entirely on the
 * platform's side of the line, so this panel states the zero out loud, names
 * it, and puts the evidence underneath it instead of leaving an operator to
 * infer a verdict on their own work.
 *
 * Three results are kept strictly apart, because collapsing them is exactly
 * what turns a money figure into a lie: a lookup that FAILED, a scan that
 * could not RUN (`unavailable`), and a scan that ran and found NOTHING. Only
 * the last one is evidence that nothing was paid.
 */

import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { KVRow } from "@/components/ui/kv-row";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { getSettlement } from "@/lib/api";
import { assetLabel, formatSettled } from "@/lib/money";
import type { AgentSettlement, SettlementEntry } from "@/lib/types";
import { focusRing } from "@/lib/ui";
import { useFetch } from "@/lib/use-fetch";
import { cn } from "@/lib/utils";

/**
 * The card, its heading and its standing description.
 *
 * Shared by every state so the panel never disappears: an operator who cannot
 * find the settlement card at all learns nothing, whereas one who finds it
 * carrying a failure has been told something true.
 */
function PanelShell({
  headingId,
  agentName,
  children,
}: {
  headingId: string;
  agentName: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          Settlement
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What {agentName} has actually been paid, read from the escrow's
          on-chain charge events rather than from the job log.
        </p>
      </div>
      <Card className="space-y-6">{children}</Card>
    </section>
  );
}

/**
 * The figures, with the unit held apart from the number.
 *
 * `unit` is a separate StatTile prop for a reason that bites here specifically:
 * Card's clip-path and the page's `overflow-x: hidden` cut an overwide figure
 * off silently — it is not scrolled, it is lost — and a money value is the
 * worst thing on the page to lose half of. Passing a null asset to
 * `formatSettled` is how the one shared formatter yields the bare figure; the
 * asset comes back through `unit`, and is never hard-coded (the escrow's token
 * wraps the native asset on testnet, so "USDC" would simply be wrong).
 */
function SettlementFigures({ data }: { data: AgentSettlement }) {
  const unit = assetLabel(data.asset);
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <StatTile
        label="settled revenue"
        value={formatSettled(data.total_stroops, null)}
        unit={unit}
        hint="customer payments only"
      />
      <StatTile
        label="excluded self-payments"
        value={formatSettled(data.self_payment_stroops, null)}
        unit={unit}
        hint="paid by the platform to its own account"
      />
      <StatTile
        label="charged events"
        value={String(data.entries.length)}
        hint={`in the last ${data.window_days} days`}
      />
    </div>
  );
}

/**
 * The zero, said out loud.
 *
 * An empty panel is not neutral. Read by the operator who built the agent, a
 * settlement card with nothing in it says "nobody hired you" — a claim about
 * their work that this deployment has no evidence for. So the absence is
 * stated as a finding, in words, with its scope attached.
 *
 * The headline is split on `entries.length` because the two cases are not the
 * same statement and the weaker one would be a lie in either direction. With
 * no charge events at all, nothing settled, full stop. With a self-payment
 * present, a charge *did* settle on-chain — it simply moved the platform's
 * funds to the platform — so the claim narrows to customer payment, which is
 * the part that is genuinely zero.
 */
function NothingSettledNotice({
  data,
  agentName,
}: {
  data: AgentSettlement;
  agentName: string;
}) {
  return (
    <div className="clip-cyber-sm space-y-3 border border-magenta/40 bg-magenta/5 px-4 py-3">
      <p className="font-mono text-[11px] leading-relaxed text-magenta">
        <span aria-hidden="true">⚑ </span>
        {data.entries.length === 0
          ? `No payment has settled to ${agentName}.`
          : `No customer payment has settled to ${agentName}.`}
      </p>
      <p className="max-w-2xl text-xs leading-relaxed text-muted">
        {data.entries.length === 0
          ? `The escrow recorded no charge against this agent in the last ${data.window_days} days.`
          : `The charges below are the only ones in the last ${data.window_days} days, and none of them is a customer paying for work.`}{" "}
        That window is the whole of the log we can read — Soroban RPC keeps{" "}
        {data.window_days} days of contract events and drops everything older —
        so this is a statement about the last {data.window_days} days, not about
        the agent's whole history.
      </p>
    </div>
  );
}

/**
 * The scan did not finish, so nothing below it is a total.
 *
 * Placed against the claim it weakens rather than at the foot of the card: a
 * truncated scan read part of the window, so "nothing settled" is only true of
 * the part it reached, and an operator who meets that caveat after the numbers
 * has already drawn the conclusion. The wording says floor rather than
 * "approximate" — the figure can only go up with more scanning, never down,
 * and "approximate" would invite reading it as possibly high.
 */
function TruncatedNotice({ data }: { data: AgentSettlement }) {
  return (
    <p className="clip-cyber-sm max-w-2xl border border-violet/40 bg-violet/5 px-4 py-3 text-xs leading-relaxed text-muted">
      <span aria-hidden="true">⚠ </span>
      The scan stopped at its page limit before it reached the end of the{" "}
      {data.window_days}-day window, so it did not read the whole log. Every
      figure below is a floor rather than a total: a charge older than the last
      ledger scanned would not appear here.
    </p>
  );
}

/**
 * Why a completed run can leave no payment behind.
 *
 * This is the finding, not a caveat. `PaymentEscrow.authorize` records an
 * authorization while taking neither custody of the payer's funds nor an
 * allowance against them, so `charge` later calls `transfer` from the payer —
 * an account that did not sign the settling transaction, whose
 * `require_auth()` therefore cannot pass. The settler is the only signer, so
 * the settler's own balance is the only one the call can ever move. Worse,
 * the failure does not propagate: the run finalizes as `complete` either way,
 * which is why the job log and the money disagree and nobody noticed.
 *
 * It is stated on the operator's dashboard, in the place the missing money
 * would otherwise be, because the operator is the person who pays for this
 * silence — and because the wording has to rule out the inference they will
 * otherwise draw, which is that the market passed them over. The closing
 * sentences are deliberately negative claims ("not a measure of", "not a
 * signal about") rather than a reassurance about the future: nobody can
 * promise this agent will be paid once the contract is fixed, so nothing here
 * says so.
 */
function ChargeDefectNote() {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-cyan">
        Why nothing settles
      </h3>
      <p className="max-w-2xl text-xs leading-relaxed text-muted">
        The escrow's charge path cannot move a customer's funds. Authorizing a
        payment takes no custody of the payer's balance and no allowance against
        it, so at settlement the transfer is attempted from an account that
        never signed the settling transaction. The only account that signs one
        is the platform's own settler, and its balance is the only one the call
        can draw on.
      </p>
      <p className="max-w-2xl text-xs leading-relaxed text-muted">
        That transfer fails without failing the run — the run still finalizes as
        complete — so a finished job can leave no payment behind, and the job
        log and the money disagree.
      </p>
      <p className="max-w-2xl text-xs leading-relaxed text-muted">
        Every charge on record was paid by the platform's settler into an
        account the platform itself owns, and the readable event window holds no
        charge from a customer for any agent. This is a defect in the escrow
        contract, on the platform's side of the line. It is not a measure of
        your agent, and not a signal about demand for it.
      </p>
    </div>
  );
}

/**
 * A ledger close time, as UTC rather than as the reader's locale.
 *
 * Same call as `formatBoundAt` in lib/bind-ui: this stamp is evidence, and an
 * operator pastes it into a report where it has to mean the same thing to
 * everyone. It also renders identically on the server and in the browser,
 * which a locale format does not. A time the RPC never reported is named as
 * missing instead of printing "Invalid Date".
 */
function formatLedgerTime(at: string | null): string {
  if (at === null) return "not reported by the rpc";
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return at;
  return `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/**
 * One `charged` event, with the payer's identity treated as the headline fact.
 *
 * A self-payment is shown, not hidden. Dropping it would leave an operator
 * with an unexplained gap between "8 receipts exist" and "you earned nothing",
 * and the explanation is the whole point: the payer resolved to the platform's
 * own account, so the money went from the platform to the platform. The label
 * carries that in a glyph and in words — never in the magenta alone — and the
 * payer address is printed in full with an explorer link, because "trust us,
 * it was us" is not evidence and this claim is the one an operator has the
 * most right to check.
 */
function ChargeEntry({
  entry,
  asset,
}: {
  entry: SettlementEntry;
  asset: string;
}) {
  return (
    <div className="clip-cyber-sm space-y-3 border border-border/60 bg-bg/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm text-text">
          {formatSettled(entry.amount_stroops, asset)}
        </span>
        {entry.self_payment ? (
          <Badge tone="magenta">
            <span aria-hidden="true">⚑</span> self-payment · excluded
          </Badge>
        ) : (
          <Badge tone="success">
            <span aria-hidden="true">✓</span> customer payment
          </Badge>
        )}
      </div>
      {entry.self_payment ? (
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          The payer on this charge resolves to the platform's own account — the
          same account that signs settlements — so it moved platform funds to
          the platform. It is listed because it happened on-chain, and left out
          of revenue because no customer paid it.
        </p>
      ) : null}
      <dl className="space-y-2 font-mono text-[11px]">
        <KVRow k="payer">
          <span className="block break-all">{entry.payer}</span>
          <StellarExpertLink
            kind="account"
            id={entry.payer}
            className="mt-1 inline-block"
          />
        </KVRow>
        <KVRow k="job" value={entry.job_id} />
        <KVRow k="ledger" value={entry.ledger.toLocaleString()} />
        <KVRow k="closed" value={formatLedgerTime(entry.at)} />
      </dl>
    </div>
  );
}

/** Every charge the scan found, in the order the chain recorded them. */
function ChargeList({ data }: { data: AgentSettlement }) {
  if (data.entries.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-cyan">
        Charged events
      </h3>
      <ul className="space-y-3">
        {data.entries.map((entry) => (
          // auth_id identifies the authorization; pairing it with the ledger
          // keeps the key stable even if one authorization is charged twice.
          <li key={`${entry.auth_id}:${entry.ledger}`}>
            <ChargeEntry entry={entry} asset={data.asset} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the scan covered, so the figures above can be argued with. */
function ScanFacts({ data }: { data: AgentSettlement }) {
  return (
    <dl className="space-y-2 font-mono text-[11px]">
      <KVRow k="scan window">
        last {data.window_days} days · soroban rpc event retention
      </KVRow>
      <KVRow k="ledgers scanned">
        {data.scanned_ledgers.toLocaleString()}
        {data.truncated ? " · stopped at the page cap" : null}
      </KVRow>
      <KVRow k="unit">
        {assetLabel(data.asset)}
        {data.asset === "native"
          ? " · the escrow's token wraps this chain's native asset"
          : null}
      </KVRow>
    </dl>
  );
}

export function SettlementPanel({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}): JSX.Element {
  // Fetched once per mount: the backend answers this with an event scan across
  // the whole retention window plus a contract read per hit, so focus
  // revalidation would spend a lot of backend for a number that changes at
  // most once a ledger. `reload` stays available as the operator's own retry.
  const { data, error, loading, retrying, lastSuccessAt, reload } = useFetch(
    () => getSettlement(agentId),
    [agentId],
  );
  const headingId = useId();

  // Checked before `loading` so an automatic retry keeps the announced failure
  // on screen instead of flashing back to skeletons: useFetch flips `loading`
  // true for each attempt, and a loading-first branch alternates between the
  // two for the whole recovery.
  if (error && !data) {
    return (
      <PanelShell headingId={headingId} agentName={agentName}>
        <ErrorNote
          className="clip-cyber-sm"
          onRetry={reload}
          retrying={retrying || loading}
        >
          Settlement could not be loaded for {agentName}. This is a failed
          lookup, not a zero — no figure is shown because none was read. {error}
        </ErrorNote>
      </PanelShell>
    );
  }

  // Covers the first fetch in flight and the resolved-but-empty case the type
  // system cannot rule out. Both mean "no reading yet", and neither is allowed
  // to render a number.
  if (!data) {
    return (
      <PanelShell headingId={headingId} agentName={agentName}>
        <LoadingStatus label={`Reading settlement for ${agentName}…`} />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {["revenue", "excluded", "events"].map((k) => (
            <div key={k}>
              <Skeleton className="mb-3 h-3 w-24" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      </PanelShell>
    );
  }

  // A failed reload keeps the last good payload on screen, which is the right
  // call — the figures are still true of the moment they were read. What is
  // not acceptable is letting them present themselves as current: a settled
  // money figure frozen under a silent outage is the exact failure StaleBadge
  // was written for. Dated, announced, and given a way back.
  const staleNotice =
    error && data ? (
      <div className="space-y-2">
        <ErrorNote
          className="clip-cyber-sm"
          onRetry={reload}
          retrying={retrying || loading}
        >
          Settlement could not be refreshed for {agentName}. What is shown below
          is the last reading that succeeded, not a live one. {error}
        </ErrorNote>
        <StaleBadge
          stale
          lastSuccessAt={lastSuccessAt}
          what="settlement figures"
        />
      </div>
    ) : null;

  // `unavailable` is the backend telling us it never looked — the RPC was
  // unreachable, the escrow id was not configured, the window could not be
  // resolved. Every figure in the payload is therefore a default, and
  // rendering `total_stroops` here would publish a zero we did not measure.
  // This is the single most tempting bug in the panel and the least visible
  // one afterwards, since a wrongly-rendered zero looks exactly like a real
  // one.
  if (data.unavailable !== null) {
    return (
      <PanelShell headingId={headingId} agentName={agentName}>
        {staleNotice}
        <ErrorNote
          className="clip-cyber-sm"
          onRetry={reload}
          retrying={retrying || loading}
        >
          The settlement scan could not run, so there is no figure for{" "}
          {agentName} — this is a missing reading, not a zero. Reason given:{" "}
          {data.unavailable}
        </ErrorNote>
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          A scan that never ran and a scan that ran and found nothing are
          different results. Only the second one is evidence about payment.
        </p>
        <ScanFacts data={data} />
      </PanelShell>
    );
  }

  return (
    <PanelShell headingId={headingId} agentName={agentName}>
      {staleNotice}
      {/* Stated before the tiles, not under them: the operator's question is
          "have I been paid", and a row of zeroes answers it only if you
          already know what the zeroes mean. */}
      {data.total_stroops === 0 ? (
        <NothingSettledNotice data={data} agentName={agentName} />
      ) : null}
      {data.truncated ? <TruncatedNotice data={data} /> : null}
      <SettlementFigures data={data} />
      {/* Tied to the zero it explains rather than shown always: an agent with
          real customer revenue is not living under this defect, and a standing
          contract-bug essay over a working figure would be noise. */}
      {data.total_stroops === 0 ? <ChargeDefectNote /> : null}
      <ChargeList data={data} />
      <ScanFacts data={data} />
      {/* The one control that re-reads the chain. Without it `reload` is only
          reachable from a failure, so a resolved panel is frozen for the life
          of the mount — and an operator who has just been told they were paid
          nothing is precisely the person who wants to check again. Manual
          rather than polled or focus-revalidated: each press costs the backend
          a full event scan over the window. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className={cn(
            "border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted",
            "transition-colors hover:text-text disabled:opacity-50",
            focusRing,
          )}
        >
          {loading ? "re-scanning…" : "re-scan"}
        </button>
      </div>
    </PanelShell>
  );
}
