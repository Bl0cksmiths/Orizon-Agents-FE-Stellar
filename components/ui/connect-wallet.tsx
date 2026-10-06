"use client";
import { useWallet } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * What stands where the connect button would be when the wallet cannot start
 * on this page (lib/wallet.tsx, WalletUnavailable): a plain statement, not a
 * disabled button, since there is nothing to press until the page reloads.
 */
export function WalletUnavailableNote({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        Wallet unavailable
      </p>
    </div>
  );
}

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function ConnectWallet({
  size = "sm",
  variant = "primary",
  showWalletName = true,
  className,
  describedBy,
}: {
  size?: "sm" | "md";
  /** The connect button's weight. Beside a primary call to action (the
   *  marketing nav's Launch App) it steps back to `outline`. */
  variant?: "primary" | "outline";
  /** Whether a connected wallet's name shows beside its address (from `md`).
   *  A crowded header can drop it; the address button's title still names it. */
  showWalletName?: boolean;
  className?: string;
  /** Ids of notices the connect button is described by, when connecting is
   *  the first step of a payment those notices are about. */
  describedBy?: string;
}) {
  const {
    available,
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

  if (!available) return <WalletUnavailableNote className={className} />;

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
        {showWalletName && walletName && (
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
          className={`chamfer-edges chamfer-edges-sm relative clip-cyber-sm whitespace-nowrap border [--edge:rgba(176,38,255,0.6)] border-[color:var(--edge)] hover:[--edge:#B026FF] bg-violet/10 h-8 px-3 font-mono text-[11px] uppercase tracking-[0.2em] text-text hover:shadow-neon-violet transition ${focusRing}`}
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
        variant={variant}
        onClick={connect}
        disabled={loading}
        title={error?.detail}
        className="whitespace-nowrap"
        aria-describedby={describedBy}
      >
        {loading ? "◉ …" : "Connect Wallet"}
      </Button>
    </div>
  );
}
