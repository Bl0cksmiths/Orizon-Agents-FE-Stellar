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
      <SettlementFigures data={data} />
      <ScanFacts data={data} />
    </PanelShell>
  );
}
