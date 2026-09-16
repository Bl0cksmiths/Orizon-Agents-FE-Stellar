/**
 * How an unbound agent shows up in the marketplace (story 2.05, AC-3 and AC-4).
 *
 * Two pieces, because the row and the warning answer different questions: the
 * badge marks the agent in the list an operator is scanning, the notice is the
 * warning plus the action that finishes the job.
 *
 * The wording is imported, never retyped. `UNBOUND_WARNING` says the agent
 * *cannot be selected for work* rather than that it "will fail" — an unbound
 * agent is passed over when the plan is built, so it never fails anything, and
 * an operator told the wrong thing looks for the wrong symptom.
 */

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { bindHref, UNBOUND_WARNING } from "@/lib/binding-status";
import type { BindingState } from "./use-binding-status";

/**
 * The marker on the agent's row.
 *
 * A bound agent gets nothing — the ordinary state is not news. `checking` and
 * `error` deliberately render in the muted tone with their own words: a row
 * whose status has not resolved must not look like a verdict.
 */
export function BindingStateBadge({ state }: { state: BindingState }) {
  if (state === "bound") return null;
  if (state === "unbound") return <Badge tone="magenta">unbound</Badge>;
  return (
    <Badge tone="muted">
      {state === "checking" ? "checking endpoint…" : "endpoint unknown"}
    </Badge>
  );
}

/**
 * The warning and the way out of it.
 *
 * The action carries the agent id in the link itself (`bindHref`) and in its
 * label, so the operator never retypes an id that reached us from the chain,
 * and so several of these on one page are told apart by screen readers.
 */
export function UnboundNotice({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  return (
    <div className="clip-cyber-sm border border-magenta/40 bg-magenta/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[70ch] font-mono text-[11px] leading-relaxed text-magenta">
          ⚠ <span className="text-text">{agentName}</span> — {UNBOUND_WARNING}
        </p>
        <ButtonLink
          variant="outline"
          size="sm"
          href={bindHref(agentId)}
          className="max-w-full shrink-0"
        >
          bind {agentId}
        </ButtonLink>
      </div>
    </div>
  );
}
