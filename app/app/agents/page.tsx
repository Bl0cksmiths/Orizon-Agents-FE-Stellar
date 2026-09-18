"use client";
import { Fragment, useCallback, useMemo, useState } from "react";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { ReputationBadge } from "@/components/ui/reputation-badge";
import { AgentStanding } from "@/components/agents/agent-standing";
import { RegistryStandingNotice } from "@/components/agents/registry-standing-notice";
import { listAgents, listReputation } from "@/lib/api";
import { isOwnedBy } from "@/lib/binding-status";
import { focusRing } from "@/lib/ui";
import { useFetch } from "@/lib/use-fetch";
import { useWallet } from "@/lib/wallet";
import type { Agent } from "@/lib/types";
import { BindingStateBadge, UnboundNotice } from "./binding-notice";
import { ManagePanel } from "./manage-panel";
import { useBindingStatus } from "./use-binding-status";

const statusTone = {
  online: "cyan" as const,
  idle: "violet" as const,
  offline: "muted" as const,
};

export default function AgentsPage() {
  const {
    data: agents,
    error,
    loading,
    retrying,
    lastSuccessAt,
    reload: reloadAgents,
  } = useFetch(listAgents, [], {
    revalidateOnFocus: true,
  });
  // On-chain reputation is best-effort: on error we silently keep seeded values.
  const { data: repBatch, reload: reloadReputation } = useFetch(
    listReputation,
    [],
    { revalidateOnFocus: true },
  );

  // One outage takes down both reads, so a retry re-runs them together.
  const retry = useCallback(() => {
    reloadAgents();
    reloadReputation();
  }, [reloadAgents, reloadReputation]);
  const [q, setQ] = useState("");
  /**
   * Whether an agent can be selected for work right now — both gates the
   * orchestrator applies, and nothing else.
   *
   * 1. Its reputation LOWER BOUND clears the floor (`>=`, the backend's
   *    comparison). Never the smoothed headline score: the two disagree
   *    exactly for an agent with a good average and too little settled work
   *    behind it, and filtering on the headline would show a buyer a
   *    "routable" agent the planner passes over every time.
   * 2. If it is an on-chain agent, it has an endpoint bound. A seeded agent
   *    has no endpoint and needs none, so `bound` being null is not a failure.
   *
   * An agent with no reputation entry, or a page whose batch has not landed,
   * is NOT filtered out: absence of a score is not evidence of a bad one, and
   * hiding a row because we have not read it yet would quietly shrink the
   * marketplace during an outage.
   */
  // Memoised on the batch it reads, so the row filter below can depend on it
  // without rebuilding the whole table on every keystroke in the search box.
  const isRoutable = useCallback(
    (a: Agent): boolean => {
      if (a.source === "onchain" && a.bound === false) return false;
      const floor = repBatch?.floor_bps;
      const bound = repBatch?.reputations[a.id]?.lower_bound_bps;
      if (floor == null || bound == null) return true;
      return bound >= floor;
    },
    [repBatch],
  );

  const [filter, setFilter] = useState<
    "all" | "routable" | "online" | "idle" | "offline"
  >("all");
  // Operator management (story 1.08): the connected wallet reveals Manage on
  // the agents it owns on-chain; one row expands at a time.
  const wallet = useWallet();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Endpoint-binding status (story 2.05), asked about this operator's own
  // on-chain agents and nothing else. A disconnected wallet owns nothing, so
  // passing null here is what stops the page from asking about anything at all.
  const binding = useBindingStatus(
    agents,
    wallet.connected ? wallet.address : null,
  );

  const rows = useMemo(() => {
    if (!agents) return [];
    return agents.filter((a) => {
      const ql = q.toLowerCase();
      const matchesQ =
        !ql ||
        a.name.toLowerCase().includes(ql) ||
        a.skills.some((s) => s.toLowerCase().includes(ql));
      // "routable" is a standing question, not a status one, so it is checked
      // separately rather than squeezed into the status comparison — `status`
      // means online/idle/offline and an agent can be online and ineligible.
      const matchesStatus =
        filter === "all" ||
        (filter === "routable" ? isRoutable(a) : a.status === filter);
      return matchesQ && matchesStatus;
    });
  }, [agents, q, filter, isRoutable]);

  const renderReputation = (a: Agent) => {
    const live = repBatch?.reputations[a.id];
    if (live && live.source === "onchain") {
      return (
        <ReputationBadge
          bps={live.smoothed_bps}
          lowerBoundBps={live.lower_bound_bps}
          source="onchain"
          count={live.count}
          disputeRateBps={live.dispute_rate_bps}
          floorBps={repBatch?.floor_bps}
        />
      );
    }
    return (
      <ReputationBadge
        bps={a.rep * 2000}
        lowerBoundBps={live?.lower_bound_bps}
        source="prior"
        // Whether this prior is a cold start or a chain read that did not come
        // back. The two are identical in the payload apart from this flag, and
        // the badge's cold-start wording is a false claim about the history of
        // an agent whose record we merely could not reach.
        degraded={live?.degraded}
        floorBps={repBatch?.floor_bps}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Agent Registry
          </h1>
          <p className="mt-1 text-sm text-muted">
            ERC-8004 profiles — identity, skills, price, reputation.
          </p>
        </div>
        <ButtonLink variant="primary" href="/app/register">
          + Register agent
        </ButtonLink>
      </div>

      {/* Above the table, because it states the threshold every verdict inside
          the table refers to. A buyer who meets "below floor" on a row before
          they have been told what the floor is has to reverse-engineer the
          rule from the verdicts. */}
      <RegistryStandingNotice batch={repBatch ?? null} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[240px]">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
            >
              <circle
                cx="9"
                cy="9"
                r="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M14 14l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              aria-label="Search agents by name or skill"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search name or skill…"
              className={`clip-cyber-sm w-full border border-input bg-bg/60 pl-10 pr-4 h-10 text-sm placeholder:text-muted focus:border-violet transition ${focusRing}`}
            />
          </div>
          <div className="flex gap-2">
            {/* "routable" sits next to "all" rather than at the end: it is the
                question a buyer actually arrives with — who can I hire — and
                the three status values after it are a narrower, more technical
                cut. Clicking "all" is the way back, which is why this joins
                the existing group instead of becoming a second control. */}
            {(["all", "routable", "online", "idle", "offline"] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    `clip-cyber-sm border px-3 h-10 font-mono text-[10px] uppercase tracking-widest transition ${focusRing} ` +
                    (filter === f
                      ? "border-violet bg-violet/20 text-text"
                      : "border-border text-muted hover:text-text")
                  }
                >
                  {f}
                </button>
              ),
            )}
          </div>
          {/* Rendered only once a registry has actually been fetched — the
              hook drops `lastSuccessAt` with the data it dates, so a first
              load that never landed shows the error frame alone. */}
          <StaleBadge
            stale={Boolean(error)}
            lastSuccessAt={lastSuccessAt}
            what="agent registry"
          />
        </div>

        {/* `retrying` covers the gaps *between* automatic attempts, when the
            hook is asleep on its backoff and `loading` is false — without it
            the frame flips back to an idle "retry" button and reads like a
            dead end mid-recovery. */}
        {error && (
          <ErrorNote
            className="mb-4 clip-cyber-sm"
            onRetry={retry}
            retrying={loading || retrying}
          >
            backend offline — {error}
          </ErrorNote>
        )}

        {/* Focusable, and named, because it scrolls. The registry is wider
            than a phone and often wider than a laptop once reputation loads,
            so this div becomes a horizontal scroll container — and a scroll
            container a keyboard cannot reach hides the columns beyond the
            fold from anyone not using a mouse (WCAG 2.1.1). axe flags it
            `scrollable-region-focusable`, at serious severity.

            It failed intermittently rather than always for an instructive
            reason: the region is only scrollable once its content overflows,
            and the content only widens when the reputation batch lands. So
            the violation raced the fetch, and looked like a flaky test. */}
        <div
          className={`overflow-x-auto ${focusRing}`}
          tabIndex={0}
          role="region"
          aria-label="Agent registry table, scrolls horizontally"
        >
          {/* A floor is set as well as a fill. Story 3.05 put standing marks
              in the agent cell, which widened it and left the numeric columns
              to crush — the header ran together as "REPUTATIONRUNSSTATUS" and
              the runs figures clipped. The container is already a keyboard-
              reachable horizontal scroller, so below this width the right
              answer is to scroll rather than to squeeze columns a buyer is
              trying to compare. */}
          <table className="w-full min-w-[60rem] text-sm">
            {/* The page heading names this table on screen; the caption
                repeats it for assistive tech only. */}
            <caption className="sr-only">
              Agent registry — identity, skills, price, reputation, runs and
              status
            </caption>
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                <th scope="col" className="pb-3 text-left">
                  id
                </th>
                <th scope="col" className="pb-3 text-left">
                  agent
                </th>
                <th scope="col" className="pb-3 text-left">
                  skills
                </th>
                <th scope="col" className="pb-3 text-right">
                  price / call
                </th>
                <th scope="col" className="pb-3 text-right">
                  reputation
                </th>
                <th scope="col" className="pb-3 text-right">
                  runs
                </th>
                <th scope="col" className="pb-3 text-left">
                  status
                </th>
                {/* The actions column is unlabelled by design — name it for
                    screen readers without printing a header. */}
                <th scope="col" className="pb-3">
                  <span className="sr-only">actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* `!error` first: a retry attempt flips `loading` back to true,
                  and a skeleton must never win over the error frame — that
                  alternation is what makes a failing page look alive. */}
              {!agents &&
                !error &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td colSpan={8} className="py-3">
                      <Skeleton className="h-5 w-full" />
                      {i === 0 && <LoadingStatus label="Loading agents…" />}
                    </td>
                  </tr>
                ))}

              {!agents && error && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-muted font-mono text-xs"
                  >
                    couldn&apos;t load agents — the registry is unreachable.
                  </td>
                </tr>
              )}

              {rows.map((a, i) => {
                // Ownership is resolved from the connected wallet against the
                // on-chain owner — never a local record (story 1.08 rule).
                // Shared with the bind surfaces via `isOwnedBy` so the rule has
                // one definition rather than a copy per page.
                const owned = wallet.connected && isOwnedBy(a, wallet.address);
                const open = owned && expandedId === a.id;
                // Null for every row we make no claim about: the seeded
                // catalog, other operators' agents, and anything past the
                // lookup cap. Those rows render no binding marker at all.
                const bindingState = binding.stateOf(a.id);
                return (
                  <Fragment key={a.id}>
                    <m.tr
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      className="border-b border-border/50 last:border-0 hover:bg-violet/5 transition"
                    >
                      {/* The agent id identifies the row, so it is the row
                      header; `text-left font-normal` only holds the cell's
                      existing look against the th defaults. */}
                      <th
                        scope="row"
                        className="py-3 text-left font-mono text-xs font-normal text-muted"
                      >
                        {a.id}
                      </th>
                      <td className="py-3 font-mono">
                        <div className="flex flex-wrap items-center gap-2">
                          {a.name}
                          {/* The `LIVE` badge that used to sit here has been
                              removed rather than relabelled.

                              It rendered on `a.real`, which means "backed by a
                              real Agno worker rather than a MockWorker" — an
                              internal fact about the first-party catalog, and
                              very nearly the inverse of provenance:
                              `registry_sync` sets it false for EVERY on-chain
                              agent, and the seeded catalog is a mix. So the
                              one population it could never mark is the
                              externally registered agents this marketplace
                              exists to make visible, while a buyer reading a
                              cyan "LIVE" chip would reasonably take it for the
                              opposite.

                              Provenance is now `AgentStanding`'s job, from
                              `source`. Leaving both would put two contradictory
                              provenance signals in one row. */}
                          {/* Marks the agent itself, not its liveness — the
                              status column next door means online/idle/offline
                              and must not be confused with this. */}
                          {bindingState !== null && (
                            <BindingStateBadge state={bindingState} />
                          )}
                          {/* Standing sits beside the name rather than in its
                              own column: it is a set of conditional marks, and
                              an empty column on every healthy row would cost
                              horizontal space on a table that already scrolls
                              sideways on a phone. */}
                          <AgentStanding
                            agent={a}
                            rep={repBatch?.reputations[a.id] ?? null}
                            floorBps={repBatch?.floor_bps ?? null}
                            // The lookup above answers binding for this row
                            // whenever it asked; the cell then stays silent on
                            // it, so the row states one answer, not two.
                            bindingLookup={bindingState !== null}
                          />
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {a.skills.map((s) => (
                            <Badge key={s} tone="muted">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono text-cyan">
                        {a.price.toFixed(3)}
                      </td>
                      <td className="py-3 text-right">{renderReputation(a)}</td>
                      <td className="py-3 text-right font-mono text-xs text-muted">
                        {a.runs.toLocaleString()}
                      </td>
                      <td className="py-3">
                        <Badge
                          tone={statusTone[a.status]}
                          dot={a.status === "online"}
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        {owned ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(open ? null : a.id)}
                          >
                            {open ? "▾ close" : "⚙ manage"}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            title="coming soon"
                          >
                            ▸ view
                          </Button>
                        )}
                      </td>
                    </m.tr>
                    {/* The warning sits directly under its own row, always
                        open. An operator who closed the tab before binding has
                        to see it without expanding anything (AC-3), and Manage
                        is a panel they may never open. */}
                    {bindingState === "unbound" && (
                      <tr className="border-b border-border/50 bg-bg/20">
                        <td colSpan={8} className="px-1 pb-4">
                          <UnboundNotice agentId={a.id} agentName={a.name} />
                        </td>
                      </tr>
                    )}
                    {/* A lookup that failed says exactly that. Rendering it as
                        unbound would accuse a live agent of being unroutable,
                        and rendering nothing would hide that we never found
                        out. */}
                    {bindingState === "error" && (
                      <tr className="border-b border-border/50 bg-bg/20">
                        <td colSpan={8} className="px-1 pb-4">
                          <ErrorNote
                            className="clip-cyber-sm"
                            onRetry={binding.recheck}
                            retryLabel="recheck"
                            retrying={binding.rechecking}
                          >
                            couldn&apos;t check whether {a.name} has an endpoint
                            bound — its status is unknown.
                          </ErrorNote>
                        </td>
                      </tr>
                    )}
                    {open && (
                      <tr className="border-b border-border/50 bg-bg/20">
                        <td colSpan={8} className="px-1 pb-4">
                          <ManagePanel
                            agent={a}
                            owner={a.owner ?? ""}
                            onChanged={retry}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {agents && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-muted font-mono text-xs"
                  >
                    no agents match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
