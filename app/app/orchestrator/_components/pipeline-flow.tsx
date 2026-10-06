/**
 * A multi-agent plan, read as the pipeline it is.
 *
 * The planner composes the platform's specialists so each step's output flows
 * into the next — research into the brief, the brief into the copy, the copy
 * into the build. The step list says what each one contributes (its
 * rationale); these say the order they run in and where each one's output
 * goes, which is what makes four rows of agents read as one job.
 */
import type { PlanStep } from "@/lib/types";

const nameOf = (s: PlanStep) => s.agent_name ?? s.agent_id;

/** The run order at a glance, above the steps. Nothing for one step. */
export function PipelineOverview({ steps }: { steps: PlanStep[] }) {
  if (steps.length < 2) return null;
  const names = steps.map(nameOf);
  return (
    <div className="mb-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
        pipeline · {steps.length} agents in order
      </p>
      <p className="sr-only">
        {`${steps.length} agents run in order: ${names.join(", then ")}. Each hands its output to the next.`}
      </p>
      {/* The sentence above says it; the chain is for the eye. It wraps at
          the arrows on a phone, and a long name wraps inside its chip. */}
      {/* Divs, not a list: the chain is hidden from assistive tech, and a
          second list of the same agents would only repeat the steps. */}
      <div
        data-pipeline-chain
        aria-hidden="true"
        className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px]"
      >
        {names.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="flex max-w-full items-center gap-1.5"
          >
            {i > 0 && <div className="text-muted">→</div>}
            <div
              data-pipeline-agent
              className="max-w-full border border-violet/40 bg-violet/10 px-1.5 py-0.5 text-text [overflow-wrap:anywhere]"
            >
              {name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Under a step: the step its output goes to. `index` is the receiving
 *  step's 0-based position, numbered as the step list numbers it. */
export function HandoffNote({ to, index }: { to: PlanStep; index: number }) {
  return (
    <p className="basis-full pl-12 font-mono text-[10px] tracking-wide text-muted [overflow-wrap:anywhere]">
      <span aria-hidden="true">↓</span> hands its output to step{" "}
      {String(index + 1).padStart(2, "0")} · {nameOf(to)}
    </p>
  );
}
