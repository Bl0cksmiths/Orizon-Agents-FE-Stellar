/**
 * Ecosystem adoption (story 5.02): who, besides the team, runs agents on
 * Orizon, measured against the three SOW §6.3 targets.
 *
 * GET /api/ecosystem/adoption answers with the targets, the backend's totals
 * against them, every external operator with their agents and settled
 * workflows, and — just as important — every wallet the team controls, which
 * is listed so it can be seen not to count. This module is the client side of
 * that answer: wire types, guard, request, and the rules the page renders.
 *
 * The rules all lean the same way. A target reads as met only when the
 * backend says so AND its own numbers agree; a payer who is one of our
 * wallets is labelled as such; and a read that could not see every agent says
 * how many it missed instead of letting them read as zero.
 */

import { GET_TIMEOUT_MS, ensure, fetchWithTimeout, httpError } from "./api";
import { assetLabel } from "./money";
import { LIST_YOUR_AGENT_PATH } from "./guide/display";

/** The three SOW §6.3 targets, in the order the SOW states them. */
export const TARGET_KEYS = [
  "external_agents",
  "unique_operator_wallets",
  "settled_external_workflows",
] as const;
export type TargetKey = (typeof TARGET_KEYS)[number];

export type TargetCounts = Record<TargetKey, number>;
export type TargetFlags = Record<TargetKey, boolean>;

/** A workflow an external agent was paid for, with the tx that settled it. */
export type SettledWorkflow = {
  job_id_hex: string;
  tx_hash: string;
  explorer?: string | null;
  /** Named for mainnet. On testnet the settled asset is native XLM, so the
   * unit is never read off this field's name — see `formatSettledAmount`. */
  amount_usdc: number;
  /** Who paid. May be one of the team's own wallets — see `teamFunding`. */
  payer: string;
  /**
   * The payer's role in the team wallet register when the payer is one of our
   * wallets, null when it is not. Absent on a backend that predates it; the
   * `excluded` list is the fallback then.
   */
  payer_team_role?: string | null;
  /** Unix seconds. */
  settled_at: number;
};

export type ExternalAgent = {
  agent_id: string;
  name?: string | null;
  /** Absent or null means the backend could not say, which is shown as such. */
  active?: boolean | null;
  bound?: boolean | null;
  settled_workflows: SettledWorkflow[];
};

export type ExternalOperator = {
  owner: string;
  owner_explorer?: string | null;
  agents: ExternalAgent[];
};

/** Why a wallet is not counted. Any string on the wire; see `exclusionReason`. */
export type ExcludedWallet = {
  owner: string;
  owner_explorer?: string | null;
  reason: string;
  role?: string | null;
  agent_ids: string[];
};

export type EcosystemAdoption = {
  network: string;
  /** Unix seconds. */
  generated_at: number;
  targets: TargetCounts;
  totals: TargetCounts;
  met: TargetFlags;
  operators: ExternalOperator[];
  excluded: ExcludedWallet[];
  /** Part of the chain read failed. */
  degraded?: boolean | null;
  /** The agents that read could not see. */
  unreadable_agents?: string[] | null;
  /**
   * How many days of ledger history the settled-workflow counts cover: the
   * settlement service scans only a recent window of RPC events, so a
   * settlement older than this drops out of every count. Absent on a backend
   * that predates it, in which case the page says nothing about a window
   * rather than guessing one.
   */
  window_days?: number | null;
};

export const ADOPTION_PATH = "/ecosystem/adoption";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isOptionalStr = (v: unknown): v is string | null | undefined =>
  v === undefined || v === null || isStr(v);
const isOptionalBool = (v: unknown): v is boolean | null | undefined =>
  v === undefined || v === null || typeof v === "boolean";
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isStr);

/** Every target present and a finite number. These are the page's headline
 * figures; a string here would print as "NaN of 2". */
const isCounts = (v: unknown): v is TargetCounts =>
  isRecord(v) && TARGET_KEYS.every((k) => isNum(v[k]));

/** Strictly boolean: the string "false" is truthy, and would mark a missed
 * target as met. */
const isFlags = (v: unknown): v is TargetFlags =>
  isRecord(v) && TARGET_KEYS.every((k) => typeof v[k] === "boolean");

