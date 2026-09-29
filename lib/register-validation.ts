/**
 * Pure client-side validation for the agent register form (story 1.04).
 *
 * Mirrors the backend `RegisterAgentReq` rules so the form can reject bad
 * input before the network round-trip, with the same limits the server
 * enforces: `agent_id` and each `skill` match `^[A-Za-z0-9_]{1,32}$`, `name`
 * is 1–100 chars, `skills` is capped at 16, and `price_usdc` is `(0, 10000]`.
 * Price is entered in whole units of the network's settlement asset and
 * settled on-chain in stroops (×1e7). `price_usdc` is the wire field's name,
 * not the asset: on testnet the escrow's SAC wraps native XLM (F-022).
 *
 * Every validator returns `null` when the field is valid, or a short inline
 * error string otherwise — ready to render beside the field. Each function is
 * pure.
 */

import { assetLabel } from "./money";

/**
 * The price field's label, in the network's asset: "price per step (XLM)" on
 * testnet, and no unit while the asset is unknown — never the "USDC" in the
 * wire field's name. The Register page labels it the way the plan card and
 * the receipt label their amounts.
 */
export function priceFieldLabel(asset: string | null | undefined): string {
  const unit = assetLabel(asset);
  return unit ? `price per step (${unit})` : "price per step";
}

/** The hint under an empty price field, in the same unit as its label. */
export function priceEntryHint(asset: string | null | undefined): string {
  const unit = assetLabel(asset);
  return unit
    ? `entered in ${unit}, converted once at submit`
    : "converted to stroops once at submit";
}

/** Backend charset for `agent_id` and every skill token: letters, digits and
 * underscore, 1–32 characters (`RegisterAgentReq`). */
export const AGENT_ID_RE = /^[A-Za-z0-9_]{1,32}$/;

/**
 * Validate the agent id. Reserved is checked *before* the charset so that a
 * value like `agt_x!` — which is both reserved and malformed — surfaces the
 * more actionable "reserved" message rather than a generic charset error
 * (mirrors the backend `id_reserved` guard, which likewise pre-empts the
 * pattern check for the seeded-catalog prefix).
 */
export function validateAgentId(id: string): string | null {
  if (id.length === 0) return "Agent ID is required";
  if (id.startsWith("agt_"))
    return "agt_ ids are reserved for the seeded catalog";
  if (!AGENT_ID_RE.test(id))
    return "Letters, digits and underscore only, 1-32 characters";
  return null;
}

/** Validate the display name: 1–100 chars after trimming surrounding space. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Display name is required";
  if (trimmed.length > 100) return "100 characters maximum";
  return null;
}

/** Validate a single skill token as it is entered (before it joins the list). */
export function validateSkill(skill: string): string | null {
  if (skill.length === 0) return "Empty skill";
  if (!AGENT_ID_RE.test(skill))
    return "Letters, digits and underscore only, 1-32 characters";
  return null;
}

/**
 * Clean a raw skill list into the form the backend accepts: trim each token,
 * lowercase it, drop empties and any token failing the charset, dedupe while
 * keeping first-seen order, and cap at 16. Pure — returns the cleaned list.
 *
 * Lowercasing is a front-end nicety only; the backend accepts A–Z, so the
 * lowercased output still passes its pattern check.
 */
export function normalizeSkills(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim().toLowerCase();
    if (s.length === 0 || !AGENT_ID_RE.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length === 16) break;
  }
  return out;
}

/**
 * List-level check for the whole skills array. An empty list is allowed — the
 * backend defaults `skills` to an empty list (`default_factory=list`).
 */
export function validateSkills(skills: string[]): string | null {
  if (skills.length > 16) return "16 skills maximum";
  if (skills.some((s) => !AGENT_ID_RE.test(s)))
    return "Each skill: letters, digits and underscore, 1-32 chars";
  return null;
}

/**
 * Validate the price, in whole units of the settlement asset. Accepts the raw string an `<input>` yields as
 * well as a number. Must parse to a finite value in `(0, 10000]`.
 */
export function validatePriceUsdc(v: number | string): string | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "Enter a valid price";
  if (n <= 0) return "Price must be greater than 0";
  // No unit: this validator cannot see the network, and the one in the wire
  // field's name ("usdc") is not the asset testnet settles in.
  if (n > 10000) return "10000 maximum";
  return null;
}

/** Whole units → stroops, the on-chain unit: `usdc * 1e7`, rounded (`0.054 → 540000`). */
export function usdcToStroops(usdc: number): number {
  return Math.round(usdc * 1e7);
}

export type RegisterFormErrors = {
  agent_id?: string;
  name?: string;
  skills?: string;
  price_usdc?: string;
  form?: string;
};

/**
 * Whether every synchronous field of the register form is valid: `owner` must
 * be non-empty and each field validator must return `null`.
 *
 * This covers the synchronous fields only. The page additionally gates the
 * submit button on the asynchronous `agent_id` availability check, which is
 * resolved separately and is not represented here.
 */
export function isRegisterFormValid(values: {
  owner: string;
  agent_id: string;
  name: string;
  skills: string[];
  price_usdc: number | string;
}): boolean {
  return (
    values.owner.trim().length > 0 &&
    validateAgentId(values.agent_id) === null &&
    validateName(values.name) === null &&
    validateSkills(values.skills) === null &&
    validatePriceUsdc(values.price_usdc) === null
  );
}
