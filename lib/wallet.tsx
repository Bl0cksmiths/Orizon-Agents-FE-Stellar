"use client";
/**
 * Multi-wallet context, powered by StellarWalletsKit.
 *
 * Yellow Belt requirement: support more than just Freighter.
 * The kit's `defaultModules()` bundles nine wallets; we pass an explicit
 * allowlist filter so the `authModal()` picker only offers the six we
 * actually support and test: Freighter, xBull, Albedo, LOBSTR, Hana,
 * and Rabet.
 *
 *   const { address, walletName, connect, disconnect, signXdr, signMessage } =
 *     useWallet();
 *
 * The kit's API stays internal — call sites still use `useWallet()`,
 * which lets us swap implementations without touching pages.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Networks as KitNetworks } from "@creit.tech/stellar-wallets-kit";
import {
  classifyError,
  isFriendlyError,
  wrongNetworkError,
  type FriendlyError,
} from "@/lib/wallet-errors";
import { installWalletPickerA11y } from "@/lib/wallet-picker-a11y";

import { HORIZON_URL, NETWORK_NAME, NETWORK_PASSPHRASE } from "@/lib/env";

// Network config lives in lib/env.ts (validated at build time); re-exported
// here so tx-building pages and network guards keep their existing imports.
export { HORIZON_URL, NETWORK_NAME, NETWORK_PASSPHRASE };
const STORAGE_KEY = "orizon.wallet.v2";

type StoredSession = {
  walletId: string;
  address: string;
};

type NetworkDetails = {
  network: string;
  networkPassphrase: string;
};

type WalletState = {
  installed: boolean;
  connected: boolean;
  address: string | null;
  /** Stable wallet identifier from the kit — `freighter`, `xbull`, etc. */
  walletId: string | null;
  /** Friendly display name — `Freighter`, `xBull`, etc. */
  walletName: string | null;
  /** The network this build is configured for (env-driven). */
  network: NetworkDetails | null;
  /**
   * The network the connected wallet itself reported via the kit's
   * getNetwork(). Null while disconnected or when the wallet doesn't
   * support the call (e.g. Albedo, Lobstr) — unknown, not assumed.
   */
  walletNetwork: NetworkDetails | null;
  /**
   * True only when connected AND the wallet reported a passphrase that
   * differs from the app's. Unknown wallet network → false (no warning).
   */
  walletNetworkMismatch: boolean;
  error: FriendlyError | null;
  loading: boolean;
  /**
   * Native XLM balance as a decimal string, or null when it is *unknown* —
   * disconnected, still loading, or the fetch failed. Never trust null to
   * mean "no funds": pair it with `balanceLoading` / `balanceError` to tell
   * the four states apart:
   *   not connected  → !connected
   *   loading        → balanceLoading && xlmBalance === null
   *   failed         → balanceError !== null
   *   zero funds     → xlmBalance === "0"
   */
  xlmBalance: string | null;
  balanceLoading: boolean;
  /**
   * Why the last balance fetch failed, or null when it succeeded / never ran.
   * Set on both a non-OK Horizon response and a thrown request; consumers must
   * surface it instead of rendering an innocuous placeholder.
   */
  balanceError: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signXdr: (
    xdr: string,
    opts?: { networkPassphrase?: string },
  ) => Promise<string>;
  /**
   * Sign an arbitrary message, resolving to the wallet's base64 signature
   * exactly as the kit returned it. Used by the agent endpoint binding flow
   * (story 2.01), where the signature authorizes the endpoint rather than a
   * transaction.
   */
  signMessage: (message: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
};

const WalletCtx = createContext<WalletState | null>(null);

/**
 * StellarWalletsKit (plus every wallet module it bundles) is heavy, so it is
 * loaded on demand instead of shipping in every route's first-load JS: the
 * dynamic import runs when a saved session is restored on mount or on the
 * first connect(). The promise is cached module-level so the chunk is
 * fetched and the kit initialized exactly once.
 */
type KitModule = typeof import("@creit.tech/stellar-wallets-kit");
type Kit = KitModule["StellarWalletsKit"];

/**
 * The wallets we support and test, by the kit's stable `productId`.
 * Keep in sync with the doc comment above and the `prettyName` map below.
 */
const SUPPORTED_WALLET_IDS: ReadonlySet<string> = new Set([
  "freighter",
  "xbull",
  "albedo",
  "lobstr",
  "hana",
  "rabet",
]);

