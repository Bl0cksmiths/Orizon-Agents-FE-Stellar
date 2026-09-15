// @vitest-environment jsdom
/**
 * Unit tests for WalletProvider (lib/wallet.tsx).
 *
 * Balance state came first: the console shipped for days with every backend
 * call failing because a failed balance fetch was indistinguishable from "no
 * balance yet" — it set `xlmBalance = null` and told no one. Those tests pin
 * the four states apart (loading, known including a real zero, failed,
 * recovered) so a regression can't quietly turn the Send form's affordability
 * guard back off.
 *
 * The rest cover the paths a user only hits on a bad day: connecting,
 * disconnecting, restoring a session, and the lazy kit loader underneath all
 * three. Two behaviours in here are easy to "fix" into bugs and so are
 * asserted explicitly:
 *   - a wallet that can't report its network is UNKNOWN, never a mismatch;
 *   - a failed kit import is not cached, so the next click can retry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const ADDRESS = "GA".padEnd(56, "X");
const STORAGE_KEY = "orizon.wallet.v2";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

// Hoisted: vi.mock factories run before module-scope consts are initialized.
const { kitMock, loader } = vi.hoisted(() => ({
  kitMock: {
    init: vi.fn(),
    setWallet: vi.fn(),
    getNetwork: vi.fn(async () => ({
      network: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
    })),
    authModal: vi.fn(),
    disconnect: vi.fn(async () => {}),
    signTransaction: vi.fn(),
    signMessage: vi.fn(),
    selectedModule: { productId: "freighter", productName: "Freighter" } as {
      productId: string;
      productName?: string;
    },
  },
  loader: {
    /** How many times wallet.tsx has pulled the kit out of the lazy chunk. */
    loads: 0,
    /** Arm a one-shot load failure, the way a dropped chunk request fails. */
    failNextLoad: false,
    /** What defaultModules() offers before wallet.tsx filters it. */
    catalogue: [
      { productId: "freighter" },
      { productId: "xbull" },
      { productId: "albedo" },
      { productId: "lobstr" },
      { productId: "hana" },
      { productId: "rabet" },
      { productId: "walletconnect" },
      { productId: "ledger" },
    ],
  },
}));

// A live getter rather than a plain value: vitest caches a mock factory's
// result for the whole file, so this is the only hook that still fires on
// every lazy load — which is what lets a test count loads and blow one up the
// way a dropped chunk request does in a browser.
vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  get StellarWalletsKit() {
    loader.loads++;
    if (loader.failNextLoad) {
      loader.failNextLoad = false;
      throw new Error(
        "ChunkLoadError: Loading chunk stellar-wallets-kit failed",
      );
    }
    return kitMock;
  },
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({
  defaultModules: (opts?: {
    filterBy?: (m: { productId: string }) => boolean;
  }) =>
    opts?.filterBy ? loader.catalogue.filter(opts.filterBy) : loader.catalogue,
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FREIGHTER_ID: "freighter",
}));

import { WalletProvider, useWallet } from "./wallet";
import { classifyError } from "./wallet-errors";

function wrapper({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

/**
 * Re-imports lib/wallet with a fresh module registry, so the module-level kit
 * promise cache starts empty — the only way to observe "the kit was never
 * loaded" and "a failed load isn't cached" from outside. The returned `mount`
 * binds to the fresh copy's own context; the file-level `useWallet` would see
 * an empty one.
 */
async function freshWallet() {
  vi.resetModules();
  const mod: typeof import("./wallet") = await import("./wallet");
  const wrap = ({ children }: { children: React.ReactNode }) => (
    <mod.WalletProvider>{children}</mod.WalletProvider>
  );
  return {
    mount: () => renderHook(() => mod.useWallet(), { wrapper: wrap }),
  };
}

/** Renders the provider with a restored session so an address is present. */
async function mountConnected() {
  const hook = renderHook(() => useWallet(), { wrapper });
  await waitFor(() => expect(hook.result.current.address).toBe(ADDRESS));
  return hook;
}

/** Renders the provider with no saved session — nothing restored, no kit load. */
function mountFresh() {
  window.localStorage.clear();
  return renderHook(() => useWallet(), { wrapper });
}

function horizonOk(balance: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      balances: [{ asset_type: "native", balance }],
    }),
  } as unknown as Response;
}

