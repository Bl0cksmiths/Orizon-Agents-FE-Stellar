import { cn } from "@/lib/utils";

/**
 * Key-value row for definition lists (session details, receipts, tx facts).
 * `children` renders custom value content (links, multi-line); `value` is the
 * plain-text shorthand. `divider` draws the bordered dl style used inside
 * cards; without it the row is a bare flex line (tx-status style).
 */
export function KVRow({
  k,
  value,
  divider = true,
  valueClassName,
  children,
}: {
  k: string;
  value?: string;
  divider?: boolean;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        divider
          ? "border-b border-border/40 pb-2 last:border-0"
          : "items-baseline flex-wrap",
      )}
    >
      <dt className="text-muted text-[10px] uppercase tracking-widest pt-1">
        {k}
      </dt>
      {/* overflow-wrap: anywhere, not word-break: break-all. Both let a
          56-character address or a hash wrap on a phone, but break-all also
          split prose values mid-word ("soroban r / pc event retention",
          "Septe / mber 2015") where a space was right there. */}
      <dd
        className={cn(
          "text-right text-text [overflow-wrap:anywhere]",
          valueClassName,
        )}
      >
        {children ?? value}
      </dd>
    </div>
  );
}