let kitPromise: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = Promise.all([
      import("@creit.tech/stellar-wallets-kit"),
      import("@creit.tech/stellar-wallets-kit/modules/utils"),
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    ])
      .then(([{ StellarWalletsKit }, { defaultModules }, { FREIGHTER_ID }]) => {
        StellarWalletsKit.init({
          // defaultModules bundles 9 wallets; keep only the allowlisted six.
          modules: defaultModules({
            filterBy: (m) => SUPPORTED_WALLET_IDS.has(m.productId),
          }),
          selectedWalletId: FREIGHTER_ID,
          network: NETWORK_PASSPHRASE as KitNetworks,
        });
        return StellarWalletsKit;
      })
      .catch((e) => {
        // Don't cache a failed load — a retry (e.g. next connect click)
        // should attempt the import again.
        kitPromise = null;
        throw e;
      });
  }
  return kitPromise;
}

function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.address || !parsed.walletId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession | null) {
  if (typeof window === "undefined") return;
  if (s) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Ask the active wallet which network it is on. Not every wallet implements
 * getNetwork() (Albedo and Lobstr reject with code -3), so any failure or
 * malformed response resolves to null — "unknown", never a false alarm.
 */
async function probeWalletNetwork(kit: Kit): Promise<NetworkDetails | null> {
  try {
    const net = await kit.getNetwork();
    if (
      net &&
      typeof net.networkPassphrase === "string" &&
      net.networkPassphrase
    ) {
      return {
        network: typeof net.network === "string" ? net.network : "",
        networkPassphrase: net.networkPassphrase,
      };
    }
  } catch {
    // wallet doesn't support getNetwork (or the call failed) — unknown.
  }
  return null;
}

/**
 * Deadline on the signing popup. Legitimate signing is interactive and can
 * take a while, so this is deliberately generous — it exists for the popup
 * that will never settle (blocked, orphaned, or dismissed without the kit
 * hearing about it), which otherwise pins the caller's loading state forever.
 */
const SIGN_TIMEOUT_MS = 120_000;

function signTimeoutError(): FriendlyError {
  return {
    kind: "unknown",
    title: "Wallet timed out",
    detail:
      "The wallet didn't respond within 2 minutes. The signing popup may have been blocked or closed — check your wallet extension and try again.",
    raw: `wallet did not settle within ${SIGN_TIMEOUT_MS / 1000}s`,
  };
}

/**
 * The wallet's own wording for a rejection the kit reports as a plain
 * `{ code, message }` object rather than an Error (`parseError`,
 * @creit.tech/stellar-wallets-kit). `String(e)` on one of those is the useless
 * "[object Object]" — which erases the very phrase ("User declined access")
 * that the rejection classifier matches on, turning a cancelled popup into an
 * unexplained failure.
 */
function walletErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  const message = (e as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message ? message : String(e);
}

/** The promise's own outcome, or `onTimeout()` as a rejection if it doesn't settle in time. */
function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => FriendlyError,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    // A settled sign must not hold the event loop open (node only —
    // browsers return a number).
    (timer as unknown as { unref?: () => void }).unref?.();
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const installed = true; // kit modal handles the "no wallet" state inline
  const [address, setAddress] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [loading, setLoading] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  // What the connected wallet itself reported via getNetwork() — null = unknown.
  const [walletNetwork, setWalletNetwork] = useState<NetworkDetails | null>(
    null,
  );

  const network = useMemo<NetworkDetails>(
    () => ({ network: NETWORK_NAME, networkPassphrase: NETWORK_PASSPHRASE }),
    [],
  );

  // Mismatch is only asserted when connected and the wallet actually reported
  // a passphrase; wallets that can't report one never trigger the warning.
  const walletNetworkMismatch = Boolean(
    address &&
    walletNetwork &&
    walletNetwork.networkPassphrase !== NETWORK_PASSPHRASE,
  );

  /**
   * Fetch the native balance from Horizon.
   *
   * A failure must never look like "0 XLM" or a quiet dash: the balance is
   * cleared to null (unknown) *and* `balanceError` is set, so downstream
   * checks — the Send form's affordability guard above all — can block
   * rather than silently skip. The previous error is deliberately left in
   * place until this attempt resolves, so a retry keeps the message on
   * screen instead of flashing back to a placeholder.
   */
  const balanceRunRef = useRef(0);
  const fetchBalance = useCallback(async (g: string) => {
    // Monotonic epoch, same shape as use-async-action.ts: two balance reads
    // overlap easily (the address effect fires one on connect, refreshBalance
    // fires another), and without this an older response settling last would
    // overwrite a newer one — a stale failure wiping a good balance blocks the
    // Send form's affordability guard, and a stale success un-blocks it on a
    // balance that is no longer true.
    const run = ++balanceRunRef.current;
    const isCurrent = () => balanceRunRef.current === run;
    setBalanceLoading(true);
    try {
      const r = await fetch(`${HORIZON_URL}/accounts/${g}`);
      if (r.status === 404) {
        // Unfunded account — friendbot needed. A real, known balance of zero.
        if (!isCurrent()) return;
        setXlmBalance("0");
        setBalanceError(null);
        return;
      }
      if (!r.ok) {
        if (!isCurrent()) return;
        setXlmBalance(null);
        setBalanceError(`Horizon responded ${r.status}`);
        return;
      }
      const j = await r.json();
      const native = j.balances?.find(
        (b: { asset_type: string; balance: string }) =>
          b.asset_type === "native",
      );
      if (!isCurrent()) return;
      setXlmBalance(native?.balance ?? "0");
      setBalanceError(null);
    } catch (e) {
      if (!isCurrent()) return;
      setXlmBalance(null);
      setBalanceError(e instanceof Error ? e.message : String(e));
    } finally {
      // Only the newest run owns the spinner; an older one settling later
      // must not clear a load that is still in flight.
      if (isCurrent()) setBalanceLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    await fetchBalance(address);
  }, [address, fetchBalance]);

  // Re-fetch balance whenever the address changes. A new address starts from
  // a clean slate — the previous account's error must not describe this one.
  useEffect(() => {
    if (address) {
      setBalanceError(null);
      fetchBalance(address);
    } else {
      setXlmBalance(null);
      setBalanceError(null);
      setBalanceLoading(false);
    }
  }, [address, fetchBalance]);

  // On mount: try to restore the previous session silently. Only a saved
  // session triggers the (lazy) kit load — first-time visitors don't pay
  // for the kit until they hit connect().
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    let cancelled = false;
    (async () => {
      try {
        const kit = await loadKit();
        kit.setWallet(saved.walletId);
        if (cancelled) return;
        setWalletId(saved.walletId);
        setAddress(saved.address);
        setWalletName(prettyName(saved.walletId));
        // Ask the restored wallet which network it is really on.
        const net = await probeWalletNetwork(kit);
        if (!cancelled) setWalletNetwork(net);
      } catch {
        // module not available in this browser — silently ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    let disposeA11y: (() => void) | null = null;
    try {
      const kit = await loadKit();
      // Patch the kit's picker before it opens: as shipped it has no Escape
      // handler, no accessible name on its close control, and wallet rows that
      // no keyboard can reach. Escape is routed to the kit's own closeEvent, so
      // it rejects authModal exactly the way its X button does. A shim that
      // cannot install must never block connecting.
      try {
        const { closeEvent } = await import("@creit.tech/stellar-wallets-kit");
        // Only worth installing if the kit's own close path is reachable —
        // otherwise Escape would appear to work and do nothing.
        if (closeEvent) {
          disposeA11y = installWalletPickerA11y(() => closeEvent.next());
        }
      } catch {
        disposeA11y = null;
      }
      // Open the multi-wallet picker. Resolves to the chosen wallet's address.
      const { address: addr } = await kit.authModal();
      // The kit sets the active module internally before resolving authModal.
      const id = kit.selectedModule.productId;
      const name = kit.selectedModule.productName;

      setAddress(addr);
      setWalletId(id);
      setWalletName(name ?? prettyName(id));
      saveSession({ walletId: id, address: addr });
      // Ask the chosen wallet which network it is really on.
      setWalletNetwork(await probeWalletNetwork(kit));
    } catch (e) {
      const f = classifyError(e);
      setError(f);
    } finally {
      disposeA11y?.();
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      // If the kit never loaded there is nothing to disconnect from —
      // don't force the chunk to download just to tear state down.
      if (kitPromise) {
        const kit = await kitPromise;
        await kit.disconnect();
      }
    } catch {
      // ignore — we still want to clear local state.
    }
    setAddress(null);
    setWalletId(null);
    setWalletName(null);
    setWalletNetwork(null);
    setError(null);
    saveSession(null);
  }, []);

  const signXdr = useCallback(
    async (xdr: string, opts?: { networkPassphrase?: string }) => {
      if (!address) throw new Error("wallet not connected");
      // Pre-flight: if the wallet already told us it is on a different
      // network, fail fast with a classified error instead of opening the
      // signing popup and letting the tx die on-chain with tx_bad_auth.
      if (walletNetworkMismatch && walletNetwork) {
        throw wrongNetworkError(
          `wallet reports ${walletNetwork.network || walletNetwork.networkPassphrase}; app expects ${NETWORK_NAME} (${NETWORK_PASSPHRASE})`,
        );
      }
      try {
        const kit = await loadKit();
        // The connect-time snapshot goes stale the moment the user switches
        // networks in the extension, so ask again right before signing —
        // otherwise the tx dies on-chain with tx_bad_auth anyway.
        const net = await probeWalletNetwork(kit);
        setWalletNetwork(net);
        if (net && net.networkPassphrase !== NETWORK_PASSPHRASE) {
          throw wrongNetworkError(
            `wallet reports ${net.network || net.networkPassphrase}; app expects ${NETWORK_NAME} (${NETWORK_PASSPHRASE})`,
          );
        }
        const res = await withDeadline(
          kit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
            address,
          }),
          SIGN_TIMEOUT_MS,
          signTimeoutError,
        );
        return res.signedTxXdr;
      } catch (e) {
        // Already classified (wrong network, sign timeout) — pass through.
        if (isFriendlyError(e)) throw e;
        // Normalize to an Error and rethrow raw — both call sites
        // (send page, execution plan) run it through classifyError
        // themselves so they can add their own context to the copy.
        throw e instanceof Error ? e : new Error(String(e));
      }
    },
    [address, walletNetwork, walletNetworkMismatch],
  );

  /**
   * Sign a plain message with the connected wallet (story 2.01's endpoint
   * binding), resolving to the kit's `signedMessage` — already base64 —
   * VERBATIM.
   *
   * That word is load-bearing: the bind verifier accepts both a raw-bytes and
   * a SEP-53 signature on purpose, so it is the backend's job to work out
   * which one arrived. Re-encoding, hashing or otherwise "normalizing" the
   * string here turns a signature the backend would have accepted into one it
   * rejects as malformed, with nothing on either side to explain why.
   *
   * Unlike `signXdr` there is no network pre-flight, and deliberately not: a
   * message signature is a bare ed25519 signature over the bytes with no
   * passphrase mixed in, so it verifies identically whichever network the
   * extension happens to be on. Blocking a mismatch here would refuse a
   * binding that was going to be accepted. Everything else — the lazy kit
   * load, the popup deadline, and rethrowing raw for the call site to
   * classify — follows `signXdr` exactly.
   */
  const signMessage = useCallback(
    async (message: string) => {
      if (!address) throw new Error("wallet not connected");
      try {
        const kit = await loadKit();
        const res = await withDeadline(
          kit.signMessage(message, { address }),
          SIGN_TIMEOUT_MS,
          signTimeoutError,
        );
        return res.signedMessage;
      } catch (e) {
        // Already classified (sign timeout) — pass through.
        if (isFriendlyError(e)) throw e;
        // Normalize to an Error and rethrow raw; the bind page runs it
        // through classifyError itself so a declined popup reads as the
        // ordinary action it is rather than a failure.
        throw e instanceof Error ? e : new Error(walletErrorMessage(e));
      }
    },
    [address],
  );

  const value = useMemo<WalletState>(
    () => ({
      installed,
      connected: Boolean(address),
      address,
      walletId,
      walletName,
      network,
      walletNetwork,
      walletNetworkMismatch,
      error,
      loading,
      xlmBalance,
      balanceLoading,
      balanceError,
      connect,
      disconnect,
      signXdr,
      signMessage,
      refreshBalance,
    }),
    [
      installed,
      address,
      walletId,
      walletName,
      network,
      walletNetwork,
      walletNetworkMismatch,
      error,
      loading,
      xlmBalance,
      balanceLoading,
      balanceError,
      connect,
      disconnect,
      signXdr,
      signMessage,
      refreshBalance,
    ],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be inside <WalletProvider>");
  return ctx;
}

// Fallback display names for every allowlisted wallet (used when the kit's
// selectedModule.productName is unavailable, e.g. on session restore).
function prettyName(id: string): string {
  const map: Record<string, string> = {
    freighter: "Freighter",
    xbull: "xBull",
    albedo: "Albedo",
    lobstr: "LOBSTR",
    hana: "Hana",
    rabet: "Rabet",
  };
  return map[id] ?? id;
}
