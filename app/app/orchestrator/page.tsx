"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { decompose } from "@/lib/api";
import type { DecomposeResponse, PlanSpec } from "@/lib/types";
import { focusRing } from "@/lib/ui";
import { useAsyncAction } from "@/lib/use-async-action";
import {
  GUARD_NOTICE_ID,
  decomposeErrorCopy,
  decomposeRefusal,
  type DecomposeRefusal,
} from "./_components/plan-errors";

// The request check's notices are their own chunk: most requests pass, and
// the plan page sits at its first-load budget. Fetched as each request goes
// out, so it is in hand by the time a refusal could come back.
const loadGuardNotice = () => import("./_components/guard-notice");
const GuardNotice = dynamic(
  () => loadGuardNotice().then((m) => m.GuardNotice),
  { ssr: false },
);

// The plan card — its pay flows, wallet checks and notices — is its own chunk
// too: nothing on the page needs it until a plan comes back, and the route
// sits at its first-load budget. Fetched as each request goes out, so it is
// in hand by the time the plan is.
const loadExecutionPlan = () => import("./_components/execution-plan");
const ExecutionPlan = dynamic(
  () => loadExecutionPlan().then((m) => m.ExecutionPlan),
  { ssr: false },
);

/** What one decompose asked: the intent, and the edited brief when the buyer
 *  re-planned from one. */
type Ask = { intent: string; spec?: PlanSpec };

/** A decompose's answer as the page renders it: a plan, or the request
 *  check's refusal — a notice of its own, not an error string. */
type Answer =
  | { kind: "plan"; plan: DecomposeResponse }
  | { kind: "refused"; refusal: DecomposeRefusal; fromBrief: boolean };

/** Decompose, with the request check's refusals kept as data and every other
 *  known failure turned into buyer copy before it reaches the alert. */
async function decomposeForBuyer({ intent, spec }: Ask): Promise<Answer> {
  try {
    return { kind: "plan", plan: await decompose(intent, spec) };
  } catch (e) {
    const refusal = decomposeRefusal(e);
    if (refusal)
      return { kind: "refused", refusal, fromBrief: spec !== undefined };
    throw new Error(decomposeErrorCopy(e));
  }
}

const PRESETS = [
  "tetris game in html",
  "calculator web app",
  "snake game in html",
  "pomodoro timer with sound",
];

export default function OrchestratorPage() {
  const [intent, setIntent] = useState("");
  // Decompose is the page's only async flow; the execute flows (simulate /
  // authorize / fiat) live in ExecutionPlan, which is fed `plan.data`.
  const plan = useAsyncAction(decomposeForBuyer);
  // What was asked for the answer on screen, for the planner-fallback and
  // check-unavailable retries. Kept from the submit rather than read back off
  // `plan.data.intent`: the backend does echo it, but no guard checks that it
  // does, and a retry has to ask exactly what the buyer asked — not whatever
  // the box says now. A ref, because it never changes what renders.
  const asked = useRef<Ask>({ intent: "" });
  const intentRef = useRef<HTMLTextAreaElement>(null);

  const answer = plan.data;
  const shown = answer?.kind === "plan" ? answer.plan : null;
  const refused = answer?.kind === "refused" ? answer.refusal : null;
  const refusedBrief = answer?.kind === "refused" && answer.fromBrief;
  // A question waiting on the intent box: it describes the box until the
  // buyer asks again.
  const needsDetail = refused?.kind === "needs_detail";

  const request = (ask: Ask) => {
    if (!ask.intent || plan.pending) return;
    asked.current = ask;
    void loadGuardNotice();
    void loadExecutionPlan();
    // reset() first so the previous answer drops while the new one is in
    // flight instead of lingering under the spinner.
    plan.reset();
    void plan.run(ask);
  };

  const submitIntent = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    request({ intent: intent.trim() });
  };

  // The answer to "tell us more" goes in the intent box, so that is where
  // focus goes when the question arrives.
  useEffect(() => {
    if (needsDetail) intentRef.current?.focus();
  }, [needsDetail]);

  // The intent box is a textarea, so Enter inserts a newline by default —
  // submit instead (Shift+Enter keeps the newline).
  const submitOnEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Orchestrator</h1>
        <p className="mt-1 text-sm text-muted">
          Intent in. Agent chain out. Pay-per-workflow via x402 on Stellar.
        </p>
      </div>

      <Card>
        <form onSubmit={submitIntent}>
          <label
            htmlFor="intent"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan"
          >
            ▸ intent
          </label>
          <textarea
            ref={intentRef}
            id="intent"
            aria-describedby={needsDetail ? GUARD_NOTICE_ID : undefined}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder='e.g. "code a calculator web app"'
            rows={3}
            className="mt-2 w-full bg-bg/60 border border-border p-4 font-mono text-sm placeholder:text-muted focus:border-violet focus:outline-none focus:shadow-neon-violet transition"
          />

          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setIntent(s)}
                  className={`clip-cyber-sm border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted hover:text-text hover:border-violet/60 transition ${focusRing}`}
                >
                  ▸ {s.slice(0, 36)}
                </button>
              ))}
            </div>
            <Button type="submit" disabled={!intent.trim() || plan.pending}>
              {plan.pending ? "◉ Decomposing…" : "Decompose ▸"}
            </Button>
          </div>

          {plan.error && (
            <div
              role="alert"
              className="mt-4 clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3 text-sm leading-relaxed text-magenta"
            >
              {plan.error}
            </div>
          )}
          {refused && (
            <GuardNotice
              className="mt-4"
              refusal={refused}
              fromBrief={refusedBrief}
              onRetry={() => request(asked.current)}
              busy={plan.pending}
            />
          )}
        </form>
      </Card>

      <AnimatePresence>
        {shown && (
          <ExecutionPlan
            plan={shown}
            // The form's own path, so a retry behaves exactly as a fresh
            // submit of the same request: the fallback card drops while the
            // planner is asked again, and nothing runs twice at once.
            onReplan={() => request(asked.current)}
            // The same intent, planned from the buyer's edit of its brief.
            onRespec={(spec) => request({ intent: asked.current.intent, spec })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
