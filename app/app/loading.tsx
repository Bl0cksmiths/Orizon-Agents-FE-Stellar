import { Card } from "@/components/ui/card";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback for every console page.
 *
 * It deliberately mirrors the shared console layout — page header, tile row,
 * table card — instead of a centered stack, so a navigation fades from shell
 * to content in place rather than snapping from centered bars to a
 * left-aligned grid.
 */
export default function Loading() {
  return (
    <div className="space-y-8">
      <LoadingStatus label="Loading console…" />

      {/* Page header: title + subtitle on the left, action/badge on the right. */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Stat tiles. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="min-w-0 p-4 sm:p-6">
            <Skeleton className="h-3 w-24 mb-4" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>

      {/* Table / list card. */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-3 w-full mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
