"use client";
import { memo, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/error-note";
import { StaleBadge } from "@/components/ui/stale-badge";
import { NETWORK_LABEL, StellarExpertLink } from "@/components/ui/stellar-link";
import { getStellarNetwork } from "@/lib/api";
import { focusRing } from "@/lib/ui";
import { useFetch } from "@/lib/use-fetch";
import { useStellarEvents, type FeedEvent } from "@/lib/stellar-events";
import { prettyName } from "@/lib/utils";

const FEED_OPTIONS = { intervalMs: 5000, max: 60 };

// Display label for the configured network — "mainnet" | "testnet".

export default function EventsPage() {
  // `reload` re-fetches the contract ids, which yields a fresh `contractIds`
  // array — that restarts the events subscription too, so one retry control
  // recovers from both a backend failure and an RPC failure.
  const {
    data: info,
    error: loadError,
    loading: infoLoading,
    retrying: infoRetrying,
    reload: retry,
  } = useFetch(getStellarNetwork, []);

  // What every retry control on this page reports: an attempt is in flight,
  // or `useFetch` has one scheduled on its own backoff. Without the second
  // half the button would read "retry" during the 2s/4s/8s gaps between
  // automatic attempts, as if nothing were happening.
  const reconnecting = infoRetrying || infoLoading;

  const contractIds = useMemo(
    () => (info ? Object.values(info.contracts) : null),
    [info],
  );

  // Reverse map id → label so we can display "PaymentEscrow" instead of CBJP…
  const idToLabel = useMemo(() => {
    if (!info) return new Map<string, string>();
    const m = new Map<string, string>();
    for (const [name, id] of Object.entries(info.contracts)) {
      m.set(id, prettyName(name));
    }
    return m;
  }, [info]);

  const { status, events, latestLedger, lastTickAt, error } = useStellarEvents(
    contractIds,
    FEED_OPTIONS,
  );

  const ageSec =
    lastTickAt !== null
      ? Math.max(0, Math.floor((Date.now() - lastTickAt) / 1000))
      : null;

  // The feed isn't ready while the contract list is still being fetched or
  // the stellar-sdk chunk is loading ("starting") — during that window an
  // empty list means "still loading", not "no events".
  //
  // Deliberately keyed off `loadError` rather than `infoLoading`: `useFetch`
  // retries a transient failure on its own and flips `loading` back to true
  // for every attempt, but the error survives until one succeeds. Reading the
  // error is what keeps a failing feed on a stable error surface instead of
  // cycling error → "connecting…" → error once per attempt.
  const feedLoading =
    status === "starting" || (contractIds === null && !loadError);

  // A failed contract-id fetch means the feed never starts, so `status` stays
  // "idle" and `events` stays empty — indistinguishable from a healthy feed
  // with nothing to show. Track the failure explicitly so the UI can say so.
  const failureMessage = loadError ?? error;
  const feedState = failureMessage !== null ? "error" : status;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-muted">
            Live Soroban contract events for Orizon's four contracts. Polling{" "}
            <code className="text-cyan">getEvents</code> from {NETWORK_LABEL}{" "}
            RPC every 5 s.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge tone={feedState === "live" ? "success" : "magenta"} dot>
            {feedState === "live"
              ? "live"
              : feedState === "starting"
                ? "starting…"
                : feedState === "error"
                  ? "error"
                  : "idle"}
          </Badge>
          {latestLedger !== null && (
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              ledger #{latestLedger}
            </span>
          )}
          {ageSec !== null && (
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              last poll: {ageSec}s ago
            </span>
          )}
          {/* The feed keeps whatever it last received when a poll fails, so
              the rows, the ledger number and the event count all freeze in
              place while still reading as live. `lastTickAt` is null until a
              poll has actually landed, so a feed that never started shows
              nothing here — that is a failure, and the cards below say so. */}
          <StaleBadge
            lastSuccessAt={lastTickAt}
            stale={failureMessage !== null}
            what="the event feed"
          />
        </div>
      </div>

      {loadError && (
        <Card>
          <ErrorNote
            className="border-0 bg-transparent p-0 text-[11px]"
            onRetry={retry}
            retrying={reconnecting}
          >
            backend offline — {loadError}
          </ErrorNote>
        </Card>
      )}

      {error && (
        <Card>
          <ErrorNote
            className="border-0 bg-transparent p-0"
            onRetry={retry}
            retryLabel="restart feed"
            retrying={reconnecting}
          >
            <span className="block text-[10px] uppercase tracking-[0.25em] mb-2">
              ▸ rpc error
            </span>
            <span className="block text-[11px] break-all">{error}</span>
          </ErrorNote>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan">
            ▸ contract event feed
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {failureMessage !== null && events.length === 0
              ? "unavailable"
              : `${events.length} ${events.length === 1 ? "event" : "events"}`}
          </span>
        </div>

        {/* Failure first, ahead of both the loading and the empty branch.
            Never fall through to the "no events yet" copy on a failure — an
            empty feed we could not even start is a broken feed, not an idle
            one — and never fall back to the connecting placeholder either,
            which would flicker in and out as `useFetch` retries. */}
        {failureMessage !== null && events.length === 0 ? (
          <ErrorNote
            className="border-0 bg-transparent p-0"
            onRetry={retry}
            retrying={reconnecting}
          >
            <span className="block text-[10px] uppercase tracking-[0.25em] mb-2">
              ▸ feed unavailable
            </span>
            <span className="block text-[11px] break-all">
              {failureMessage}
            </span>
          </ErrorNote>
        ) : feedLoading && events.length === 0 ? (
          <div className="space-y-2">
            <div role="status" className="text-sm text-muted">
              Connecting to the event feed…
            </div>
            <div className="flex gap-3 pt-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex-1 h-16 clip-cyber-sm border border-border bg-bg/40 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="space-y-2">
            <div className="text-sm text-muted">
              No events yet. Run a workflow on{" "}
              <Link
                href="/app/orchestrator"
                className={`text-cyan underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan ${focusRing}`}
              >
                /app/orchestrator
              </Link>{" "}
              — it'll publish <code className="text-cyan">charge</code> and{" "}
              <code className="text-cyan">seal</code> events that show up here
              within a ledger.
            </div>
            <div className="flex gap-3 pt-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex-1 h-16 clip-cyber-sm border border-border bg-bg/40 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-2">
            {events.map((e) => (
              <EventRow key={e.id} event={e} idToLabel={idToLabel} />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

// Memoized: the feed re-polls every 5s — rows whose event object and
// idToLabel Map (stable via useMemo) haven't changed skip re-rendering.
const EventRow = memo(function EventRow({
  event,
  idToLabel,
}: {
  event: FeedEvent;
  idToLabel: Map<string, string>;
}) {
  const label = idToLabel.get(event.contractId) ?? "Unknown";
  const topic = event.topics[0] || "·";
  return (
    <li className="clip-cyber-sm border border-border bg-bg/40 p-3 hover:border-violet/50 transition">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge tone="violet">{label}</Badge>
          <code className="font-mono text-sm text-cyan">{topic}</code>
          {event.topics.slice(1).length > 0 && (
            <span className="font-mono text-[10px] text-muted">
              + {event.topics.slice(1).length} arg
              {event.topics.length > 2 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span>ledger #{event.ledger}</span>
          <span>·</span>
          <span>{relativeTime(event.ledgerClosedAt)}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-[11px] text-muted break-all">
          {summarize(event.value)}
        </div>
        <StellarExpertLink
          kind="tx"
          id={event.txHash}
          className={`whitespace-nowrap ${focusRing}`}
        >
          tx ▸ {event.txHash.slice(0, 8)}…
        </StellarExpertLink>
      </div>
    </li>
  );
});

function summarize(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean")
    return String(v);
  try {
    const s = JSON.stringify(v, (_k, val) =>
      typeof val === "bigint" ? val.toString() : val,
    );
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return String(v);
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