function isSettledWorkflow(v: unknown): v is SettledWorkflow {
  return (
    isRecord(v) &&
    isStr(v.job_id_hex) &&
    isStr(v.tx_hash) &&
    isOptionalStr(v.explorer) &&
    isNum(v.amount_usdc) &&
    isStr(v.payer) &&
    // A role is rendered as text beside the payer; an object there would take
    // the page down, and a `true` would say nothing about who paid.
    isOptionalStr(v.payer_team_role) &&
    isNum(v.settled_at)
  );
}

function isExternalAgent(v: unknown): v is ExternalAgent {
  return (
    isRecord(v) &&
    isStr(v.agent_id) &&
    isOptionalStr(v.name) &&
    isOptionalBool(v.active) &&
    isOptionalBool(v.bound) &&
    Array.isArray(v.settled_workflows) &&
    v.settled_workflows.every(isSettledWorkflow)
  );
}

function isExternalOperator(v: unknown): v is ExternalOperator {
  return (
    isRecord(v) &&
    isStr(v.owner) &&
    isOptionalStr(v.owner_explorer) &&
    Array.isArray(v.agents) &&
    v.agents.every(isExternalAgent)
  );
}

/** `reason` is checked as a string, NOT against the two reasons this build
 * knows: a wallet excluded for a reason added later must still be listed as
 * excluded, never dropped — dropping it would hide a wallet we control. */
function isExcludedWallet(v: unknown): v is ExcludedWallet {
  return (
    isRecord(v) &&
    isStr(v.owner) &&
    isOptionalStr(v.owner_explorer) &&
    isStr(v.reason) &&
    isOptionalStr(v.role) &&
    isStrArray(v.agent_ids)
  );
}

/**
 * The whole payload, checked as a whole. Not screened item by item as the
 * agent list is: every figure on this page is a claim to a reviewer, and a
 * page that silently left out an operator or an excluded wallet would make a
 * claim the payload did not. A malformed answer is an error state instead.
 */
export function isEcosystemAdoption(v: unknown): v is EcosystemAdoption {
  return (
    isRecord(v) &&
    isStr(v.network) &&
    isNum(v.generated_at) &&
    isCounts(v.targets) &&
    isCounts(v.totals) &&
    isFlags(v.met) &&
    Array.isArray(v.operators) &&
    v.operators.every(isExternalOperator) &&
    Array.isArray(v.excluded) &&
    v.excluded.every(isExcludedWallet) &&
    isOptionalBool(v.degraded) &&
    (v.unreadable_agents === undefined ||
      v.unreadable_agents === null ||
      isStrArray(v.unreadable_agents)) &&
    // A window is a positive span of days. A string would print as the
    // window verbatim, and zero or less is no window at all.
    (v.window_days === undefined ||
      v.window_days === null ||
      (isNum(v.window_days) && v.window_days > 0))
  );
}

/** Reads the adoption figures. Not deduped, for the reason
 * `getAgentReadiness` is not: its retry button must really ask again. */
export async function getEcosystemAdoption(): Promise<EcosystemAdoption> {
  const res = await fetchWithTimeout(
    "GET",
    ADOPTION_PATH,
    { cache: "no-store" },
    GET_TIMEOUT_MS,
  );
  if (!res.ok) throw await httpError("GET", ADOPTION_PATH, res);
  return ensure(ADOPTION_PATH, isEcosystemAdoption)(await res.json());
}

/** What each target is called on the page, and what counts toward it. */
export const TARGET_COPY: Record<TargetKey, { label: string; counts: string }> =
  {
    external_agents: {
      label: "Externally operated agents",
      counts: "Agents owned by a wallet the Blocksmiths do not control.",
    },
    unique_operator_wallets: {
      label: "Unique operator wallets",
      counts: "Distinct external wallets that own at least one agent.",
    },
    settled_external_workflows: {
      label: "Workflows routed to external agents and settled",
      counts: "Paid workflows, each with a settlement transaction on-chain.",
    },
  };

/** One target as the page states it. */
export type TargetRow = {
  key: TargetKey;
  current: number;
  target: number;
  met: boolean;
  /** How many more are needed; 0 when met. */
  shortBy: number;
};

/**
 * The three targets, each met only when the backend says it is met AND its
 * own total reaches the target. The two disagreeing is a backend defect, and
 * a defect must never be what turns a miss into a claim of success in front
 * of a reviewer — so the disagreement reads as the miss the numbers show.
 */
