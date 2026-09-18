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
import { cleanup, render, screen } from "@testing-library/react";

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
});
