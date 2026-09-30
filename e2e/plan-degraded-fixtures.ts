import type { DecomposeResponse, PlanStep } from "../lib/types";
import { mockPlanExcluded } from "./mocks";

/**
 * Plan-card fixtures for the reputation read failing, shaped as the backend
 * actually sends them, and for the card's edge shapes.
 *
 * Kept apart from e2e/mocks.ts, whose `mockPlanDegraded` drifted from the
 * backend: its degraded step carries neither `rep_degraded` nor
 * `rep_lower_bound_bps`, which the backend always sends (`rep_degraded: bool
 * = False` in app/schemas.py). Specs using it exercised the legacy plan-wide
 * fallback path rather than the one production takes.
 */

/** What a step carries when its ledger read failed and the prior was served
 *  in its place (7000, lower bound 5677). A failed read yields no evidence,
 *  so there is no count and no dispute rate. */
const priorServed = {
  rep_bps: 7000,
  rep_source: "prior",
  rep_lower_bound_bps: 5677,
  rep_count: 0,
  rep_dispute_rate_bps: 0,
  rep_degraded: true,
} satisfies Partial<PlanStep>;

/**
 * A COLD START: the ledger could not be read at all, so every agent reverted
 * to the prior. The prior's bound (5677) clears the 5500 floor, so the floor
 * acts on nobody and there are no notices — the case where a plain "floor
 * applied" was most convincing and least true. This is the live degraded
 * case; a backend audit found it routine rather than rare.
 */
export const mockPlanColdStart = {
  ...mockPlanExcluded,
  plan_id: "plan_e2e_cold_start",
  steps: mockPlanExcluded.steps.map((s) => ({ ...s, ...priorServed })),
  notices: [],
  reputation_degraded: true,
} satisfies DecomposeResponse;

/**
 * A PARTIAL outage, the corrected `mockPlanDegraded`: two reads held and
 * carry their measured bounds, `code.next`'s failed and carries the prior
 * with its own `rep_degraded`. The two exclusions still quote measured
 * bounds, because those reads succeeded.
 */
export const mockPlanPartialOutage = {
  ...mockPlanExcluded,
  plan_id: "plan_e2e_partial_outage",
  steps: [
    {
      ...mockPlanExcluded.steps[0],
      rep_lower_bound_bps: 8197,
      rep_count: 31,
      rep_dispute_rate_bps: 0,
      rep_degraded: false,
    },
    {
      ...mockPlanExcluded.steps[1],
      rep_lower_bound_bps: 7224,
      rep_count: 12,
      rep_dispute_rate_bps: 833,
      rep_degraded: false,
    },
    { ...mockPlanExcluded.steps[2], ...priorServed },
  ],
  reputation_degraded: true,
} satisfies DecomposeResponse;

/** An on-chain agent id: 56 characters with no break opportunity. Agent
 *  names may run to 100 (lib/register-validation.ts), so this is not the
 *  worst case, only a real one. */
export const LONG_AGENT_ID =
  "CAPHXWU53UZUZJGV7IAE57NNMH3YYB5MTWO6YA53KKMXSFVLOITBJ3GQ";

/**
 * Steps named only by long unbroken ids — no `agent_name`, so the id is the
 * name — one of them standing in for another long id. At 360px these used
 * to run past the step row and be clipped by the card without a trace.
 */
export const mockPlanLongNames = {
  ...mockPlanColdStart,
  plan_id: "plan_e2e_long_names",
  steps: mockPlanColdStart.steps.map((s, i) => ({
    ...s,
    agent_id: `${LONG_AGENT_ID.slice(0, 50)}${String(i).padStart(6, "X")}`,
    agent_name: undefined,
    ...(i === 0 ? { substituted_for: LONG_AGENT_ID } : {}),
  })),
} satisfies DecomposeResponse;

/** A plan with no steps and nothing to pay. The guard accepts one, so the
 *  card has to render it without offering to take money for it. */
export const mockPlanNoSteps = {
  plan_id: "plan_e2e_no_steps",
  intent: "an intent the planner found nothing to do for",
  steps: [],
  total_usdc: 0,
  total_eta: 0,
  floor_bps: 5500,
  notices: [],
  reputation_degraded: false,
} satisfies DecomposeResponse;

/** The multi-word name that broke mid-word on orizons.xyz at 390px
 *  (2026-09-30): "…(deliberate, tea / m-run)". */
export const LONG_MULTI_WORD_NAME = "Faulty test agent (deliberate, team-run)";

/** A Stellar account address: 56 characters with no break opportunity, the
 *  shape an unnamed external agent's owner-derived id can take. */
export const LONG_ACCOUNT_ID =
  "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3";

/**
 * Exclusions whose names are long in both ways: a multi-word name that must
 * wrap between its words, and unbroken ids that can only wrap inside
 * themselves. The first step carries the multi-word name too, since the step
 * chips wrap by the same rule.
 */
export const mockPlanLongExclusionNames = {
  ...mockPlanExcluded,
  plan_id: "plan_e2e_long_exclusion_names",
  steps: [
    {
      ...mockPlanExcluded.steps[0],
      agent_name: LONG_MULTI_WORD_NAME,
      substituted_for: LONG_ACCOUNT_ID,
    },
    ...mockPlanExcluded.steps.slice(1),
  ],
  notices: [
    {
      kind: "excluded",
      agent_id: "faulty.team-run",
      agent_name: LONG_MULTI_WORD_NAME,
      reason: "below routing floor (3100 < 5500 bps)",
      reason_code: "below_floor",
      lower_bound_bps: 3100,
      floor_bps: 5500,
    },
    {
      kind: "substituted",
      agent_id: LONG_ACCOUNT_ID,
      agent_name: null,
      replacement_id: LONG_AGENT_ID,
      replacement_name: null,
      reason: "below routing floor (4167 < 5500 bps)",
      reason_code: "below_floor",
      lower_bound_bps: 4167,
      floor_bps: 5500,
    },
  ],
} satisfies DecomposeResponse;
