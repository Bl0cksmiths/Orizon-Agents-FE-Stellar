"use client";
/**
 * The Ecosystem page (story 5.02): external adoption against SOW §6.3.
 *
 * External means external. A wallet the Blocksmiths control never counts
 * toward a target, and this page lists those wallets openly instead of
 * leaving them out, so a reviewer can see what was excluded and why.
 *
 * This file owns the request and its states; `AdoptionView` renders the
 * answer. A read that never landed is an error with a retry, never an empty
 * page — an empty page here would read as "no operators", which is a claim.
 */

import { Card } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { WakeStatus } from "@/components/console/wake-status";
import { getStellarNetwork, isComputingError } from "@/lib/api";
import { getEcosystemAdoption } from "@/lib/ecosystem";
import { formatLocalTime } from "@/lib/local-time";
import { useAdoptionSnapshot } from "@/lib/use-adoption-snapshot";
import { useFetch } from "@/lib/use-fetch";
import { AdoptionView } from "./adoption-view";

export default function EcosystemPage() {
  const { data, error, loading, retrying, dataAt, waiting, retryInMs, reload } =
    useFetch(getEcosystemAdoption, [], { revalidateOnFocus: true });
  // The backend answered "computing": it has no report yet and is building
  // one, which takes minutes. A wait with its own words, not the waking line.
  const building = waiting && isComputingError(error);
  // The backend takes minutes over this read. A returning visitor opens on
  // the last figures this browser saw, labelled as such, while it runs.
  const snapshot = useAdoptionSnapshot(data);
  const shown = data ?? snapshot;
  // A backend still waking is a wait, not a failure: the status line covers
  // it, and the error box is kept for reads that really failed.
  const failure = waiting ? null : error;

  // What the settled amounts are in. Best-effort and shared with the top bar
  // through the GET dedupe: while it is unknown the amounts carry no unit,
  // never a guessed one — least of all the "usdc" in the wire field's name.
  const { data: network } = useFetch(getStellarNetwork, []);

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">Ecosystem</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          Who runs agents on Orizon besides us, measured against the three
          adoption targets in SOW §6.3. External means a wallet the Blocksmiths
          do not control; our own wallets never count, and are listed at the
          bottom so you can check.
        </p>
      </div>

      {!shown ? (
        failure ? (
          <ErrorNote onRetry={reload} retrying={loading || retrying}>
            <span className="block">
              Could not read ecosystem adoption. Nothing below is a count of
              zero; the figures simply did not arrive.
            </span>
            <span className="mt-0.5 block break-all opacity-80">{failure}</span>
          </ErrorNote>
        ) : (
          <Card className="space-y-4">
            {building ? (
              <BuildingStatus retryInMs={retryInMs} />
            ) : (
              <WakeStatus active what="ecosystem adoption" />
            )}
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </Card>
        )
      ) : (
        <>
          {!data && (
            // The snapshot is real figures from a real read — just not this
            // visit's. Said once, with its time, until the live read lands.
            <Card className="space-y-1 py-3">
              <p className="font-mono text-[11px] text-muted">
                Showing the last snapshot this browser saved, generated{" "}
                <time
                  dateTime={new Date(shown.generated_at * 1_000).toISOString()}
                >
                  {formatLocalTime(shown.generated_at * 1_000)}
                </time>
                . The live figures replace it as soon as they arrive.
              </p>
              {building ? (
                <BuildingStatus retryInMs={retryInMs} />
              ) : (
                waiting && <WakeStatus active what="ecosystem adoption" />
              )}
            </Card>
          )}
          {failure && (
            <ErrorNote onRetry={reload} retrying={loading || retrying}>
              <span className="block">
                {data
                  ? "Could not refresh ecosystem adoption. Showing the last successful read."
                  : "Could not read ecosystem adoption. Showing the last snapshot this browser saved."}
              </span>
              <span className="mt-0.5 block break-all opacity-80">
                {failure}
              </span>
            </ErrorNote>
          )}
          <StaleBadge
            stale={Boolean(failure)}
            lastSuccessAt={data ? dataAt : shown.generated_at * 1_000}
            what="adoption figures"
          />
          <AdoptionView adoption={shown} asset={network?.asset ?? null} />
        </>
      )}
    </div>
  );
}

/**
 * The backend has no adoption report yet and is building one (`202
 * computing`): every external agent's settlements are scanned, which takes
 * minutes. Said as the wait it is, with when the page asks again — the
 * backend's own Retry-After — and never as a failure or a zero.
 */
function BuildingStatus({ retryInMs }: { retryInMs: number | null }) {
  const seconds = retryInMs === null ? null : Math.round(retryInMs / 1_000);
  return (
    <p
      role="status"
      className="font-mono text-[11px] leading-relaxed text-muted"
    >
      Building the adoption report… The backend reads every external
      agent&apos;s settlements from the chain, which takes a few minutes.
      {seconds !== null && ` This page checks again in ${seconds} s.`}
    </p>
  );
}