function horizonStatus(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

beforeEach(() => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ walletId: "freighter", address: ADDRESS }),
  );
  // mockReset restores the implementation each mock was created with, so the
  // default getNetwork/disconnect behaviour survives while leftover *Once
  // queues and call history from a previous test do not.
  kitMock.init.mockReset();
  kitMock.setWallet.mockReset();
  kitMock.getNetwork.mockReset();
  kitMock.authModal.mockReset();
  kitMock.disconnect.mockReset();
  kitMock.signTransaction.mockReset();
  kitMock.signMessage.mockReset();
  kitMock.selectedModule = { productId: "freighter", productName: "Freighter" };
  loader.failNextLoad = false;
  // Every mount with an address fetches a balance; keep it off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => horizonOk("10.0000000")),
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("WalletProvider balance state", () => {
  it("reports a fetched balance with no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => horizonOk("123.4567890")),
    );

    const { result } = await mountConnected();

    await waitFor(() => expect(result.current.balanceLoading).toBe(false));
    expect(result.current.xlmBalance).toBe("123.4567890");
    expect(result.current.balanceError).toBeNull();
  });

  it("treats an unfunded (404) account as a known zero, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => horizonStatus(404)),
    );

    const { result } = await mountConnected();

    await waitFor(() => expect(result.current.xlmBalance).toBe("0"));
    expect(result.current.balanceError).toBeNull();
  });

  it("exposes an error — not a silent null — on a non-OK Horizon response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => horizonStatus(503)),
    );

    const { result } = await mountConnected();

    await waitFor(() =>
      expect(result.current.balanceError).toBe("Horizon responded 503"),
    );
    expect(result.current.xlmBalance).toBeNull();
    expect(result.current.balanceLoading).toBe(false);
  });

  it("exposes an error when the request itself throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }),
    );

    const { result } = await mountConnected();

    await waitFor(() =>
      expect(result.current.balanceError).toBe("Failed to fetch"),
    );
    expect(result.current.xlmBalance).toBeNull();
  });

  it("stringifies a non-Error thrown by the balance request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "horizon exploded";
      }),
    );

    const { result } = await mountConnected();

    await waitFor(() =>
      expect(result.current.balanceError).toBe("horizon exploded"),
    );
    expect(result.current.xlmBalance).toBeNull();
  });

  it("keeps the error visible while a refreshBalance() retry is in flight, then clears it on success", async () => {
    let settle: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(async () => horizonStatus(500))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            settle = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = await mountConnected();
    await waitFor(() =>
      expect(result.current.balanceError).toBe("Horizon responded 500"),
    );

    act(() => {
      void result.current.refreshBalance();
    });

    // Retry in flight: still loading, and the reason is still on screen so the
    // UI can render "retrying…" beside it instead of flashing a placeholder.
    await waitFor(() => expect(result.current.balanceLoading).toBe(true));
    expect(result.current.balanceError).toBe("Horizon responded 500");

    await act(async () => {
      settle(horizonOk("7.0000000"));
    });

    await waitFor(() => expect(result.current.balanceError).toBeNull());
    expect(result.current.xlmBalance).toBe("7.0000000");
  });

  it("ignores a stale balance response that settles after a newer one", async () => {
    // Two reads overlap in normal use: the address effect fires one on
    // connect, refreshBalance() fires another. Here the OLDER one settles
    // last, with a failure. Without request sequencing it would wipe the
    // newer, correct balance and set an error — blocking the Send form's
    // affordability guard on a wallet that is actually funded.
    let settleFirst: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            settleFirst = resolve;
          }),
      )
      .mockImplementationOnce(async () => horizonOk("42.0000000"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = await mountConnected();

    act(() => {
      void result.current.refreshBalance();
    });

    await waitFor(() => expect(result.current.xlmBalance).toBe("42.0000000"));
    expect(result.current.balanceError).toBeNull();

    await act(async () => {
      settleFirst(horizonStatus(500));
    });

    // The obsolete failure is discarded, not applied.
    expect(result.current.xlmBalance).toBe("42.0000000");
    expect(result.current.balanceError).toBeNull();
    expect(result.current.balanceLoading).toBe(false);
  });

  it("clears the balance and its error on disconnect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => horizonStatus(502)),
    );

    const { result } = await mountConnected();
    await waitFor(() => expect(result.current.balanceError).not.toBeNull());

    await act(async () => {
      await result.current.disconnect();
    });

    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(result.current.xlmBalance).toBeNull();
    expect(result.current.balanceError).toBeNull();
    expect(result.current.balanceLoading).toBe(false);
  });

  it("defaults a funded account with no native entry to zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ balances: [] }),
          }) as unknown as Response,
      ),
    );

    const { result } = await mountConnected();

    await waitFor(() => expect(result.current.xlmBalance).toBe("0"));
    expect(result.current.balanceError).toBeNull();
  });

  it("does not hit Horizon when refreshBalance() is called while disconnected", async () => {
    const fetchMock = vi.fn(async () => horizonOk("1.0000000"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = mountFresh();
    await act(async () => {
      await result.current.refreshBalance();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.xlmBalance).toBeNull();
  });
});

describe("kit loader", () => {
  it("initializes the kit once, with only the allowlisted wallet modules", async () => {
    const { mount } = await freshWallet();
    window.localStorage.clear();
    kitMock.authModal.mockResolvedValue({ address: ADDRESS });

    const { result } = mount();
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.connect();
    });

    expect(kitMock.init).toHaveBeenCalledTimes(1);
    const cfg = kitMock.init.mock.calls[0][0] as {
      modules: { productId: string }[];
      selectedWalletId: string;
      network: string;
    };
    expect(cfg.modules.map((m) => m.productId)).toEqual([
      "freighter",
      "xbull",
      "albedo",
      "lobstr",
      "hana",
      "rabet",
    ]);
    expect(cfg.selectedWalletId).toBe("freighter");
    expect(cfg.network).toBe(TESTNET_PASSPHRASE);
  });

  it("does not cache a failed load — a second connect re-imports the kit", async () => {
    const { mount } = await freshWallet();
    window.localStorage.clear();
    const importsBefore = loader.loads;
    loader.failNextLoad = true;

    const { result } = mount();
    await act(async () => {
      await result.current.connect();
    });

    // First click: the chunk never arrived. State stays clean and the reason
    // is surfaced rather than swallowed.
    expect(result.current.error?.raw).toMatch(/ChunkLoadError/);
    expect(result.current.address).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Second click: the import is attempted again instead of replaying the
    // cached rejection forever.
    kitMock.authModal.mockResolvedValue({ address: ADDRESS });
    await act(async () => {
      await result.current.connect();
    });

    expect(loader.loads).toBe(importsBefore + 2);
    expect(result.current.address).toBe(ADDRESS);
    expect(result.current.error).toBeNull();
  });
});

