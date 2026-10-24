import { ErrorNote } from "@/components/ui/error-note";
import type { StoreOutage } from "@/lib/store-outage";
import type { DisputePanelView } from "@/lib/types";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * Why the receipt could not be read, in the reader's terms: the backend
 * named its record store, or it only failed — a 500 from a backend older
 * than the store's own code says no more than that.
 */
const CAUSE: Record<StoreOutage["kind"], string> = {
  store: "the dispute records are temporarily unreachable",
  server: "the server couldn't read the dispute records just now",
};

/**
 * The banner's sentence for an outage, by what is on screen beneath it.
 *
 * Nothing drawn (`hidden`): the panel has read nothing of this run, so it
 * vouches for no payment it never saw — only that an outage of these records
 * changes nothing already settled on-chain, and nothing in the trace, which
 * renders from its own stream. A receipt drawn: it is the last read, and the
 * words date it rather than deny it (see the section's `error` banner). A
 * settled one shows on-chain transactions, which no outage here can touch.
 *
 * The opening words are the section's own for any failure — "receipt
 * unavailable" and "this receipt may be out of date" — so a reader and the
 * e2e specs find the same banner whatever failed.
 */
export function receiptOutageText(
  shown: DisputePanelView["kind"],
  outage: StoreOutage,
): string {
  const cause = CAUSE[outage.kind];
  if (shown === "hidden") {
    return `⚠ receipt unavailable — ${cause}, so this run's receipt can't be shown yet. Nothing already settled on-chain is affected, and nor is the trace below.`;
  }
  const dated = `⚠ this receipt may be out of date — ${cause}, so it is shown as last read.`;
  return shown === "settled"
    ? `${dated} Nothing already settled on-chain is affected.`
    : dated;
}

/** What the panel is doing about the outage: retrying, or not any more. */
export function receiptOutageStatus(gaveUp: boolean): string {
  return gaveUp
    ? "Stopped retrying automatically — press retry to try again."
    : "Retrying automatically.";
}

/** Said once the outage is over and the receipt has been read again. */
export const RECEIPT_RECOVERED =
  "The dispute records are reachable again — the receipt is up to date.";

/**
 * The receipt's banner for an outage: the sentence, the retry, what the
 * panel is doing about it, and — folded away — the technical line a support
 * request needs.
 *
 * Only the sentence is the alert. The status beside it changes as the
 * retries run, and a change inside a `role="alert"` is spoken again,
 * assertively, every time; so it is drawn here for the eye and hidden from
 * assistive technology, which hears it from the section's polite region
 * instead. The technical line sits outside the alert for the same reason: it
 * carries each failure's own request id.
 */
export function ReceiptOutageNote({
  shown,
  outage,
  gaveUp,
  error,
  onRetry,
  retrying,
}: Readonly<{
  shown: DisputePanelView["kind"];
  outage: StoreOutage;
  gaveUp: boolean;
  /** The failure's technical line (`GET … → 503 — …`). */
  error: string;
  onRetry: () => void;
  retrying: boolean;
}>) {
  return (
    <div className="space-y-2">
      <ErrorNote onRetry={onRetry} retrying={retrying} retryLabel="↻ retry">
        {receiptOutageText(shown, outage)}
      </ErrorNote>
      <p aria-hidden="true" className="font-mono text-[11px] text-muted">
        {receiptOutageStatus(gaveUp)}
      </p>
      <details className="font-mono text-[11px] text-muted">
        <summary
          className={cn("w-fit cursor-pointer hover:text-text", focusRing)}
        >
          technical detail
        </summary>
        <p className="mt-1 break-all">{error}</p>
        {outage.requestId !== null && (
          <p className="break-all">request id {outage.requestId}</p>
        )}
      </details>
    </div>
  );
}
