import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import {
  StellarExpertLink,
  defaultExplorerNetwork,
} from "@/components/ui/stellar-link";
import { fallbackReputationLedgerId } from "@/lib/contract-addresses";
import type { ReputationParams } from "@/lib/types";
import { cn } from "@/lib/utils";

// Fallback until /reputation/params loads. The id comes from the shared
// address book (lib/contract-addresses.ts) rather than a local constant so
// there is one place in this repo to be stale, and so CI can compare that one
// place against the deploy scripts' address book. Resolved against the BUILD's
// network — a fallback is shown precisely when the backend has not told us
// which network it is on, so its own reported network cannot select it.
const FALLBACK_CONTRACT_ID = fallbackReputationLedgerId(defaultExplorerNetwork);

const METHODS = [
  {
    method: "submit",
    signature:
      "submit(caller, agent_id, job_id, rating_0_to_100, weight, payer, kind)",
    notes:
      'scorer-gated write, replay-guarded per (agent, job); kind is "auto" | "buyer" | "dispute"',
  },
  {
    method: "rep_state",
    signature: "rep_state(agent_id)",
    notes: "decayed evidence state (sum_w, weight, count, disputed)",
  },
  {
    method: "avg_bps",
    signature: "avg_bps(agent_id)",
    notes: "decayed raw mean, 0–10000",
  },
  {
    method: "rep_bps",
    signature: "rep_bps(agent_id, prior_bps, prior_weight)",
    notes: "prior-smoothed mean computed on-chain",
  },
  {
    method: "dispute_rate_bps",
    signature: "dispute_rate_bps(agent_id)",
    notes: "dispute share of an agent's evidence, 0–10000",
  },
  {
    method: "set_scorer",
    signature: "set_scorer(new_scorer)",
    notes: "admin only",
  },
];

const ERRORS = [
  { name: "Unauthorized", code: 1 },
  { name: "NotFound", code: 2 },
  { name: "Replay", code: 7 },
  { name: "OutOfRange", code: 100 },
];

/**
 * ReputationLedger v2 reference card — contract id chip + explorer link, the
 * method interface, error codes, and a constants strip driven by the
 * /reputation/params response (em dashes while params is null).
 *
 * When that read fails the constants strip is replaced by an announced error:
 * five em dashes look like a ledger with nothing configured rather than a
 * backend we could not reach.
 */
export function OnchainDetails({
  params,
  loading = false,
  error = null,
  retrying = false,
  onRetry,
}: {
  params: ReputationParams | null;
  loading?: boolean;
  error?: string | null;
  /** An automatic retry is scheduled or in flight (`useFetch.retrying`). */
  retrying?: boolean;
  onRetry?: () => void;
}) {
  // A hardcoded id is a guess about the chain, not a reading of it: the
  // backend may be pointed at a redeployed ledger. Rendered as "unverified"
  // so a stale constant is never mistaken for on-chain truth.
  const verified = Boolean(params?.contract_id);
  const contractId = params?.contract_id ?? FALLBACK_CONTRACT_ID;
  const network = params?.network ?? defaultExplorerNetwork;
  const constants = [
    {
      label: "epoch length",
      value: params ? `${params.epoch_seconds / 86400} days` : null,
    },
    {
      label: "retention per epoch",
      value: params ? `${params.decay_bps_per_epoch / 100}%` : null,
    },
    {
      label: "full-forget horizon",
      value: params ? `${params.max_decay_epochs} epochs` : null,
    },
    {
      label: "weight cap",
      value: params ? `${params.max_rating_weight_usdc} USDC` : null,
    },
    {
      label: "read cache TTL",
      value: params ? `${params.read_ttl_seconds}s` : null,
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          ReputationLedger v2
        </h2>
        <span
          title={
            verified
              ? contractId
              : `${contractId} — hardcoded fallback, not confirmed by the backend`
          }
          aria-label={
            verified
              ? contractId
              : `${contractId}, unverified fallback contract id`
          }
          className={cn(
            "clip-cyber-sm border px-2 py-0.5 font-mono text-[10px] tracking-widest",
            verified
              ? "border-border bg-bg/60 text-muted"
              : "border-magenta/40 bg-magenta/5 text-magenta",
          )}
        >
          {contractId.slice(0, 8)}…{contractId.slice(-4)}
        </span>
        {!verified && <Badge tone="magenta">unverified</Badge>}
        <StellarExpertLink kind="contract" id={contractId} network={network} />
      </div>

      {!verified && (
        <p className="mt-2 font-mono text-[10px] text-magenta">
          contract id not confirmed by the backend — showing the build-time
          fallback for {defaultExplorerNetwork}. Verify on-chain before trusting
          it.
        </p>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
              <th scope="col" className="pb-3 pr-4 text-left">
                method
              </th>
              <th scope="col" className="pb-3 pr-4 text-left">
                signature
              </th>
              <th scope="col" className="pb-3 text-left">
                notes
              </th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((row) => (
              <tr
                key={row.method}
                className="border-b border-border/50 last:border-0"
              >
                <th
                  scope="row"
                  className="py-3 pr-4 text-left font-mono font-normal text-cyan"
                >
                  {row.method}
                </th>
                <td className="py-3 pr-4 font-mono text-xs text-text whitespace-nowrap">
                  {row.signature}
                </td>
                <td className="py-3 text-muted">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          error codes
        </span>
        {ERRORS.map((e) => (
          <Badge key={e.name} tone="magenta">
            {e.name} = {e.code}
          </Badge>
        ))}
      </div>

      <div className="mt-5 border-t border-border/50 pt-4">
        {/* Error before the constants strip, and it stays put across an
            automatic retry — the alternative is five em dashes blinking in
            and out of a card that claims to describe the live ledger. */}
        {error ? (
          <ErrorNote
            className="clip-cyber-sm"
            onRetry={onRetry}
            retrying={retrying || loading}
          >
            ledger constants unavailable — epoch length, decay, weight cap and
            cache TTL could not be read from the backend. {error}
          </ErrorNote>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {constants.map((c) => (
              <div key={c.label}>
                <dt className="text-[10px] uppercase tracking-widest text-muted">
                  {c.label}
                </dt>
                <dd className="mt-1 font-mono text-sm text-text">
                  {c.value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Card>
  );
}
