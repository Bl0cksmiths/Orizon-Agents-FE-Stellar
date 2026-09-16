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
import type { Agent } from "@/lib/types";
import { BindingStateBadge } from "../agents/binding-notice";
import { ManagePanel } from "../agents/manage-panel";
import type { BindingState } from "../agents/use-binding-status";

const statusTone = {
  online: "cyan" as const,
  idle: "violet" as const,
  offline: "muted" as const,
};

export function AgentCard({
  agent,
  owner,
  bindingState,
  onChanged,
}: {
  agent: Agent;
  owner: string;
  /** Null when no binding claim applies — never render a verdict from it. */
  bindingState: BindingState | null;
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

      <div className="border-t border-border pt-4">
        {/* Collapsed by default: these controls sign on-chain transactions,
            and a control that costs a wallet prompt does not belong in a
            surface the operator is only glancing at. The agent id is in the
            button label so several of these on one page are told apart by a
            screen reader rather than all reading "settings". */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setManaging((v) => !v)}
          aria-expanded={managing}
          className={focusRing}
        >
          {managing ? "hide settings" : `settings for ${agent.id}`}
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
