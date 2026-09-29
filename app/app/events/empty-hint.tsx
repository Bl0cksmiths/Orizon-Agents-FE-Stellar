import Link from "next/link";

import type { EscrowGeneration } from "@/lib/escrow-generation";
import { inlineLink } from "@/lib/ui";

const code = "text-cyan";

/**
 * What an empty events feed says a workflow will publish, by the escrow the
 * deployment settles through. v2 emits `authd`, a `charged` per step's
 * payout and `settled`; v1 emits `authd` too, but its `charge` cannot
 * complete (D-039), so no `charged` follows; unknown names only the events
 * both publish.
 */
export function EventsEmptyHint({
  generation,
}: {
  generation: EscrowGeneration;
}): JSX.Element {
  return (
    <div className="text-sm text-muted">
      No events yet. Run a workflow on{" "}
      <Link href="/app/orchestrator" className={inlineLink}>
        /app/orchestrator
      </Link>{" "}
      {generation === "v2" ? (
        <>
          — it publishes <code className={code}>authd</code> when you authorize,{" "}
          <code className={code}>charged</code> for each step&apos;s payout and{" "}
          <code className={code}>settled</code> when the run settles, then the
          attestation&apos;s <code className={code}>seal</code>, each here
          within a ledger.
        </>
      ) : (
        <>
          — it publishes <code className={code}>authd</code> when you authorize,
          then the attestation&apos;s <code className={code}>seal</code>, each
          here within a ledger.
          {generation === "v1" && (
            <>
              {" "}
              On this deployment the escrow cannot yet complete a payment (a
              known defect; the fix is deployed separately), so no{" "}
              <code className={code}>charged</code> event follows.
            </>
          )}
        </>
      )}
    </div>
  );
}
