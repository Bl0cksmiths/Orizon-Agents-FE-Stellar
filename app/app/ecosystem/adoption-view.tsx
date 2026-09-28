/**
 * The Ecosystem page's body (story 5.02): the three SOW §6.3 targets, the
 * external operators behind them, and the wallets we control that do not
 * count.
 *
 * This is evidence a reviewer checks by clicking, so every rule leans against
 * flattering the numbers. A miss is stated as a miss, with the count and the
 * shortfall — no progress bar, because a bar at 0 of 2 still draws the eye to
 * how far there is to go rather than to the fact of the miss. Every wallet
 * and settlement links to the chain. A payment from one of our own wallets is
 * labelled team-funded wherever it appears. And the wallets we control are
 * listed in full, with their role, because being open about what does not
 * count is what makes the rest believable.
 *
 * Pure: it renders one adoption payload and fetches nothing, so every state is
 * testable from a fixture. Loading and errors belong to the page.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StackedTable } from "@/components/ui/stacked-table";
import {
  OPERATOR_DOCS_URL,
  TARGET_COPY,
  excludedOwners,
  exclusionReason,
  formatSettledAmount,
  teamFunding,
  teamFundedLabel,
  missSentence,
  shortAddress,
  targetRows,
  targetsVerdict,
  unverifiedSentence,
  type EcosystemAdoption,
  type ExcludedWallet,
  type ExternalAgent,
  type ExternalOperator,
  type TargetRow,
} from "@/lib/ecosystem";
import { explorerHref } from "@/lib/explorer-href";
import { formatLocalTime } from "@/lib/local-time";
import { inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";

const body = "font-mono text-[11px] leading-relaxed text-muted";
const sectionHeading = "text-lg font-semibold tracking-tight";

export function AdoptionView({
  adoption,
  asset = null,
}: {
  adoption: EcosystemAdoption;
  /** What the escrow settles in, from GET /api/stellar/network: "native" on
   * testnet. Null while that read is pending or failed — amounts then carry
   * no unit rather than a guessed one. */
  asset?: string | null;
}) {
  const rows = targetRows(adoption);
  const ours = excludedOwners(adoption);
  const unverified = unverifiedSentence(adoption);
  const network = adoption.network;

  return (
    <div className="space-y-8">
      <p className={body}>
        <span className="text-text">{network}</span> · read at{" "}
        <time dateTime={new Date(adoption.generated_at * 1_000).toISOString()}>
          {formatLocalTime(adoption.generated_at * 1_000)}
        </time>
      </p>

      {unverified && (
        <div className="clip-cyber-sm space-y-1 border border-violet/40 bg-violet/5 px-4 py-3 font-mono text-xs text-text">
          <p>
            <span aria-hidden="true">? </span>
            {unverified}
          </p>
          {(adoption.unreadable_agents?.length ?? 0) > 0 && (
            <p className="break-all text-muted">
              Not verified: {adoption.unreadable_agents!.join(", ")}
            </p>
          )}
        </div>
      )}

      <section aria-labelledby="targets-heading" className="space-y-4">
        <div>
          <h2 id="targets-heading" className={sectionHeading}>
            SOW §6.3 targets
          </h2>
          <p className={`mt-1 ${body}`}>
            <span className="text-text">{targetsVerdict(rows)}</span> Counted by
            the backend from the chain; a target is shown as met only when its
            count reaches it.
          </p>
        </div>
        <ul className="grid gap-4 lg:grid-cols-3">
          {rows.map((row) => (
            <TargetItem key={row.key} row={row} unverified={!!unverified} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="operators-heading" className="space-y-4">
        <h2 id="operators-heading" className={sectionHeading}>
          External operators
        </h2>
        {adoption.operators.length === 0 ? (
          <NoOperators hasExcluded={adoption.excluded.length > 0} />
        ) : (
          <ul className="space-y-4">
            {adoption.operators.map((op) => (
              <li key={op.owner}>
                <OperatorCard
                  operator={op}
                  ours={ours}
                  network={network}
                  asset={asset}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="excluded-heading" className="space-y-4">
        <div>
          <h2 id="excluded-heading" className={sectionHeading}>
            Wallets we control (not counted)
          </h2>
          <p className={`mt-1 max-w-[80ch] ${body}`}>
            Each wallet below belongs to the Blocksmiths team or to the platform
            itself. Their agents are real and registered, but nothing they own
            or pay for counts toward the targets above, under any framing. A
            settlement one of them paid for is marked team-funded wherever it
            appears.
          </p>
        </div>
        {adoption.excluded.length === 0 ? (
          <p className={body}>No wallet was excluded in this read.</p>
        ) : (
          <Card>
            <StackedTable
              caption="Wallets we control, which are not counted"
              columns={["Wallet", "Role", "Why not counted", "Agents"]}
              rows={adoption.excluded.map((w) => ({
                key: w.owner,
                cells: excludedCells(w, network),
              }))}
            />
          </Card>
        )}
      </section>
    </div>
  );
}

function TargetItem({
  row,
  unverified,
}: {
  row: TargetRow;
  unverified: boolean;
}) {
  const copy = TARGET_COPY[row.key];
  return (
    <li
      className={cn(
        "clip-cyber-sm space-y-2 border p-4",
        row.met ? "border-cyan/40 bg-cyan/5" : "border-magenta/40 bg-magenta/5",
      )}
    >
      <h3 className="text-sm font-semibold tracking-tight text-text">
        {copy.label}
      </h3>
      <p className="font-mono text-3xl text-text">
        {row.current}
        <span className="ml-1.5 text-base text-muted">of {row.target}</span>
      </p>
      <p
        className={cn(
          "font-mono text-xs",
          row.met ? "text-cyan" : "text-magenta",
        )}
      >
        <span aria-hidden="true">{row.met ? "✓ " : "✕ "}</span>
        {row.met ? `Met: ${row.current} of ${row.target}.` : missSentence(row)}
      </p>
      <p className={body}>{copy.counts}</p>
      {unverified && (
        <p className={body}>
          May be incomplete: some agents could not be verified right now.
        </p>
      )}
    </li>
  );
}

function NoOperators({ hasExcluded }: { hasExcluded: boolean }) {
  return (
    <Card className="space-y-4">
      <h3 className="text-base font-semibold tracking-tight">
        No external operators yet
      </h3>
      <p className="max-w-[70ch] text-sm text-muted">
        Nobody outside the Blocksmiths operates an agent on Orizon yet.
        {hasExcluded
          ? " Every agent registered today belongs to a wallet we control, and those are listed below, not counted."
          : " No agent on the registry is owned by an outside wallet."}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <ButtonLink variant="primary" href="/app/register">
          Register an agent
        </ButtonLink>
        <Link
          href={OPERATOR_DOCS_URL}
          className={cn(inlineLink, "font-mono text-xs")}
        >
          Read the guide: List your agent on Orizon
        </Link>
      </div>
    </Card>
  );
}

/** A wallet, shortened, linked to the explorer, full address for readers. */
function WalletLink({
  owner,
  explorer,
  network,
}: {
  owner: string;
  explorer?: string | null;
  network: string;
}) {
  const href = explorerHref(explorer, "account", owner, network);
  if (!href) return <span>{shortAddress(owner)}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={owner}
      className={cn(inlineLink, "font-mono")}
    >
      {shortAddress(owner)}
      <span className="sr-only"> — {owner}, on Stellar Expert</span>
    </a>
  );
}

function OperatorCard({
  operator,
  ours,
  network,
  asset,
}: {
  operator: ExternalOperator;
  ours: Map<string, ExcludedWallet>;
  network: string;
  asset: string | null;
}) {
  return (
    <Card className="space-y-4">
      <h3 className="text-base font-semibold tracking-tight">
        Operator{" "}
        <WalletLink
          owner={operator.owner}
          explorer={operator.owner_explorer}
          network={network}
        />
      </h3>
      {operator.agents.length === 0 ? (
        <p className={body}>No agents listed for this operator.</p>
      ) : (
        <ul className="space-y-5">
          {operator.agents.map((agent) => (
            <li
              key={agent.agent_id}
              className="space-y-3 border-t border-border pt-4"
            >
              <AgentBlock
                agent={agent}
                ours={ours}
                network={network}
                asset={asset}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Tri-state flag as a badge: a missing answer is said as missing. */
function FlagBadge({
  value,
  yes,
  no,
  unknown,
}: {
  value: boolean | null | undefined;
  yes: string;
  no: string;
  unknown: string;
}) {
  if (value === true)
    return (
      <Badge tone="success">
        <span aria-hidden="true">✓</span>
        {yes}
      </Badge>
    );
  if (value === false)
    return (
      <Badge tone="magenta">
        <span aria-hidden="true">✕</span>
        {no}
      </Badge>
    );
  return (
    <Badge tone="muted">
      <span aria-hidden="true">?</span>
      {unknown}
    </Badge>
  );
}

function AgentBlock({
  agent,
  ours,
  network,
  asset,
}: {
  agent: ExternalAgent;
  ours: Map<string, ExcludedWallet>;
  network: string;
  asset: string | null;
}) {
  const settled = agent.settled_workflows;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-text">
            {agent.name || agent.agent_id}
          </h4>
          <p className="break-all font-mono text-[11px] text-muted">
            {agent.agent_id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FlagBadge
            value={agent.active}
            yes="active"
            no="inactive"
            unknown="activity unknown"
          />
          <FlagBadge
            value={agent.bound}
            yes="bound"
            no="unbound"
            unknown="binding unknown"
          />
        </div>
      </div>
      {settled.length === 0 ? (
        <p className={body}>No settled workflows yet.</p>
      ) : (
        <StackedTable
          caption={`Settled workflows for ${agent.agent_id}`}
          columns={["Job", "Amount", "Payer", "Settled", "Transaction"]}
          rows={settled.map((w) => ({
            key: w.job_id_hex,
            cells: [
              <span key="job" title={w.job_id_hex}>
                {w.job_id_hex.slice(0, 8)}…
              </span>,
              formatSettledAmount(w.amount_usdc, asset),
              <span key="payer" className="inline-flex flex-wrap gap-2">
                <WalletLink owner={w.payer} network={network} />
                <TeamFundedBadge funding={teamFunding(w, ours)} />
              </span>,
              formatLocalTime(w.settled_at * 1_000),
              <TxLink
                key="tx"
                hash={w.tx_hash}
                explorer={w.explorer}
                network={network}
              />,
            ],
          }))}
        />
      )}
    </>
  );
}

/** Shown beside a payer that is one of our wallets; nothing otherwise. */
function TeamFundedBadge({
  funding,
}: {
  funding: { role: string | null } | null;
}) {
  if (!funding) return null;
  return (
    <Badge tone="violet" className="max-w-full whitespace-normal break-words">
      {teamFundedLabel(funding)}
      <span className="sr-only"> — paid by a wallet we control</span>
    </Badge>
  );
}

function TxLink({
  hash,
  explorer,
  network,
}: {
  hash: string;
  explorer?: string | null;
  network: string;
}) {
  const href = explorerHref(explorer, "tx", hash, network);
  if (!href) return <span>{hash.slice(0, 8)}…</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={hash}
      className={cn(inlineLink, "font-mono")}
    >
      tx {hash.slice(0, 8)}…<span className="sr-only"> on Stellar Expert</span>
    </a>
  );
}

function excludedCells(w: ExcludedWallet, network: string) {
  return [
    <WalletLink
      key="wallet"
      owner={w.owner}
      explorer={w.owner_explorer}
      network={network}
    />,
    w.role || "—",
    exclusionReason(w.reason),
    w.agent_ids.length === 0 ? (
      "none"
    ) : (
      <span key="agents" className="break-all">
        {w.agent_ids.join(", ")}
      </span>
    ),
  ];
}
