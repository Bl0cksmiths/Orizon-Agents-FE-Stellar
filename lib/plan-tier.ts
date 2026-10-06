/**
 * Tiers and model names, as the plan card and the trace show them.
 *
 * Orchestrator v2 judges every request, and every step of its plan, as low,
 * moderate or complex, and a built-in worker runs its step on that tier's
 * model. The backend names the model it used; this module only turns what it
 * sent into words. It never maps a tier to a model itself: the per-tier models
 * are configurable on the backend, and a step routed to an external agent runs
 * on its operator's own stack — a tier-derived "Claude" beside it would be a
 * claim nobody made.
 */

import { isTier, type PlanStep, type Tier } from "./types";

/** A tier this build can name, or null — never a guessed one. */
export function readTier(v: unknown): Tier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return isTier(t) ? t : null;
}

/** Each tier's badge: its word, printed with "tier" so the badge never
 *  relies on colour alone, and its tone. Tones step up in emphasis with the
 *  tier and never use magenta, which on the plan card means "your protection
 *  is weaker than it looks". */
export const TIER_COPY: Record<
  Tier,
  { label: string; tone: "muted" | "cyan" | "violet" }
> = {
  low: { label: "low", tone: "muted" },
  moderate: { label: "moderate", tone: "cyan" },
  complex: { label: "complex", tone: "violet" },
};

const CLAUDE_ID = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/;
const JEV_ID = /^jev(?:-(.+))?$/;

/**
 * A model as a buyer reads it: "claude-opus-5-5" → "Claude Opus 5.5",
 * "jev-1.13.0" → "jev 1.13.0". Anything else — a display name the backend
 * already wrote, another provider's id — is shown as sent. Null when there is
 * nothing to name.
 */
export function modelLabel(v: string | null | undefined): string | null {
  const raw = v?.trim();
  if (!raw) return null;
  const claude = CLAUDE_ID.exec(raw);
  if (claude) {
    const [, family, major, minor] = claude;
    const name = family.charAt(0).toUpperCase() + family.slice(1);
    return `Claude ${name} ${minor ? `${major}.${minor}` : major}`;
  }
  const jev = JEV_ID.exec(raw);
  if (jev) return jev[1] ? `jev ${jev[1]}` : "jev";
  return raw;
}

/** The model a step runs on, when the backend names it; null otherwise. */
export function stepModel(
  step: Pick<PlanStep, "model" | "tier">,
): string | null {
  return modelLabel(step.model);
}