export function targetRows(a: EcosystemAdoption): TargetRow[] {
  return TARGET_KEYS.map((key) => {
    const current = a.totals[key];
    const target = a.targets[key];
    const met = a.met[key] === true && current >= target;
    return {
      key,
      current,
      target,
      met,
      shortBy: met ? 0 : Math.max(0, target - current),
    };
  });
}

/** "0 of 3 targets met." — the page's one-line verdict. */
export function targetsVerdict(rows: TargetRow[]): string {
  const met = rows.filter((r) => r.met).length;
  return `${met} of ${rows.length} targets met.`;
}

/** The sentence under a missed target. Plain: how many, of how many, and how
 * far off. Never "almost", never "nearly". */
export function missSentence(row: TargetRow): string {
  return `Not met: ${row.current} of ${row.target}, short by ${row.shortBy}.`;
}

/** Every wallet the team controls, keyed by owner, for labelling payers. */
export function excludedOwners(
  a: EcosystemAdoption,
): Map<string, ExcludedWallet> {
  return new Map(a.excluded.map((w) => [w.owner, w]));
}

/**
 * Whether one of our own wallets paid for a settlement, and in what role; null
 * when an outsider paid. It is still a real on-chain settlement, but it is not
 * an outsider paying an outsider, and the page must not let it pass as one.
 *
 * `payer_team_role` decides: a string is the backend reading its own team
 * wallet register. The `excluded` list is the fallback — when the field is
 * absent (an older backend), and also when it is null for a payer the very
 * same payload lists as ours. That contradiction is resolved toward the label,
 * because the failure it guards against is a team payment passing as an
 * outsider's in front of a reviewer.
 */
export function teamFunding(
  w: Pick<SettledWorkflow, "payer" | "payer_team_role">,
  excluded: Map<string, ExcludedWallet>,
): { role: string | null } | null {
  if (typeof w.payer_team_role === "string") {
    return { role: w.payer_team_role.trim() || null };
  }
  const ours = excluded.get(w.payer);
  return ours ? { role: ours.role?.trim() || null } : null;
}

/** "team-funded: settler", or plain "team-funded" when no role is known. */
export function teamFundedLabel(funding: { role: string | null }): string {
  return funding.role ? `team-funded: ${funding.role}` : "team-funded";
}

/** Why a wallet does not count, in words. A reason this build does not know
 * is shown as sent: still excluded, never hidden. */
export function exclusionReason(raw: string): string {
  switch (raw) {
    case "team_wallet":
      return "Team wallet";
    case "platform_key":
      return "Platform key";
    default:
      return raw.replace(/_/g, " ") || "Excluded";
  }
}

/**
 * The degraded read, as a sentence, or null when the read was whole. Counts
 * the agents it could not see when the backend names them; says "every agent"
 * when it only knows the read was partial. Either way it is a gap, and the
 * sentence says it is not a zero.
 */
export function unverifiedSentence(a: EcosystemAdoption): string | null {
  const n = a.unreadable_agents?.length ?? 0;
  if (n === 0 && a.degraded !== true) return null;
  const who =
    n === 0
      ? "Couldn't verify every agent right now"
      : `Couldn't verify ${n} agent${n === 1 ? "" : "s"} right now`;
  return `${who}. Whatever they would add is missing from the figures below until they can be read again — a gap, not a zero.`;
}

/** `GABC…WXYZ`. The full address always goes alongside, for screen readers
 * and for copying. */
export function shortAddress(g: string): string {
  return g.length > 12 ? `${g.slice(0, 4)}…${g.slice(-4)}` : g;
}

/**
 * A settled amount in the unit the escrow actually settles in: `asset` is
 * what GET /api/stellar/network reports, "native" (XLM) on testnet — the same
 * source and the same `assetLabel` every other money figure in the console
 * uses. The wire field is called `amount_usdc`, but that is its mainnet name,
 * not its unit. Up to seven decimals (the asset's precision), never rounded
 * to a figure that was not paid; while the asset is unknown, no unit at all
 * rather than a guessed one.
 */
export function formatSettledAmount(
  n: number,
  asset: string | null | undefined,
): string {
  const figure = n.toLocaleString("en-US", { maximumFractionDigits: 7 });
  const unit = assetLabel(asset);
  return unit ? `${figure} ${unit}` : figure;
}

/**
 * The operator docs: how an outside operator registers, binds and verifies a
 * dispatch. It is the public guide on this site, readable with no login and
 * versioned against the backend commit it was checked on.
 */
export const OPERATOR_DOCS_URL = LIST_YOUR_AGENT_PATH;