describe("connect", () => {
  it("stores the address, persists the wallet id, and probes the network", async () => {
    window.localStorage.clear();
    kitMock.authModal.mockResolvedValue({ address: ADDRESS });
    kitMock.getNetwork.mockResolvedValue({
      network: "TESTNET",
      networkPassphrase: TESTNET_PASSPHRASE,
    });

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.address).toBe(ADDRESS);
    expect(result.current.connected).toBe(true);
    expect(result.current.walletId).toBe("freighter");
    expect(result.current.walletName).toBe("Freighter");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
    ).toEqual({ walletId: "freighter", address: ADDRESS });
    expect(kitMock.getNetwork).toHaveBeenCalled();
    expect(result.current.walletNetwork).toEqual({
      network: "TESTNET",
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(result.current.walletNetworkMismatch).toBe(false);
  });

  it("falls back to a friendly name when the kit module reports none", async () => {
    window.localStorage.clear();
    kitMock.authModal.mockResolvedValue({ address: ADDRESS });
    kitMock.selectedModule = { productId: "lobstr" };

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.walletName).toBe("LOBSTR");

    // A wallet the pretty-name map has never heard of shows its raw id
    // rather than blanking the header.
    kitMock.selectedModule = { productId: "brand-new-wallet" };
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.walletName).toBe("brand-new-wallet");
  });

  it("surfaces a classified error and leaves state clean when the picker is dismissed", async () => {
    window.localStorage.clear();
    kitMock.authModal.mockRejectedValue(new Error("User declined access"));

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toMatchObject({
      kind: "user_rejected",
      raw: "User declined access",
    });
    expect(result.current.address).toBeNull();
    expect(result.current.connected).toBe(false);
    expect(result.current.walletId).toBeNull();
    expect(result.current.walletName).toBeNull();
    expect(result.current.walletNetwork).toBeNull();
    expect(result.current.loading).toBe(false);
    // A dismissed modal must not leave a session behind to auto-restore.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears a previous error when a retry succeeds", async () => {
    window.localStorage.clear();
    kitMock.authModal.mockRejectedValueOnce(new Error("No wallet selected"));

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error?.kind).toBe("user_rejected");

    kitMock.authModal.mockResolvedValueOnce({ address: ADDRESS });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.address).toBe(ADDRESS);
  });
});

