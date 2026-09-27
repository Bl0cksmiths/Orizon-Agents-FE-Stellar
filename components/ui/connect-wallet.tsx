"use client";
import { useWallet } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function ConnectWallet({
  size = "sm",
  className,
  describedBy,
}: {
  size?: "sm" | "md";
  className?: string;
  /** Ids of notices the connect button is described by, when connecting is
   *  the first step of a payment those notices are about. */
  describedBy?: string;
}) {
  const {
    connected,
    address,
    walletName,
    network,
    walletNetwork,
    walletNetworkMismatch,
    connect,
    disconnect,
    loading,
    error,
  } = useWallet();

  if (connected && address) {
    // Compare what the wallet itself reported against this build's network.
    // Unknown wallet network (unsupported getNetwork) → no false alarm.
    const wrongNet = walletNetworkMismatch;
    const netLabel = (
      walletNetwork?.network ||
      network?.network ||
      "stellar"
    ).toLowerCase();
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {walletName && (
          <span className="hidden md:inline font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {walletName}
          </span>
        )}
        <Badge tone={wrongNet ? "magenta" : "cyan"} dot>
          {wrongNet ? "wrong net" : netLabel}
        </Badge>
        <button
          onClick={disconnect}
          title={`${walletName ?? "wallet"} · ${address} · click to disconnect`}
          className={`clip-cyber-sm border border-violet/60 bg-violet/10 h-8 px-3 font-mono text-[11px] uppercase tracking-[0.2em] text-text hover:border-violet hover:shadow-neon-violet transition ${focusRing}`}
        >
          ◆ {short(address)}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {error?.kind === "wallet_not_found" && (
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noreferrer"
          className={`font-mono text-[10px] uppercase tracking-[0.2em] text-magenta hover:text-text ${focusRing}`}
        >
          install a wallet ▸
        </a>
      )}
      <Button
        size={size}
        variant="primary"
        onClick={connect}
        disabled={loading}
        title={error?.detail}
        aria-describedby={describedBy}
      >
        {loading ? "◉ …" : "Connect Wallet"}
      </Button>
    </div>
  );
}
