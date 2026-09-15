"use client";
/**
 * Shared transaction-status component.
 *
 * Yellow Belt requires explicit lifecycle states (pending / success / fail).
 * This component renders the full progression as a step trail plus the
 * final-state card, so call-sites can drop in one component instead of
 * hand-rolling the same UI in every page.
 *
 *   <TxStatus state="signing" />
 *   <TxStatus state="success" hash="..." amount="1 XLM" destination="G..." />
 *   <TxStatus state="failed" error={friendlyError} />
 */

import { Card } from "@/components/ui/card";
import { KVRow } from "@/components/ui/kv-row";
import {
  StellarExpertLink,
  defaultExplorerNetwork,
} from "@/components/ui/stellar-link";
import { focusRing } from "@/lib/ui";
import type { FriendlyError } from "@/lib/wallet-errors";

export type TxState =
  | "idle"
  | "building"
  | "signing"
  | "broadcasting"
  | "pending"
  | "success"
  | "failed";

const STEPS: { id: TxState; label: string }[] = [
  { id: "building", label: "Build" },
  { id: "signing", label: "Sign" },
  { id: "broadcasting", label: "Broadcast" },
  { id: "pending", label: "Pending" },
  { id: "success", label: "Confirmed" },
];

const ORDER: Record<TxState, number> = {
  idle: -1,
  building: 0,
  signing: 1,
  broadcasting: 2,
  pending: 3,
  success: 4,
  failed: 4,
};

export function TxStatus({
  state,
  hash,
  amount,
  destination,
  memo,
  error,
  network = defaultExplorerNetwork,
  className,
}: {
  state: TxState;
  hash?: string;
  amount?: string;
  destination?: string;
  memo?: string | null;
  error?: FriendlyError | null;
  network?: "testnet" | "public";
  className?: string;
}) {
  if (state === "idle") return null;

  return (
    <div role="status" aria-live="polite" className={className}>
      <StepTrail state={state} />
      {state === "success" && hash && (
        <SuccessCard
          hash={hash}
          amount={amount}
          destination={destination}
          memo={memo ?? null}
          network={network}
        />
      )}
      {state === "failed" && error && <FailedCard error={error} />}
    </div>
  );
}

function StepTrail({ state }: { state: TxState }) {
  if (state === "failed") {
    return null;
  }
  const current = ORDER[state];
  return (
    <Card className="mb-4">
      {/* The five labels are `whitespace-nowrap` and need ~370px side by side —
          more than a ~380px viewport leaves inside this Card, and `clip-cyber`
          would clip the overflow rather than scroll it. Below sm the trail
          stacks vertically so no step is ever hidden. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        {STEPS.map((s, i) => {
          const idx = ORDER[s.id];
          const done = idx < current;
          const active = idx === current;
          return (
            <div
              key={s.id}
              className="flex items-center sm:flex-1 sm:last:flex-none"
            >
              <div className="flex items-center gap-3 sm:flex-col sm:gap-1.5">
                <span
                  className={[
                    "h-3 w-3 shrink-0 rounded-full transition-all",
                    done && "bg-cyan shadow-[0_0_8px_#00FFD1]",
                    active &&
                      "bg-violet shadow-[0_0_12px_#B026FF] animate-pulse",
                    !done && !active && "bg-border",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <span
                  className={[
                    "font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap",
                    done && "text-cyan",
                    active && "text-text",
                    !done && !active && "text-muted",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={[
                    "hidden sm:block flex-1 h-px mx-2",
                    done ? "bg-cyan/60" : "bg-border",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SuccessCard({
  hash,
  amount,
  destination,
  memo,
  network,
}: {
  hash: string;
  amount?: string;
  destination?: string;
  memo: string | null;
  network: "testnet" | "public";
}) {
  return (
    <Card>
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-3">
        ✓ transaction confirmed
      </div>
      <div className="space-y-2 font-mono text-sm">
        {amount && destination && (
          <KVRow
            k="sent"
            value={`${amount} → ${shortG(destination)}`}
            divider={false}
          />
        )}
        {memo && <KVRow k="memo" value={memo} divider={false} />}
        <KVRow
          k="tx hash"
          value={hash}
          divider={false}
          valueClassName="text-cyan"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <StellarExpertLink
          kind="tx"
          id={hash}
          network={network}
          className="clip-cyber-sm border border-cyan/60 bg-cyan/10 px-3 py-2 hover:bg-cyan/20 hover:text-cyan transition"
        />
        <a
          href={`https://horizon${network === "public" ? "" : "-testnet"}.stellar.org/transactions/${hash}`}
          target="_blank"
          rel="noreferrer"
          className={`clip-cyber-sm border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted hover:text-text hover:border-violet/60 transition ${focusRing}`}
        >
          raw horizon ▸
        </a>
      </div>
    </Card>
  );
}

function FailedCard({ error }: { error: FriendlyError }) {
  return (
    <Card>
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-magenta mb-2">
        ✗ {error.title}
      </div>
      <div className="text-sm text-text mb-3">{error.detail}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        kind: <span className="text-magenta">{error.kind}</span>
      </div>
      {error.raw && error.raw !== error.detail && (
        <details className="mt-3 font-mono text-[11px] text-muted">
          <summary className="cursor-pointer hover:text-text">
            raw error
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-all text-magenta/80">
            {error.raw}
          </pre>
        </details>
      )}
    </Card>
  );
}

function shortG(g: string): string {
  if (g.length <= 12) return g;
  return `${g.slice(0, 6)}…${g.slice(-6)}`;
}
