/**
 * The proof links under a claim or a metric, label first.
 *
 * A reviewer reads the label to decide whether to click, so the label is the
 * link. A transaction adds its hash, shortened, in small monospace after the
 * label, and its date; the full hash is in the link itself. A link that
 * leaves the site opens in a new tab, says where in its accessible name
 * ("(opens Stellar Expert)"), and sends no referrer. On paper every link
 * prints its full URL, so the evidence pack still works as a PDF.
 */

import { destination, formatDate, truncateHash } from "@/lib/evidence/display";
import type { EvidenceLink } from "@/lib/evidence/types";
import { inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function EvidenceLinkLine({ link }: { link: EvidenceLink }) {
  const where = destination(link.url);
  return (
    <>
      <a
        href={link.url}
        {...(where.external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        className={cn(inlineLink, "print:text-black")}
      >
        {link.label}
        {where.external && (
          <>
            {" "}
            <span className="sr-only">{where.hint}</span>
            <span aria-hidden="true" className="print:hidden">
              {" "}
              ↗
            </span>
          </>
        )}
      </a>
      {link.kind === "tx" && link.tx_hash && (
        <>
          {" "}
          <span
            title={link.tx_hash}
            className="whitespace-nowrap font-mono text-[11px] text-muted"
          >
            <span className="sr-only">transaction </span>
            {truncateHash(link.tx_hash)}
          </span>
        </>
      )}
      {link.date && (
        <>
          {" "}
          <span className="whitespace-nowrap text-muted">
            <span aria-hidden="true">· </span>
            <time dateTime={link.date}>{formatDate(link.date)}</time>
          </span>
        </>
      )}
      <span
        data-print-url
        className="hidden break-all print:block print:text-[10px]"
      >
        {link.url}
      </span>
    </>
  );
}

export function EvidenceLinks({
  links,
  empty = "No proof link yet.",
  className,
}: {
  links: EvidenceLink[];
  /** What to say when there is nothing to click. */
  empty?: string;
  className?: string;
}) {
  if (links.length === 0) {
    return <p className={cn("text-sm text-muted", className)}>{empty}</p>;
  }
  return (
    <ul className={cn("space-y-1.5 text-sm leading-relaxed", className)}>
      {links.map((link) => (
        <li key={`${link.url}|${link.label}`}>
          <EvidenceLinkLine link={link} />
        </li>
      ))}
    </ul>
  );
}
