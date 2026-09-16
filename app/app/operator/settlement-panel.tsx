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

import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { KVRow } from "@/components/ui/kv-row";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { getSettlement } from "@/lib/api";
import { assetLabel, formatSettled } from "@/lib/money";
import type { AgentSettlement } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";

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
      {data.entries.length === 0 ? (
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          The escrow recorded no charge against this agent in the last{" "}
          {data.window_days} days. That window is the whole of the log we can
          read — Soroban RPC keeps {data.window_days} days of contract events
          and drops everything older — so this is a statement about the last{" "}
          {data.window_days} days, not about the agent's whole history.
        </p>
      ) : null}
    </div>
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

/** What the scan covered, so the figures above can be argued with. */
function ScanFacts({ data }: { data: AgentSettlement }) {
  return (
    <dl className="space-y-2 font-mono text-[11px]">
      <KVRow k="scan window">
        last {data.window_days} days · soroban rpc event retention
      </KVRow>
      <KVRow
        k="ledgers scanned"
        value={data.scanned_ledgers.toLocaleString()}
      />
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
  const { data, error, loading, retrying, reload } = useFetch(
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
      {/* Stated before the tiles, not under them: the operator's question is
          "have I been paid", and a row of zeroes answers it only if you
          already know what the zeroes mean. */}
      {data.total_stroops === 0 ? (
        <NothingSettledNotice data={data} agentName={agentName} />
      ) : null}
      <SettlementFigures data={data} />
      {/* Tied to the zero it explains rather than shown always: an agent with
          real customer revenue is not living under this defect, and a standing
          contract-bug essay over a working figure would be noise. */}
      {data.total_stroops === 0 ? <ChargeDefectNote /> : null}
      <ScanFacts data={data} />
    </PanelShell>
  );
}
