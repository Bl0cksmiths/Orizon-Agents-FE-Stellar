// @vitest-environment jsdom
/**
 * Unit tests for ExecutionPlan — the card a buyer authorizes payment from.
 *
 * The composed pieces (floor summary, exclusions, banner) have their own
 * suites. These pin what only the card itself decides: which element the
 * Authorize control is described by.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import type {
  DecomposeResponse,
  PlanStep,
  StellarNetworkInfo,
} from "@/lib/types";

// Hoisted: the vi.mock factories run before module-scope consts exist.
const { api, wallet } = vi.hoisted(() => ({
  api: {
    getStellarNetwork: vi.fn(),
    buildAuthorize: vi.fn(),
    execute: vi.fn(),
    submitSigned: vi.fn(),
  },
  wallet: {
    connected: true,
    address: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
    signXdr: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => api);
vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ExecutionPlan } from "./execution-plan";
import { UNVERIFIED_BANNER_ID } from "./degraded-banner";

/** What GET /api/stellar/network answers on testnet: the escrow's SAC wraps
 *  the native asset. */
const TESTNET: StellarNetworkInfo = {
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  admin: "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEPLATFORMXXXXX",
  contracts: {},
  asset: "native",
  asset_sac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
};

function step(over: Partial<PlanStep> = {}): PlanStep {
  return {
    agent_id: "code.next",
    agent_name: "code.next",
    rationale: "implement and wire up the app",
    est_price_usdc: 0.066,
    est_eta_seconds: 3.1,
    rep_bps: 6583,
    rep_source: "onchain",
    ...over,
  };
}

function plan(over: Partial<DecomposeResponse> = {}): DecomposeResponse {
  return {
    plan_id: "plan_unit",
    intent: "code a calculator web app",
    steps: [step()],
    total_usdc: 0.123,
    total_eta: 6.7,
    floor_bps: 5500,
    reputation_degraded: false,
    ...over,
  };
}

const authorizeButton = () =>
  screen.getByRole("button", { name: /authorize/i });

beforeEach(() => {
  api.getStellarNetwork.mockResolvedValue(TESTNET);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExecutionPlan · Authorize and the unverified-reputation banner", () => {
  // Tab goes from the exclusions panel straight to Authorize, past a polite
  // status that was announced once when the plan rendered. The description is
  // how a keyboard buyer still hears it at the moment of paying.
  it("describes Authorize by the banner when a reputation read failed", () => {
    render(<ExecutionPlan plan={plan({ reputation_degraded: true })} />);
    const describedBy = authorizeButton().getAttribute("aria-describedby");
    expect(describedBy).toBe(UNVERIFIED_BANNER_ID);
    const banner = document.getElementById(UNVERIFIED_BANNER_ID);
    expect(banner?.getAttribute("role")).toBe("status");
  });

  // A reference to an id that is not on the page describes nothing and is an
  // accessibility-audit failure; and an absent or false flag is not a failed
  // read, so there is no warning to point at.
  it.each([
    ["every read succeeded", { reputation_degraded: false }],
    ["the backend predates the flag", { reputation_degraded: undefined }],
  ])("leaves Authorize undescribed when %s", (_name, over) => {
    render(<ExecutionPlan plan={plan(over)} />);
    expect(authorizeButton().hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById(UNVERIFIED_BANNER_ID)).toBeNull();
  });
});

describe("ExecutionPlan · the unit on the amounts", () => {
  // `total_usdc` is a field name, not a currency. The cap the buyer signs is
  // that figure in stroops of whatever the escrow's SAC wraps — native XLM on
  // testnet — so "USDC" beside it was a false statement about their money.
  it("labels the total and the authorize cap with the network's asset", async () => {
    const { container } = render(<ExecutionPlan plan={plan()} />);
    expect((await screen.findAllByText("0.123 XLM")).length).toBe(2);
    const cap = Array.from(container.querySelectorAll("b")).find((b) =>
      b.textContent?.includes("0.123"),
    );
    expect(cap?.textContent).toBe("0.123 XLM");
    expect(container.textContent).not.toMatch(/\bUSDC\b/);
  });

  // Never a guessed unit. A rejection useFetch will not retry on its own (a
  // transient one would schedule a background retry the assertions then race).
  it.each([
    [
      "has failed",
      () =>
        api.getStellarNetwork.mockRejectedValue(
          new Error("malformed response from /stellar/network"),
        ),
    ],
    [
      "is still in flight",
      () => api.getStellarNetwork.mockReturnValue(new Promise(() => {})),
    ],
  ])(
    "prints the amounts bare while the network read %s",
    async (_name, arrange) => {
      arrange();
      const { container } = render(<ExecutionPlan plan={plan()} />);
      await waitFor(() => expect(api.getStellarNetwork).toHaveBeenCalled());
      // Let a rejection settle — its handlers run as microtasks, all drained
      // before a zero-delay timer fires — so the card is read after it.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      const cap = Array.from(container.querySelectorAll("b")).find((b) =>
        b.textContent?.includes("0.123"),
      );
      expect(cap?.textContent).toBe("0.123");
      expect(screen.getAllByText("0.123", { exact: true }).length).toBe(2);
      expect(container.textContent).not.toMatch(/\b(USDC|XLM)\b/);
    },
  );
});

describe("ExecutionPlan · each step's reputation badge", () => {
  /** The step's chip, found by the label a screen reader hears. */
  const chip = () =>
    screen.getByLabelText(/on-chain reputation|prior estimate/);

  // The case the lower bound exists for: a healthy-looking 2.88 headline with
  // too little evidence behind it. The floor gates on the bound (2.64), so
  // the chip must say below-floor even though the headline clears 2.75.
  it("judges a step against the floor on its lower bound, not its headline", () => {
    render(
      <ExecutionPlan
        plan={plan({
          steps: [step({ rep_bps: 5750, rep_lower_bound_bps: 5283 })],
        })}
      />,
    );
    expect(chip().getAttribute("aria-label")).toContain(
      "below the 2.75 network floor",
    );
  });
});
