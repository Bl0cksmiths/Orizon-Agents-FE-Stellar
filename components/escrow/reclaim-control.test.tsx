// @vitest-environment jsdom
/**
 * ReclaimControl: offered only to the paying wallet, only once the
 * authorization has expired, and every answer said in a live region.
 * Plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { HeldAuthorization } from "@/lib/held-authorizations";
import type { ReclaimResult } from "@/lib/reclaim";

const PAYER = "GBPAYER".padEnd(56, "A");
const AUTH = "0123456789abcdef0123456789abcdef";
const HASH = "f".repeat(64);

const { wallet, reclaim } = vi.hoisted(() => ({
  wallet: {
    connected: true,
    address: null as string | null,
    signXdr: vi.fn(),
    refreshBalance: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    loading: false,
    error: null,
  },
  reclaim: vi.fn(),
}));
vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/reclaim", () => ({ reclaimAuthorization: reclaim }));

import { ReclaimControl } from "./reclaim-control";

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);
const held = (expiresInMs: number | null): HeldAuthorization => ({
  authIdHex: AUTH,
  payer: PAYER,
  expiresAt: expiresInMs === null ? null : (NOW + expiresInMs) / 1_000,
});
const reclaimButton = () => screen.queryByRole("button", { name: /reclaim/i });
const status = () => screen.getByRole("status");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  wallet.connected = true;
  wallet.address = PAYER;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function pressWith(result: ReclaimResult) {
  reclaim.mockResolvedValue(result);
  render(<ReclaimControl held={held(-1_000)} amount="0.3 XLM" />);
  fireEvent.click(reclaimButton()!);
  await waitFor(() => expect(status().textContent).not.toBe(""));
}

describe("ReclaimControl", () => {
  // Locked before expiry: a button that can only fail is worse than a time.
  it("says when reclaim opens, and offers no button before then", () => {
    render(<ReclaimControl held={held(12 * 60_000)} amount="0.3 XLM" />);
    expect(reclaimButton()).toBeNull();
    expect(document.body.textContent).toContain("Reclaim opens at");
    expect(document.body.textContent).toContain("in about 12 minutes");
  });

  it("offers the button on time, without a reload", async () => {
    render(<ReclaimControl held={held(45_000)} amount="0.3 XLM" />);
    expect(reclaimButton()).toBeNull();
    // Woken on its own cadence, then at the opening moment itself.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(reclaimButton()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(16_000);
    });
    expect(reclaimButton()?.textContent).toBe("Reclaim 0.3 XLM ▸");
  });

  it("reclaims for the paying wallet, and says so with the transaction", async () => {
    await pressWith({ kind: "reclaimed", hash: HASH });
    expect(reclaim).toHaveBeenCalledWith(
      expect.objectContaining({ payer: PAYER, authIdHex: AUTH }),
    );
    expect(status().textContent).toContain(
      "Reclaimed: the whole authorization is back in the wallet that paid.",
    );
    const link = screen.getByRole("link", {
      name: "view reclaim on stellar.expert",
    });
    expect(link.getAttribute("href")).toMatch(new RegExp(`/tx/${HASH}$`));
    expect(reclaimButton()).toBeNull();
    expect(wallet.refreshBalance).toHaveBeenCalled();
  });

  // Already back is an answer, not an error — and nothing is left to press.
  it.each([
    ["already_settled", "a settlement already took this authorization over"],
    ["already_reclaimed", "this authorization was already reclaimed"],
    ["unavailable", "the backend has no route to build the transaction"],
    ["nothing_held", "no funds left the wallet that paid"],
  ] as const)(
    "says %s plainly and offers nothing more",
    async (kind, words) => {
      await pressWith({ kind });
      expect(status().textContent).toContain(words);
      expect(reclaimButton()).toBeNull();
    },
  );

  it.each([
    ["not_yet", "has not expired yet"],
    ["declined", "nothing was sent"],
  ] as const)("keeps the offer open after %s", async (kind, words) => {
    await pressWith({ kind });
    expect(status().textContent).toContain(words);
    expect(reclaimButton()).not.toBeNull();
  });

  it("says a failure is one, with its reason", async () => {
    await pressWith({
      kind: "failed",
      error: {
        kind: "unknown",
        title: "Fee too low",
        detail: "Retry.",
        raw: "",
      },
    });
    expect(status().textContent).toContain(
      "The reclaim did not go through. Fee too low: Retry.",
    );
  });

  // Only the payer can reclaim; nobody else is offered the button.
  it("asks for the paying wallet instead of offering the button to another", () => {
    wallet.address = "GBOTHER".padEnd(56, "B");
    render(<ReclaimControl held={held(-1_000)} />);
    expect(reclaimButton()).toBeNull();
    expect(document.body.textContent).toContain(
      "The connected wallet is not the one that paid.",
    );
    expect(document.body.textContent).toContain(PAYER);
  });

  it("offers the button when the expiry was never reported, and lets the escrow judge", () => {
    render(<ReclaimControl held={held(null)} />);
    expect(reclaimButton()?.textContent).toBe("Reclaim held funds ▸");
  });
});
