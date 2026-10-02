import { Spinner } from "@/components/ui/spinner";
import { REASONS } from "@/lib/network-stats";
import { cn } from "@/lib/utils";

/**
 * "syncing registry…" with a spinner: the backend's registry is refilling
 * after a restart, so the registry's figures beside it are the last complete
 * ones this session read, or dashes — never the partial count.
 */
export function SyncingNote({ className }: { className?: string }) {
  return (
    <span
      data-registry-syncing
      className={cn("inline-flex items-center gap-1.5 text-cyan", className)}
    >
      <Spinner />
      {REASONS.syncing}
    </span>
  );
}
