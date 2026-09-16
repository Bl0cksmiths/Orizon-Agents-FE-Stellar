"use client";
/**
 * One agent an operator owns, as a whole picture rather than a table row.
 *
 * The marketplace already lists every agent; what it cannot answer is the
 * question this card exists for — *is my agent actually able to work, and if
 * not, which of the several independent things it needs is missing?* Those
 * things (ownership, an endpoint, routing standing, settlement) are read from
 * four different places and were previously visible on four different screens,
 * if at all. Leaving any one of them out of reach leaves the operator guessing,
 * and guessing is what produces the "it is listed, so it must be running"
 * belief this story exists to break.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { focusRing } from "@/lib/ui";
import type { Agent, ReputationInfo } from "@/lib/types";
import { BindingStateBadge } from "../agents/binding-notice";
import { ManagePanel } from "../agents/manage-panel";
import type { BindingState } from "../agents/use-binding-status";
import { RoutingStanding } from "./routing-standing";

const statusTone = {
  online: "cyan" as const,
  idle: "violet" as const,
  offline: "muted" as const,
};

export function AgentCard({
  agent,
  owner,
  bindingState,
  reputation,
  floorBps,
  priorBps,
  onChanged,
}: {
  agent: Agent;
  owner: string;
  /** Null when no binding claim applies — never render a verdict from it. */
  bindingState: BindingState | null;
  /** Null when the batch did not carry this agent — not a low score. */
  reputation: ReputationInfo | null;
  floorBps: number | null;
  priorBps: number | null;
  onChanged: () => void;
}) {
  const [managing, setManaging] = useState(false);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight">
            {agent.name}
          </h3>
          {/* The id, not the name, is what the chain and every error message
              use, and it is what the operator has to paste into a support
              thread. `break-all` because an id can run 32 characters with no
              break opportunity and would otherwise push the card sideways. */}
          <p className="mt-0.5 break-all font-mono text-[11px] text-muted">
            {agent.id}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone[agent.status]} dot>
            {agent.status}
          </Badge>
          {bindingState && <BindingStateBadge state={bindingState} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-muted">
        <span>
          price <span className="text-text">{agent.price.toFixed(3)}</span> per
          job
        </span>
        <span>
          runs <span className="text-text">{agent.runs}</span>
        </span>
        {agent.skills.length > 0 && (
          <span className="min-w-0 truncate">
            skills <span className="text-text">{agent.skills.join(", ")}</span>
          </span>
        )}
      </div>

      {/* Placed above the settings, not below them. This is the answer to the
          question the operator came with, and burying it under a fold of
          controls is how "my agent is listed, so it must be working" survives
          a dashboard that technically reported otherwise. */}
      <div className="border-t border-border pt-5">
        <RoutingStanding
          agentId={agent.id}
          bindingState={bindingState}
          reputation={reputation}
          floorBps={floorBps}
          priorBps={priorBps}
        />
      </div>

      <div className="border-t border-border pt-4">
        {/* Collapsed by default: these controls sign on-chain transactions,
            and a control that costs a wallet prompt does not belong in a
            surface the operator is only glancing at. The agent id is in the
            button label so several of these on one page are told apart by a
            screen reader rather than all reading "settings".

            The accessible name deliberately does NOT change to "hide" when
            open — `aria-expanded` already carries that, and a control that
            renames itself on click reads to a screen reader as a different
            control appearing where the last one was. The caret is decorative
            for the same reason. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setManaging((v) => !v)}
          aria-expanded={managing}
          className={focusRing}
        >
          <span aria-hidden="true" className="mr-1.5 inline-block">
            {managing ? "▾" : "▸"}
          </span>
          settings for {agent.id}
        </Button>
        {managing && (
          <div className="mt-4">
            <ManagePanel agent={agent} owner={owner} onChanged={onChanged} />
          </div>
        )}
      </div>
    </Card>
  );
}
