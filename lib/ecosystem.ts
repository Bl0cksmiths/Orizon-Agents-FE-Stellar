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
  amount_usdc: number;
  /** Who paid. May be one of the team's own wallets — see `isTeamFunded`. */
  payer: string;
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
      isStrArray(v.unreadable_agents))
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
