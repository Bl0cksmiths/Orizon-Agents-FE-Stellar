/**
 * Orchestrator v2 fixtures: a plan carrying the brief it was built from, the
 * request check's answer, the models behind each planning stage and a tier
 * per step; the check's four refusals; and a run's trace with its stage
 * lines. Shaped by the backend's contract (BE feat/claude-orchestrator,
 * 79738b4), well-formed, not real.
 */
import type { Page } from "@playwright/test";
import type { DecomposeResponse, PlanSpec, TraceLine } from "../lib/types";
import { mockPlan } from "./mocks";

export const mockSpec: PlanSpec = {
  goal: "A working calculator that adds, subtracts, multiplies and divides",
  deliverable: "One self-contained HTML file",
  constraints: ["No external libraries", "Works on a phone screen"],
  done_criteria: [
    "Every operation gives the right answer",
    "Dividing by zero shows a message instead of crashing",
  ],
  summary: "Build a calculator web app as one HTML file that works on phones.",
};

/** The built-in model per tier, as `models.tiers` names them. */
const TIERS = {
  low: "claude-haiku-4-5",
  moderate: "claude-sonnet-5-5",
  complex: "claude-opus-5-5",
} as const;

/** Today's e2e plan, as orchestrator v2 answers it (BE feat/claude-orchestrator
 *  `DecomposeResponse`): a tier per step, the models by exact id with the
 *  per-tier map, the brief, the check and the planning stages. */
export const mockPlanV2: DecomposeResponse = {
  ...mockPlan,
  plan_id: "plan_e2e_v2",
  tier: "complex",
  understood_as: mockSpec,
  guard: { verdict: "allow", tier: "complex", reasons: ["tier_rounded_up"] },
  models: {
    guard: "jev-1.13.0",
    improver: "claude-sonnet-5-5",
    planner: "claude-opus-5-5",
    tiers: TIERS,
  },
  stages: [
    { stage: "guard", msg: "Request checked by jev (tier: complex)" },
    { stage: "improve", msg: "Prompt improved by Claude Sonnet 5.5" },
    { stage: "recheck", msg: "Improved request re-checked by jev" },
    { stage: "plan", msg: "Planned by Claude Opus 5.5 (effort high)" },
  ],
  steps: mockPlan.steps.map((s, i) => ({
    ...s,
    tier: (["low", "moderate", "complex"] as const)[i % 3],
  })),
};

/** The plan answering an edited brief. */
export const mockPlanV2Respecced: DecomposeResponse = {
  ...mockPlanV2,
  plan_id: "plan_e2e_v2_respec",
  understood_as: {
    ...mockSpec,
    deliverable: "A zip with separate HTML, CSS and JS files",
  },
};

/** A plan whose brief and model ids are long unbroken tokens, for the 360px
 *  frame: nothing in it may widen the card. */
export const mockPlanV2Long: DecomposeResponse = {
  ...mockPlanV2,
  plan_id: "plan_e2e_v2_long",
  understood_as: {
    ...mockSpec,
    goal: `A calculator for ${"supercalifragilistic".repeat(5)} sums`,
    constraints: [`No ${"x".repeat(120)}`],
  },
  models: {
    guard: "jev-1.13.0",
    improver: "claude-sonnet-5-5",
    planner: `custom-planner-model-${"0123456789".repeat(4)}`,
    tiers: {
      ...TIERS,
      complex: `custom-worker-model-${"0123456789".repeat(4)}`,
    },
  },
};

export type DecomposeAnswer = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

/** A refusal as the backend sends it (`_refused` in app/routers/orchestrator.py):
 *  the envelope, with the buyer-facing sentence as `error.message` and — for a
 *  blocked request or a question — again under its own name at the top. */
export function refusal(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): DecomposeAnswer {
  const field = (
    { intent_blocked: "reason", intent_needs_detail: "question" } as Record<
      string,
      string
    >
  )[code];
  return {
    status,
    headers,
    body: {
      detail: code,
      error: { code, message, request_id: "e2e0000000000002" },
      ...(field ? { [field]: message } : {}),
    },
  };
}

/**
 * Answers POST /api/orchestrator/decompose with each answer in turn — the
 * last repeating — and records every request body. Call it AFTER `mockApi`,
 * so this route wins.
 */
export async function mockDecomposeAnswers(
  page: Page,
  answers: readonly DecomposeAnswer[],
): Promise<Array<{ intent: string; spec?: PlanSpec }>> {
  const asked: Array<{ intent: string; spec?: PlanSpec }> = [];
  await page.route("**/api/orchestrator/decompose", (route) => {
    asked.push(route.request().postDataJSON());
    const a = answers[Math.min(asked.length, answers.length) - 1];
    return route.fulfill({
      status: a.status,
      contentType: "application/json",
      headers: a.headers,
      body: JSON.stringify(a.body),
    });
  });
  return asked;
}

export const ok = (plan: DecomposeResponse): DecomposeAnswer => ({
  status: 200,
  body: plan,
});

/** A v2 run's trace as the backend writes it: untagged lines, the planning
 *  stages first, then each Claude step naming its model and tier in words. */
export const mockTraceV2: TraceLine[] = [
  {
    t: "00.000",
    level: "input",
    msg: "intent received → 'calculator web app'",
  },
  {
    t: "00.180",
    level: "exec",
    msg: "Request checked by jev (tier: moderate)",
  },
  { t: "01.240", level: "exec", msg: "Prompt improved by Claude Sonnet 5.5" },
  { t: "01.420", level: "exec", msg: "Improved request re-checked by jev" },
  {
    t: "03.900",
    level: "exec",
    msg: "Planned by Claude Opus 5.5 (effort medium)",
  },
  {
    t: "04.300",
    level: "exec",
    msg: "seo.brief on Claude Haiku 4.5 (tier: low)",
  },
  { t: "04.320", level: "cost", msg: "x402 payment → seo.brief :: 0.009 USDC" },
  { t: "06.870", level: "exec", msg: "code.gen → calculator app generated" },
  { t: "06.900", level: "out", msg: "workflow settled" },
];
