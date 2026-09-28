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
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StaleBadge } from "@/components/ui/stale-badge";
import { getEcosystemAdoption } from "@/lib/ecosystem";
import { useFetch } from "@/lib/use-fetch";
import { AdoptionView } from "./adoption-view";

export default function EcosystemPage() {
  const { data, error, loading, retrying, lastSuccessAt, reload } = useFetch(
    getEcosystemAdoption,
    [],
    { revalidateOnFocus: true },
  );

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

      {!data ? (
        error ? (
          <ErrorNote onRetry={reload} retrying={loading || retrying}>
            <span className="block">
              Could not read ecosystem adoption. Nothing below is a count of
              zero; the figures simply did not arrive.
            </span>
            <span className="mt-0.5 block break-all opacity-80">{error}</span>
          </ErrorNote>
        ) : (
          <Card className="space-y-4">
            <LoadingStatus label="Loading ecosystem adoption…" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </Card>
        )
      ) : (
        <>
          {error && (
            <ErrorNote onRetry={reload} retrying={loading || retrying}>
              <span className="block">
                Could not refresh ecosystem adoption. Showing the last
                successful read.
              </span>
              <span className="mt-0.5 block break-all opacity-80">{error}</span>
            </ErrorNote>
          )}
          <StaleBadge
            stale={Boolean(error)}
            lastSuccessAt={lastSuccessAt}
            what="adoption figures"
          />
          <AdoptionView adoption={data} />
        </>
      )}
    </div>
  );
}
