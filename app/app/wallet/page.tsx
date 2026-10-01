"use client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectWallet } from "@/components/ui/connect-wallet";
import { ErrorNote } from "@/components/ui/error-note";
import { StaleBadge } from "@/components/ui/stale-badge";
import { NETWORK_NAME, useWallet } from "@/lib/wallet";
import { KVRow } from "@/components/ui/kv-row";
import {
  NETWORK_LABEL,
  StellarExpertLink,
  defaultExplorerNetwork,
  stellarExpertUrl,
} from "@/components/ui/stellar-link";
import { getStellarNetwork } from "@/lib/api";
import { focusRing } from "@/lib/ui";
import { useFetch } from "@/lib/use-fetch";
import { cn, prettyName } from "@/lib/utils";

// Display label for the configured network — "mainnet" | "testnet".

export default function WalletPage() {
  const {
    connected,
    address,
    network,
    walletNetwork,
    xlmBalance,
    balanceLoading,
    balanceError,
    refreshBalance,
  } = useWallet();
  const {
    data: info,
    error,
    loading,
    retrying,
    lastSuccessAt,
    reload,
  } = useFetch(getStellarNetwork, [], {
    revalidateOnFocus: true,
  });
  // One flag for the whole recovery window: an attempt in flight *or* the
  // backoff gap before the next one. Without the gap the error frame drops
  // back to an idle "retry" between attempts and reads as a dead end.
  const recovering = loading || retrying;

  // Compare the network the wallet itself reported against the backend's
  // deploy. Wallets that can't report a network (walletNetwork null) show
  // no warning — unknown is not a mismatch.
  const networkMismatch =
    connected &&
    info &&
    walletNetwork &&
    walletNetwork.networkPassphrase !== info.network_passphrase;

  // Prefer the wallet-reported network for session display; fall back to
  // this build's configured network when the wallet didn't report one.
  const sessionNetwork = walletNetwork ?? network;

  // Never keep claiming a deploy we could not read — an ellipsis here read as
  // "still loading" for the whole outage.
  const deployLabel = info ? info.network : error ? "unreachable" : "…";

  // A failed fetch leaves the balance unknown — it must never render as a
  // plain dash next to the number, which reads as "nothing here" instead of
  // "we could not ask Horizon".
  //
  // This is also why the balance carries no StaleBadge: useWallet clears
  // `xlmBalance` when Horizon fails, so there is never a frozen figure on
  // screen to date — the number is gone, which is a failure (ErrorNote), not
  // staleness. Keeping the old amount visible instead would be exactly the
  // fabricated money value the failure states were fixed to stop showing.
  const parsedBalance = xlmBalance === null ? NaN : parseFloat(xlmBalance);
  const balanceKnown = Number.isFinite(parsedBalance);
  // The "…" belongs to a first load only. Once the fetch has failed, a
  // recheck keeps the magenta "—": alternating ellipsis and dash on every
  // retry animates the failure into looking like progress.
  const balanceFmt = balanceKnown
    ? parsedBalance.toFixed(7)
    : balanceLoading && !balanceError
      ? "…"
      : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Wallet</h1>
          <p className="mt-1 text-sm text-muted">
            Freighter → Stellar {NETWORK_LABEL}. Sign Orizon contract calls with
            your key.
          </p>
        </div>
        <ConnectWallet size="md" />
      </div>

      {networkMismatch && (
        <ErrorNote className="clip-cyber-sm border-magenta/50 p-4">
          ⚠ your wallet is on{" "}
          <b>{walletNetwork?.network || "another network"}</b> but Orizon
          deployed to <b>{info?.network}</b>. Switch networks in your wallet
          extension.
        </ErrorNote>
      )}

      {connected && (
        <Card glow>
          <div className="flex items-end justify-between flex-wrap gap-4">
            {/* min-w-0 and a smaller phone size: at 360px the seven-decimal
                balance ran past the card, whose clip-path cut its last
                digits off. A balance too long even so wraps, never clips. */}
            <div className="min-w-0 max-w-full">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-2">
                ▸ native XLM balance
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span
                  className={cn(
                    "min-w-0 break-all text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl",
                    !balanceKnown && balanceError && "text-magenta",
                  )}
                >
                  {balanceFmt}
                </span>
                <span className="font-mono text-sm uppercase tracking-[0.2em] text-cyan">
                  XLM
                </span>
              </div>
              <div className="mt-2 font-mono text-[11px] text-muted">
                {address ? `${address.slice(0, 6)}…${address.slice(-6)}` : ""} ·{" "}
                {sessionNetwork?.network ?? NETWORK_NAME}
              </div>
              {balanceError && (
                <ErrorNote
                  className="clip-cyber-sm mt-3 text-[11px]"
                  onRetry={() => void refreshBalance()}
                  retrying={balanceLoading}
                >
                  balance unavailable — {balanceError}
                </ErrorNote>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {defaultExplorerNetwork !== "public" && (
                <a
                  href="https://friendbot.stellar.org"
                  target="_blank"
                  rel="noreferrer"
                  className={`clip-cyber-sm border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted hover:text-text hover:border-cyan/60 transition ${focusRing}`}
                  title="Fund this account with testnet XLM via Friendbot"
                >
                  ▸ fund testnet
                </a>
              )}
              {address && (
                <StellarExpertLink
                  kind="account"
                  id={address}
                  className={`clip-cyber-sm border border-border px-3 py-1.5 text-muted hover:border-violet/60 transition ${focusRing}`}
                />
              )}
              <button
                onClick={() => refreshBalance()}
                disabled={balanceLoading}
                className={`clip-cyber-sm border border-cyan/60 bg-cyan/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-50 transition ${focusRing}`}
              >
                {balanceLoading ? "◉ refreshing…" : "↻ refresh"}
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-4">
            Your session
          </div>
          {connected ? (
            <dl className="space-y-3 text-sm font-mono">
              <KVRow k="address" value={address ?? ""} />
              <KVRow k="network" value={sessionNetwork?.network ?? ""} />
              <KVRow
                k="passphrase"
                value={sessionNetwork?.networkPassphrase ?? ""}
              />
            </dl>
          ) : (
            <div className="text-sm text-muted">
              No wallet connected. Click{" "}
              <b className="text-text">Connect Wallet</b> above to link
              Freighter.
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-violet-readable">
              Orizon deploy ({deployLabel})
            </div>
            {/* The rows below survive a failed reload, so date them. Nothing
                renders before the first success — that state is a failure,
                and the ErrorNote below carries it. */}
            <StaleBadge
              stale={Boolean(error)}
              lastSuccessAt={lastSuccessAt}
              what="deploy details"
            />
          </div>
          {error && (
            <ErrorNote
              className="mb-3 text-sm"
              onRetry={reload}
              retrying={recovering}
            >
              backend offline — {error}
            </ErrorNote>
          )}
          {info ? (
            <dl className="space-y-3 text-sm font-mono">
              <KVRow k="rpc" value={info.rpc_url} />
              <KVRow k="admin" value={info.admin} />
              <KVRow
                k="asset"
                value={`${info.asset} (${info.asset_sac.slice(0, 8)}…)`}
              />
            </dl>
          ) : (
            !error && <div className="text-sm text-muted">loading…</div>
          )}
        </Card>
      </div>

      <Card>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan mb-5">
          Deployed contracts
        </div>
        {/* No error branch here used to mean a failed fetch pulsed four empty
            placeholders forever — the card looked like it was still loading
            days into an outage. */}
        {!info && error ? (
          <ErrorNote onRetry={reload} retrying={recovering}>
            contracts unavailable — {error}
          </ErrorNote>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {info
              ? Object.entries(info.contracts).map(([name, id]) => (
                  <a
                    key={name}
                    href={stellarExpertUrl("contract", id, info.network)}
                    target="_blank"
                    rel="noreferrer"
                    className={`clip-cyber-sm border border-border bg-bg/40 p-4 hover:border-violet/60 hover:bg-violet/5 transition ${focusRing}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">
                        {prettyName(name)}
                      </span>
                      <Badge tone="cyan">live</Badge>
                    </div>
                    <div className="font-mono text-[11px] text-muted break-all">
                      {id}
                    </div>
                    <div className="mt-2 font-mono text-[10px] text-cyan">
                      view on stellar.expert ▸
                    </div>
                  </a>
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="clip-cyber-sm border border-border bg-bg/40 p-4 h-20 animate-pulse"
                  />
                ))}
          </div>
        )}
      </Card>
    </div>
  );
}