describe("session restore", () => {
  it("re-attaches the saved wallet to the kit on mount", async () => {
    const { result } = await mountConnected();

    expect(kitMock.setWallet).toHaveBeenCalledWith("freighter");
    expect(result.current.walletId).toBe("freighter");
    expect(result.current.walletName).toBe("Freighter");
    expect(result.current.connected).toBe(true);
  });

  it("stays disconnected — and never loads the kit — when nothing is stored", async () => {
    const { mount } = await freshWallet();
    window.localStorage.clear();
    const importsBefore = loader.loads;

    const { result } = mount();
    await waitFor(() => expect(result.current.connected).toBe(false));

    expect(loader.loads).toBe(importsBefore);
    expect(kitMock.setWallet).not.toHaveBeenCalled();
    expect(result.current.address).toBeNull();
  });

  it("ignores a corrupt stored session instead of throwing on mount", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.address).toBeNull();
    expect(kitMock.setWallet).not.toHaveBeenCalled();
  });

  it("ignores a stored session that is missing the address or wallet id", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: "" }));
    const first = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(first.result.current.address).toBeNull());

    cleanup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ address: ADDRESS }),
    );
    const second = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(second.result.current.address).toBeNull());

    expect(kitMock.setWallet).not.toHaveBeenCalled();
  });

  it("abandons an in-flight restore when the provider unmounts", async () => {
    const hook = renderHook(() => useWallet(), { wrapper });
    hook.unmount();

    await waitFor(() =>
      expect(kitMock.setWallet).toHaveBeenCalledWith("freighter"),
    );
    // The cancellation check lands before the network probe, so a navigation
    // mid-restore can't set state on a torn-down provider.
    expect(kitMock.getNetwork).not.toHaveBeenCalled();
  });

  it("degrades silently when the kit can't be loaded for the restore", async () => {
    const { mount } = await freshWallet();
    loader.failNextLoad = true;

    const { result } = mount();
    await waitFor(() => expect(loader.loads).toBeGreaterThan(0));

    // No crash, no error toast for something the user never asked for — just
    // a page that behaves as if it were never connected.
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("wallet network probe", () => {
  it("flags a mismatch when the wallet reports a different passphrase", async () => {
    kitMock.getNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: PUBLIC_PASSPHRASE,
    });

    const { result } = await mountConnected();
    await waitFor(() =>
      expect(result.current.walletNetworkMismatch).toBe(true),
    );
    expect(result.current.walletNetwork).toEqual({
      network: "PUBLIC",
      networkPassphrase: PUBLIC_PASSPHRASE,
    });
    // …and the app's own network is what it was compared against.
    expect(result.current.network).toEqual({
      network: "TESTNET",
      networkPassphrase: TESTNET_PASSPHRASE,
    });
  });

  it("treats a wallet that rejects getNetwork as UNKNOWN, never a mismatch", async () => {
    // Albedo and LOBSTR reject getNetwork with code -3. Reading that as a
    // mismatch would show a permanent "wrong network" warning and block
    // signing for wallets that are on the right network all along.
    kitMock.getNetwork.mockRejectedValue(new Error("code -3"));

    const { result } = await mountConnected();
    await waitFor(() => expect(result.current.connected).toBe(true));

    expect(result.current.walletNetwork).toBeNull();
    expect(result.current.walletNetworkMismatch).toBe(false);
  });

  it("treats a malformed getNetwork response as UNKNOWN", async () => {
    // No passphrase at all — nothing to compare against.
    kitMock.getNetwork.mockResolvedValue({
      network: "TESTNET",
    } as unknown as { network: string; networkPassphrase: string });

    const { result } = await mountConnected();
    await waitFor(() => expect(result.current.connected).toBe(true));

    expect(result.current.walletNetwork).toBeNull();
    expect(result.current.walletNetworkMismatch).toBe(false);
  });

  it("keeps a non-string network label out of the snapshot", async () => {
    kitMock.getNetwork.mockResolvedValue({
      network: 7,
      networkPassphrase: TESTNET_PASSPHRASE,
    } as unknown as { network: string; networkPassphrase: string });

    const { result } = await mountConnected();
    await waitFor(() => expect(result.current.walletNetwork).not.toBeNull());

    expect(result.current.walletNetwork).toEqual({
      network: "",
      networkPassphrase: TESTNET_PASSPHRASE,
    });
    expect(result.current.walletNetworkMismatch).toBe(false);
  });
});

