/**
 * Orchestrator v2 fixtures: a plan carrying the brief it was built from, the
 * request check's answer, the models behind each planning stage and a tier
 * per step; the check's four refusals; and a run's trace with its stage
 * lines. Shaped by the contract the backend lanes build to (BE branch
 * feat/claude-orchestrator), well-formed, not real.
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

/** Today's e2e plan, as orchestrator v2 answers it. The third step is an
 *  external agent: it has a tier, but no model — it runs on its own stack. */
export const mockPlanV2: DecomposeResponse = {
  ...mockPlan,
  plan_id: "plan_e2e_v2",
  tier: "moderate",
  understood_as: mockSpec,
  guard: { verdict: "allow", tier: "moderate", reasons: [] },
  models: {
    guard: "jev-1.13.0",
    improver: "claude-sonnet-5-5",
    planner: "claude-opus-5-5",
  },
  steps: mockPlan.steps.map((s, i) => ({
    ...s,
    tier: (["low", "moderate", "complex"] as const)[i % 3],
    model:
      i === 2
        ? null
        : (["claude-haiku-4-5", "claude-sonnet-5-5"] as const)[i % 2],
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
  },
};

export type DecomposeAnswer = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

/** A refusal in the backend's error envelope. */
export function refusal(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  headers?: Record<string, string>,
): DecomposeAnswer {
  return {
    status,
    headers,
    body: {
      detail: code,
      error: {
        code,
        message: code.replace(/_/g, " "),
        request_id: "e2e0000000000002",
        ...extra,
      },
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

/** A v2 run's trace: the three planning stages, then steps naming their
 *  model and tier — one tagged, one from a backend that only writes prose. */
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
    stage: "guard",
    tier: "moderate",
    model: "jev-1.13.0",
  },
  {
    t: "01.240",
    level: "exec",
    msg: "Prompt improved by Claude Sonnet 5.5",
    stage: "improve",
    model: "claude-sonnet-5-5",
  },
  // Untagged: the wording alone marks it as a stage.
  {
    t: "03.900",
    level: "exec",
    msg: "Planned by Claude Opus 5.5 (effort medium)",
  },
  {
    t: "04.300",
    level: "exec",
    msg: "seo.brief → outline drafted on Claude Haiku 4.5",
    tier: "low",
    model: "claude-haiku-4-5",
  },
  { t: "04.320", level: "cost", msg: "x402 payment → seo.brief :: 0.009 USDC" },
  { t: "06.870", level: "exec", msg: "code.gen → calculator app generated" },
  { t: "06.900", level: "out", msg: "workflow settled" },
];
