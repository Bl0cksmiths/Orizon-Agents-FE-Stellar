import { IS_MAINNET } from "@/lib/env";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type StellarExpertKind = "tx" | "account" | "contract";

/**
 * Explorer segment resolved from the shared network config (lib/env.ts):
 * mainnet → "public", anything else → "testnet".
 */
export const defaultExplorerNetwork = IS_MAINNET ? "public" : "testnet";

/** Short badge label for the active network — "mainnet" or "testnet". */
export const NETWORK_LABEL = IS_MAINNET ? "mainnet" : "testnet";

/**
 * stellar.expert only publishes two explorer segments. Callers pass through
 * whatever the backend's GET /stellar/network reports — legitimately
 * "mainnet" — so normalize instead of interpolating raw and 404ing.
 */
function explorerSegment(network: string): "public" | "testnet" {
  return network === "mainnet" || network === "public" ? "public" : "testnet";
}

/** Canonical stellar.expert explorer URL for a tx / account / contract. */
export function stellarExpertUrl(
  kind: StellarExpertKind,
  id: string,
  network: string = defaultExplorerNetwork,
): string {
  return `https://stellar.expert/explorer/${explorerSegment(network)}/${kind}/${id}`;
}

/**
 * External link to stellar.expert. Styling is caller-provided via className
 * (call sites range from inline text links to cyber-button chips); the URL
 * shape, target, and rel live here so explorer links can't drift.
 */
export function StellarExpertLink({
  kind,
  id,
  network = defaultExplorerNetwork,
  className,
  children,
}: {
  kind: StellarExpertKind;
  id: string;
  network?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={stellarExpertUrl(kind, id, network)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "font-mono text-[10px] uppercase tracking-widest text-cyan hover:text-text",
        focusRing,
        className,
      )}
    >
      {children ?? "view on stellar.expert ▸"}
    </a>
  );
}