describe("disconnect", () => {
  it("tears down without downloading the kit chunk when it was never loaded", async () => {
    const { mount } = await freshWallet();
    window.localStorage.clear();
    const importsBefore = loader.loads;

    const { result } = mount();
    await act(async () => {
      await result.current.disconnect();
    });

    expect(loader.loads).toBe(importsBefore);
    expect(kitMock.disconnect).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it("disconnects the kit, clears state, and drops the saved session", async () => {
    const { result } = await mountConnected();
    await waitFor(() => expect(result.current.walletNetwork).not.toBeNull());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(kitMock.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.address).toBeNull();
    expect(result.current.walletId).toBeNull();
    expect(result.current.walletName).toBeNull();
    expect(result.current.walletNetwork).toBeNull();
    expect(result.current.error).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clears local state even when the kit's disconnect throws", async () => {
    const { result } = await mountConnected();
    kitMock.disconnect.mockRejectedValueOnce(new Error("port closed"));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("signXdr", () => {
  /** Mounts connected and waits out the restore-time network probe, so the
   * next getNetwork() call is deterministically the sign-time re-probe. */
  async function mountProbed() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => horizonOk("1.0000000")),
    );
    const hook = await mountConnected();
    await waitFor(() =>
      expect(hook.result.current.walletNetwork).not.toBeNull(),
    );
    return hook;
  }

  it("refuses to sign while disconnected", async () => {
    const { result } = mountFresh();
    await expect(result.current.signXdr("XDR")).rejects.toThrow(
      /not connected/i,
    );
    expect(kitMock.signTransaction).not.toHaveBeenCalled();
  });

  it("re-probes the wallet network before signing and fails fast on a mismatch", async () => {
    const { result } = await mountProbed();
    expect(result.current.walletNetworkMismatch).toBe(false);

    // The user flips the extension to mainnet after connecting — the
    // connect-time snapshot still says testnet.
    kitMock.getNetwork.mockResolvedValueOnce({
      network: "PUBLIC",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });

    let err: unknown;
    await act(async () => {
      err = await result.current.signXdr("XDR").catch((e: unknown) => e);
    });
    expect(err).toMatchObject({ kind: "wrong_network" });
    expect(kitMock.signTransaction).not.toHaveBeenCalled();
    // The fresh probe also refreshed the exposed snapshot.
    await waitFor(() =>
      expect(result.current.walletNetworkMismatch).toBe(true),
    );
  });

  it("never opens the popup when the known snapshot already says wrong network", async () => {
    kitMock.getNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: PUBLIC_PASSPHRASE,
    });
    const { result } = await mountConnected();
    await waitFor(() =>
      expect(result.current.walletNetworkMismatch).toBe(true),
    );
    const probesBefore = kitMock.getNetwork.mock.calls.length;

    let err: unknown;
    await act(async () => {
      err = await result.current.signXdr("XDR").catch((e: unknown) => e);
    });

    expect(err).toMatchObject({ kind: "wrong_network" });
    expect((err as { raw: string }).raw).toContain("wallet reports PUBLIC");
    // Pre-flight short-circuit: no kit round-trip at all, popup included.
    expect(kitMock.getNetwork.mock.calls.length).toBe(probesBefore);
    expect(kitMock.signTransaction).not.toHaveBeenCalled();
  });

  it("names the passphrase when the mismatched wallet reports no network label", async () => {
    kitMock.getNetwork.mockResolvedValue({
      network: "",
      networkPassphrase: PUBLIC_PASSPHRASE,
    });
    const { result } = await mountConnected();
    await waitFor(() =>
      expect(result.current.walletNetworkMismatch).toBe(true),
    );

    let err: unknown;
    await act(async () => {
      err = await result.current.signXdr("XDR").catch((e: unknown) => e);
    });
    expect((err as { raw: string }).raw).toContain(PUBLIC_PASSPHRASE);
  });

  it("names the passphrase when the sign-time re-probe finds an unlabelled network", async () => {
    const { result } = await mountProbed();
    kitMock.getNetwork.mockResolvedValueOnce({
      network: "",
      networkPassphrase: PUBLIC_PASSPHRASE,
    });

    let err: unknown;
    await act(async () => {
      err = await result.current.signXdr("XDR").catch((e: unknown) => e);
    });
    expect(err).toMatchObject({ kind: "wrong_network" });
    expect((err as { raw: string }).raw).toContain(PUBLIC_PASSPHRASE);
  });

  it("rejects with a friendly timeout when the signing popup never settles", async () => {
    const { result } = await mountProbed();
    kitMock.signTransaction.mockImplementationOnce(() => new Promise(() => {}));

    vi.useFakeTimers();
    try {
      let err: unknown;
      await act(async () => {
        const settled = result.current.signXdr("XDR").catch((e: unknown) => {
          err = e;
        });
        // Flush the pre-sign microtask chain (kit load, network re-probe) so
        // the deadline timer is armed before the clock advances past it.
        for (let i = 0; i < 20; i++) await Promise.resolve();
        await vi.advanceTimersByTimeAsync(120_000);
        await settled;
      });
      expect(err).toMatchObject({ kind: "unknown", title: "Wallet timed out" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire the deadline when the wallet signs in time", async () => {
    const { result } = await mountProbed();
    kitMock.signTransaction.mockResolvedValueOnce({ signedTxXdr: "SIGNED" });

    vi.useFakeTimers();
    try {
      let signed = "";
      await act(async () => {
        const pending = result.current.signXdr("XDR");
        for (let i = 0; i < 20; i++) await Promise.resolve();
        // Well past the 120s deadline — a cleared timer must stay cleared.
        await vi.advanceTimersByTimeAsync(300_000);
        signed = await pending;
      });
      expect(signed).toBe("SIGNED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs when the re-probe can't determine the network (unknown, not a mismatch)", async () => {
    const { result } = await mountProbed();
    // Albedo/Lobstr-style wallet: getNetwork rejects → unknown, no blocking.
    kitMock.getNetwork.mockRejectedValueOnce(new Error("code -3"));
    kitMock.signTransaction.mockResolvedValueOnce({ signedTxXdr: "SIGNED" });

    let signed = "";
    await act(async () => {
      signed = await result.current.signXdr("XDR");
    });
    expect(signed).toBe("SIGNED");
    expect(kitMock.signTransaction).toHaveBeenCalledWith("XDR", {
      networkPassphrase: TESTNET_PASSPHRASE,
      address: ADDRESS,
    });
  });

  it("passes an explicit network passphrase through to the wallet", async () => {
    const { result } = await mountProbed();
    kitMock.signTransaction.mockResolvedValueOnce({ signedTxXdr: "SIGNED" });

    await act(async () => {
      await result.current.signXdr("XDR", {
        networkPassphrase: "Standalone Network ; February 2017",
      });
    });
    expect(kitMock.signTransaction).toHaveBeenCalledWith("XDR", {
      networkPassphrase: "Standalone Network ; February 2017",
      address: ADDRESS,
    });
  });

  it("propagates the wallet's own rejection untouched", async () => {
    const { result } = await mountProbed();
    kitMock.signTransaction.mockRejectedValueOnce(
      new Error("User declined access"),
    );

    let err: unknown;
    await act(async () => {
      err = await result.current.signXdr("XDR").catch((e: unknown) => e);
    });
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("User declined access");
  });

  it("wraps a non-Error rejection so call-sites always get an Error", async () => {
    const { result } = await mountProbed();
    kitMock.signTransaction.mockRejectedValueOnce("popup vanished");

    let err: unknown;
    await act(async () => {
      err = await result.current.signXdr("XDR").catch((e: unknown) => e);
    });
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("popup vanished");
  });
});

describe("signMessage", () => {
  /** Mounts connected and waits out the restore-time network probe, so a
   * later getNetwork() call can only have come from the code under test. */
  async function mountProbed() {
    const hook = await mountConnected();
    await waitFor(() =>
      expect(hook.result.current.walletNetwork).not.toBeNull(),
    );
    return hook;
  }

  it("refuses to sign while disconnected", async () => {
    const { result } = mountFresh();
    await expect(
      result.current.signMessage("orizon-bind:v1:a:b:c"),
    ).rejects.toThrow(/not connected/i);
    expect(kitMock.signMessage).not.toHaveBeenCalled();
  });

  it("returns the wallet's base64 signature VERBATIM", async () => {
    // The bind verifier accepts both raw-bytes and SEP-53 signatures on
    // purpose, so anything this layer did to "normalize" the string would
    // turn a signature the backend accepts into one it rejects.
    const { result } = await mountProbed();
    kitMock.signMessage.mockResolvedValueOnce({
      signedMessage: "c2lnbmF0dXJlLWJ5dGVz",
      signerAddress: ADDRESS,
    });

    let signature = "";
    await act(async () => {
      signature = await result.current.signMessage("orizon-bind:v1:a:b:c");
    });

    expect(signature).toBe("c2lnbmF0dXJlLWJ5dGVz");
    expect(kitMock.signMessage).toHaveBeenCalledWith("orizon-bind:v1:a:b:c", {
      address: ADDRESS,
    });
  });

  it("does not block on a wallet reporting a different network", async () => {
    // A message signature carries no passphrase, so it verifies the same on
    // any network — refusing here would reject a binding the backend would
    // have accepted. This is the one place signMessage must NOT copy signXdr.
    kitMock.getNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: PUBLIC_PASSPHRASE,
    });
    const { result } = await mountConnected();
    await waitFor(() =>
      expect(result.current.walletNetworkMismatch).toBe(true),
    );
    kitMock.signMessage.mockResolvedValueOnce({ signedMessage: "SIG" });

    let signature = "";
    await act(async () => {
      signature = await result.current.signMessage("msg");
    });
    expect(signature).toBe("SIG");
  });

  it("rejects with a friendly timeout when the popup never settles", async () => {
    const { result } = await mountProbed();
    kitMock.signMessage.mockImplementationOnce(() => new Promise(() => {}));

    vi.useFakeTimers();
    try {
      let err: unknown;
      await act(async () => {
        const settled = result.current
          .signMessage("msg")
          .catch((e: unknown) => {
            err = e;
          });
        // Flush the pre-sign microtask chain (the lazy kit load) so the
        // deadline timer is armed before the clock advances past it.
        for (let i = 0; i < 20; i++) await Promise.resolve();
        await vi.advanceTimersByTimeAsync(120_000);
        await settled;
      });
      expect(err).toMatchObject({ kind: "unknown", title: "Wallet timed out" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the wallet's own wording when the kit rejects with a plain object", async () => {
    // The kit's parseError throws `{ code, message }`, not an Error. Passing
    // that through String() would produce "[object Object]" and erase the
    // phrase the rejection classifier matches on — a cancelled popup would
    // read as an unexplained failure.
    const { result } = await mountProbed();
    kitMock.signMessage.mockRejectedValueOnce({
      code: -4,
      message: "User declined access",
    });

    let err: unknown;
    await act(async () => {
      err = await result.current.signMessage("msg").catch((e: unknown) => e);
    });
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("User declined access");
    expect(classifyError(err).kind).toBe("user_rejected");
  });

  it("propagates a thrown Error untouched", async () => {
    const { result } = await mountProbed();
    kitMock.signMessage.mockRejectedValueOnce(new Error("wallet is locked"));

    let err: unknown;
    await act(async () => {
      err = await result.current.signMessage("msg").catch((e: unknown) => e);
    });
    expect((err as Error).message).toBe("wallet is locked");
  });
});

describe("useWallet", () => {
  it("throws a pointed error when used outside the provider", () => {
    // React logs the boundary-less render failure; the throw is the assertion.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useWallet())).toThrow(
        /inside <WalletProvider>/,
      );
    } finally {
      quiet.mockRestore();
    }
  });
});
