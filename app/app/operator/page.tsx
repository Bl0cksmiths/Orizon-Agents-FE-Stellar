"use client";
/**
 * The operator dashboard (story 2.06): everything the connected wallet owns,
 * and whether any of it can actually earn.
 *
 * Ownership is resolved from the chain and nothing else. There is no local
 * record of "agents I registered", deliberately — a browser-side list would
 * disagree with the chain the moment an agent is transferred, registered from
 * a different device, or registered by a script, and the disagreement would
 * always favour showing an operator something that is no longer theirs.
 * `ownedAgents` filters on the on-chain `owner`, so a wallet that owns nothing
 * sees an honest empty state rather than a stale one.
 *
 * The page reads two collections and one per-agent lookup, and every one of
 * them can fail independently:
 *
 *   - the registry list, without which there is nothing to show at all;
 *   - the reputation batch, which is best-effort — a missing score must read
 *     as "not known", never as a low one;
 *   - endpoint binding, one request per owned agent, capped by
 *     `useBindingStatus`.
 *
 * Settlement is fetched per card by the panel that renders it, not here: it is
 * an event scan on the backend and pulling every agent's at once would turn
 * opening this page into the most expensive thing the console does.
 */

import { useCallback, useMemo } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { ErrorNote } from "@/components/ui/error-note";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { listAgents, listReputation } from "@/lib/api";
import { ownedAgents } from "@/lib/binding-status";
import { useFetch } from "@/lib/use-fetch";
import { useWallet } from "@/lib/wallet";
import { AgentCard } from "./agent-card";
import { useBindingStatus } from "../agents/use-binding-status";

export default function OperatorPage() {
  const wallet = useWallet();
  const address = wallet.connected ? wallet.address : null;

  const {
    data: agents,
    error,
    loading,
    retrying,
    lastSuccessAt,
    reload: reloadAgents,
  } = useFetch(listAgents, [], { revalidateOnFocus: true });

  // Best-effort, exactly as the marketplace treats it: a failed reputation read
  // must not blank the page or imply a bad score. Its absence is rendered as
  // "not known" further down, which is what it means.
  const { data: repBatch, reload: reloadReputation } = useFetch(
    listReputation,
    [],
    { revalidateOnFocus: true },
  );

  const binding = useBindingStatus(agents, address);

  const owned = useMemo(() => ownedAgents(agents, address), [agents, address]);

  const retry = useCallback(() => {
    reloadAgents();
    reloadReputation();
  }, [reloadAgents, reloadReputation]);

  // Counted rather than inferred. `stateOf` returns "checking" and "error" as
  // states of their own, and neither may be folded into "not bound": the tile
  // would then accuse an operator's live agent of being broken on the strength
  // of a request that simply has not come back.
  const boundCount = owned.filter(
    (a) => binding.stateOf(a.id) === "bound",
  ).length;
  const settledBinding = owned.filter((a) => {
    const state = binding.stateOf(a.id);
    return state === "bound" || state === "unbound";
  }).length;

  // Eligibility uses the Wilson LOWER BOUND against the floor, never the
  // headline score — that is the rule the backend actually applies, and the
  // gap between the two is the most common reason an operator believes their
  // agent is eligible when it is not.
  const eligibleCount = repBatch
    ? owned.filter((a) => {
        const rep = repBatch.reputations[a.id];
        return (
          binding.stateOf(a.id) === "bound" &&
          rep != null &&
          rep.lower_bound_bps >= repBatch.floor_bps
        );
      }).length
    : null;

  const ratedJobs = repBatch
    ? owned.reduce(
        (sum, a) => sum + (repBatch.reputations[a.id]?.count ?? 0),
        0,
      )
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">My Agents</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">
            Every agent this wallet owns on-chain, and whether it can be
            selected for work.
          </p>
        </div>
        <ButtonLink variant="primary" href="/app/register">
          + Register agent
        </ButtonLink>
      </div>

      {!address ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Connect a wallet
          </h2>
          <p className="max-w-[70ch] text-sm text-muted">
            Agent ownership is recorded on-chain against an account, so there is
            nothing to show until a wallet is connected. Connecting reads public
            registry data only — it signs nothing and moves no funds.
          </p>
          <ConnectWallet />
        </Card>
      ) : error ? (
        <ErrorNote onRetry={retry} retrying={loading || retrying}>
          <span className="block">could not read the agent registry</span>
          <span className="mt-0.5 block break-all opacity-80">{error}</span>
        </ErrorNote>
      ) : !agents ? (
        <Card className="space-y-4">
          <LoadingStatus label="Loading your agents…" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : owned.length === 0 ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">
            This wallet owns no agents
          </h2>
          <p className="max-w-[70ch] text-sm text-muted">
            Ownership is read from the chain, not from this browser. An agent
            registered from a different wallet will not appear here even on the
            same machine — connect the wallet that signed its registration.
          </p>
          <ButtonLink variant="primary" href="/app/register">
            Register an agent
          </ButtonLink>
        </Card>
      ) : (
        <>
          <Card>
            <StaleBadge
              stale={Boolean(error)}
              lastSuccessAt={lastSuccessAt}
              what="registry data"
              className="mb-4"
            />
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <StatTile label="agents owned" value={owned.length} />
              <StatTile
                label="endpoint bound"
                value={boundCount}
                unit={`of ${owned.length}`}
                hint={
                  settledBinding < owned.length
                    ? "some endpoints still being checked"
                    : undefined
                }
              />
              <StatTile
                label="eligible"
                value={eligibleCount ?? "—"}
                unit={eligibleCount === null ? undefined : `of ${owned.length}`}
                hint={
                  eligibleCount === null
                    ? "reputation unavailable"
                    : "bound and above the routing floor"
                }
              />
              <StatTile
                label="rated jobs"
                value={ratedJobs ?? "—"}
                hint={
                  ratedJobs === null
                    ? "reputation unavailable"
                    : "completed work rated on-chain"
                }
              />
            </div>
          </Card>

          <ul className="space-y-6">
            {owned.map((agent) => (
              <li key={agent.id}>
                <AgentCard
                  agent={agent}
                  owner={address}
                  bindingState={binding.stateOf(agent.id)}
                  onChanged={retry}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
