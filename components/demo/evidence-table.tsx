/**
 * The sprint's on-chain transactions, each linked to Stellar Expert. They
 * prove on the ledger what the videos walk through on screen; they are not
 * the payments in the videos, and the copy says so.
 *
 * The rows are the evidence tool's output, checked at build: testnet, real
 * transaction hashes, each re-read on the network. The link is rebuilt from
 * the hash rather than taken from the file, so it always points at exactly
 * the transaction named. On a phone the table scrolls inside its own labelled
 * region instead of pushing the page sideways.
 */

import { stellarExpertUrl } from "@/components/ui/stellar-link";
import {
  deliverableLabel,
  formatUnixUtc,
  KIND_LABEL,
  truncateHash,
} from "@/lib/demo/display";
import type { DemoEvidence } from "@/lib/demo/load";
import { focusRing, inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";

const th =
  "border-b border-border bg-surface/70 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted";
const td = "border-b border-border px-3 py-2 align-top text-text/90";

export function EvidenceTable({ evidence }: { evidence: DemoEvidence }) {
  return (
    <section aria-labelledby="demo-evidence">
      <h2
        id="demo-evidence"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        On-chain evidence
      </h2>
      <p className="mt-2 text-muted">
        The sprint&rsquo;s own transactions on Stellar testnet: the team&rsquo;s
        runs through the live payment escrow, from payment to settlement, and a
        dispute that was upheld and refunded. They are not the payments seen in
        the videos. Each was re-read on the network on{" "}
        <time dateTime={new Date(evidence.generated_at * 1000).toISOString()}>
          {formatUnixUtc(evidence.generated_at)}
        </time>
        ; open one to check it yourself.
      </p>
      <div
        role="region"
        aria-label="On-chain evidence table"
        tabIndex={0}
        className={cn("mt-5 overflow-x-auto border border-border", focusRing)}
      >
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className={th}>
                Transaction
              </th>
              <th scope="col" className={th}>
                Deliverable
              </th>
              <th scope="col" className={th}>
                Kind
              </th>
              <th scope="col" className={th}>
                Hash
              </th>
            </tr>
          </thead>
          <tbody>
            {evidence.items.map((item) => (
              <tr key={`${item.tx_hash}-${item.kind}`}>
                <th scope="row" className={cn(td, "font-normal")}>
                  {item.label}
                </th>
                <td className={td}>
                  <abbr
                    title={deliverableLabel(item.deliverable)}
                    className="font-mono no-underline"
                  >
                    {item.deliverable}
                  </abbr>
                </td>
                <td className={td}>{KIND_LABEL[item.kind]}</td>
                <td className={cn(td, "whitespace-nowrap")}>
                  <a
                    href={stellarExpertUrl("tx", item.tx_hash, "testnet")}
                    target="_blank"
                    rel="noreferrer"
                    title={item.tx_hash}
                    className={cn(inlineLink, "font-mono")}
                  >
                    {truncateHash(item.tx_hash)}
                    <span className="sr-only">
                      {" "}
                      on Stellar Expert (opens in a new tab)
                    </span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
