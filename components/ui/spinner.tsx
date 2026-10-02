import { cn } from "@/lib/utils";

/**
 * A small ring that turns while something is still on its way. Decorative:
 * the text beside it says what is happening, so it is hidden from assistive
 * tech. It stops turning for readers who ask for reduced motion and stays as
 * a still ring.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-spinner
      className={cn(
        "inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none",
        className,
      )}
    />
  );
}
