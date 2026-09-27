// @vitest-environment jsdom
/**
 * Unit tests for ExecutionPlan — the card a buyer authorizes payment from.
 *
 * The composed pieces (floor summary, exclusions, banner, fallback notice)
 * have their own suites. These pin what only the card itself decides: which
 * elements the Authorize control is described by, where the notices sit, who
 * owns the planner retry, which unit its amounts carry, and what
 * each step's reputation badge is handed — the lower bound the floor is
 * judged on, the evidence behind the score, and whether the read failed.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
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

import type {
  DecomposeResponse,
  PlanStep,
  StellarNetworkInfo,
} from "@/lib/types";

const PAYER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

// Hoisted: the vi.mock factories run before module-scope consts exist. The
// wallet is mutable so a test can disconnect it; `beforeEach` reconnects.
// The fiat quote never settles — the fiat tests are about which panel opens.
const { api, wallet, pdax } = vi.hoisted(() => ({
  api: {
    getStellarNetwork: vi.fn(),
    buildAuthorize: vi.fn(),
    execute: vi.fn(),
    submitSigned: vi.fn(),
  },
  wallet: {
    connected: true,
    address: null as string | null,
    signXdr: vi.fn(),
    connect: vi.fn(),
    loading: false,
    error: null,
  },
  pdax: {
    pdaxFundingQuote: vi.fn(() => new Promise(() => {})),
    pdaxReconcileRamp: vi.fn(),
    pdaxStartOnRamp: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => api);
vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/pdax", () => pdax);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ExecutionPlan } from "./execution-plan";
import {
  UNVERIFIED_BANNER_ID,
  UNVERIFIED_SUMMARY,
  UNVERIFIED_SUMMARY_ID,
} from "./degraded-banner";
import { PLANNER_FALLBACK_NOTICE_ID } from "./planner-fallback-notice";

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
  wallet.connected = true;
  wallet.address = PAYER;
});

/** A buyer who has not connected a wallet: the pay panel offers Connect
 *  Wallet, Pay with Fiat and simulate, and no Authorize at all. */
function disconnect() {
  wallet.connected = false;
  wallet.address = null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExecutionPlan · Authorize and the unverified-reputation banner", () => {
  // Tab goes from the exclusions panel straight to Authorize, past a polite
  // status that was announced once when the plan rendered. The description is
  // how a keyboard buyer still hears it at the moment of paying.
  it("describes Authorize by the banner's summary when a reputation read failed", async () => {
    render(<ExecutionPlan plan={plan({ reputation_degraded: true })} />);
    const describedBy = authorizeButton().getAttribute("aria-describedby");
    expect(describedBy).toBe(UNVERIFIED_SUMMARY_ID);
    // The one sentence, inside the banner — not the banner's four paragraphs.
    const summary = document.getElementById(UNVERIFIED_SUMMARY_ID);
    const banner = document.getElementById(UNVERIFIED_BANNER_ID);
    expect(banner?.contains(summary)).toBe(true);
    await waitFor(() => expect(summary?.textContent).toBe(UNVERIFIED_SUMMARY));
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

describe("ExecutionPlan · every way to pay carries the warning", () => {
  const described = (name: RegExp) =>
    screen.getByRole("button", { name }).getAttribute("aria-describedby");

  // Authorize was the only control described by the warning, so a buyer who
  // paid by fiat, or who had not connected a wallet yet, tabbed onto a pay
  // control that said nothing about the scores being estimates.
  it("describes simulate, fiat and Authorize when a wallet is connected", () => {
    render(<ExecutionPlan plan={plan({ reputation_degraded: true })} />);
    for (const name of [/^simulate$/i, /pay with fiat/i, /authorize/i]) {
      expect(described(name), name.source).toBe(UNVERIFIED_SUMMARY_ID);
    }
  });

  it("describes Connect Wallet, fiat and simulate when no wallet is connected", () => {
    disconnect();
    render(<ExecutionPlan plan={plan({ reputation_degraded: true })} />);
    expect(screen.queryByRole("button", { name: /authorize/i })).toBeNull();
    for (const name of [/connect wallet/i, /pay with fiat/i, /simulate/i]) {
      expect(described(name), name.source).toBe(UNVERIFIED_SUMMARY_ID);
    }
  });

  it("composes both notices on every control of a fallback plan with an unread score", () => {
    disconnect();
    render(
      <ExecutionPlan
        plan={plan({ reputation_degraded: true, planner_fallback: true })}
      />,
    );
    for (const name of [/connect wallet/i, /pay with fiat/i, /simulate/i]) {
      expect(described(name)?.split(" "), name.source).toEqual([
        PLANNER_FALLBACK_NOTICE_ID,
        UNVERIFIED_SUMMARY_ID,
      ]);
    }
  });

  it("leaves every control undescribed when there is nothing to warn about", () => {
    disconnect();
    render(<ExecutionPlan plan={plan()} />);
    for (const name of [/connect wallet/i, /pay with fiat/i, /simulate/i]) {
      expect(described(name), name.source).toBeNull();
    }
  });
});

describe("ExecutionPlan · with no wallet connected", () => {
  it("offers the connect, fiat and simulated paths, and no Authorize", () => {
    disconnect();
    const { container } = render(<ExecutionPlan plan={plan()} />);
    expect(container.textContent).toContain("wallet required");
    expect(
      screen.getByRole("button", { name: /connect wallet/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /simulate/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /authorize/i })).toBeNull();
    expect(container.textContent).not.toContain("authorizing up to");
  });

  it("runs a simulated pass without a wallet", async () => {
    disconnect();
    api.execute.mockResolvedValue({ task_id: "task_sim" });
    render(<ExecutionPlan plan={plan()} />);
    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));
    await waitFor(() => expect(api.execute).toHaveBeenCalledWith("plan_unit"));
    expect(api.buildAuthorize).not.toHaveBeenCalled();
  });
});

describe("ExecutionPlan · the fiat path", () => {
  it.each([
    ["connected", () => {}],
    ["not connected", disconnect],
  ])("opens and closes the peso panel with a wallet %s", (_name, arrange) => {
    arrange();
    const { container } = render(<ExecutionPlan plan={plan()} />);
    expect(container.textContent).not.toMatch(/PDAX/);
    fireEvent.click(screen.getByRole("button", { name: /pay with fiat/i }));
    expect(container.textContent).toMatch(/PDAX/);
    // The quote is priced off the plan's total, whatever the wallet state.
    expect(pdax.pdaxFundingQuote).toHaveBeenCalledWith("0.123");
    fireEvent.click(screen.getByRole("button", { name: /hide fiat/i }));
    expect(container.textContent).not.toMatch(/PDAX/);
  });
});

/** What `POST /orchestrator/execute` rejects with for a plan the backend no
 *  longer holds, shaped as lib/api.ts builds it from the error envelope. */
const planExpired = () =>
  Object.assign(
    new Error(
      "POST /orchestrator/execute → 410 — this plan is too old to execute — build a fresh plan from the same intent and authorise that one",
    ),
    { status: 410, code: "plan_expired" },
  );

describe("ExecutionPlan · a plan that expired before it ran", () => {
  /** Drives the on-chain path to a confirmed authorization whose run is then
   *  refused as expired. */
  async function authorizeExpired(onReplan = vi.fn()) {
    api.buildAuthorize.mockResolvedValue({ xdr: "AAAA" });
    wallet.signXdr.mockResolvedValue("signed-xdr");
    api.submitSigned.mockResolvedValue({
      status: "SUCCESS",
      hash: "a1b2c3",
      return_value: "0123456789abcdef0123456789abcdef",
    });
    api.execute.mockRejectedValue(planExpired());
    const view = render(<ExecutionPlan plan={plan()} onReplan={onReplan} />);
    fireEvent.click(authorizeButton());
    await screen.findByText("This plan was too old to run");
    return { ...view, onReplan };
  }

  // The trap: the buyer has already signed and broadcast by the time the plan
  // is sent to run. The refusal must not read as a payment that failed.
  it("says nothing was charged, never that the payment failed, after a signed authorization", async () => {
    const { container } = await authorizeExpired();
    const text = container.textContent ?? "";
    expect(text).toContain("Nothing was charged");
    expect(text).toContain("The authorization you just signed");
    expect(text).toContain("not drawn on for this plan");
    // The confirmed transaction stays confirmed; no failure card, no raw code.
    expect(text).toContain("transaction confirmed");
    expect(text).not.toMatch(/Transaction failed|410|plan_expired/);
    expect(api.execute).toHaveBeenCalledTimes(1);
  });

  it("offers a fresh plan from the same request, and hands it to the page", async () => {
    const { onReplan } = await authorizeExpired();
    fireEvent.click(
      screen.getByRole("button", { name: /build a fresh plan/i }),
    );
    expect(onReplan).toHaveBeenCalledTimes(1);
  });

  // The plan cannot run again: another signature would draw the same refusal.
  it("stops the controls that run this plan", async () => {
    await authorizeExpired();
    expect(authorizeButton().hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("button", { name: /simulate/i })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(authorizeButton());
    expect(api.buildAuthorize).toHaveBeenCalledTimes(1);
  });

  it("says the same on a simulated pass, without an authorization to explain", async () => {
    api.execute.mockRejectedValue(planExpired());
    const { container } = render(<ExecutionPlan plan={plan()} />);
    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));
    await screen.findByText("This plan was too old to run");
    const text = container.textContent ?? "";
    expect(text).toContain("Nothing was charged");
    expect(text).not.toContain("authorization you just signed");
    expect(text).not.toMatch(/410|plan_expired|POST/);
    // No page to hand a retry to, so no button that would do nothing.
    expect(
      screen.queryByRole("button", { name: /build a fresh plan/i }),
    ).toBeNull();
  });

  // Any other refusal is still a failure, and still says so.
  it("leaves other execute failures on the failure path", async () => {
    api.execute.mockRejectedValue(
      new Error("POST /orchestrator/execute → 503 — capacity exhausted"),
    );
    const { container } = render(<ExecutionPlan plan={plan()} />);
    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));
    await screen.findByText(/capacity exhausted/);
    expect(container.textContent).not.toContain("too old to run");
  });
});

describe("ExecutionPlan · the planner-fallback notice", () => {
  const notice = () => document.getElementById(PLANNER_FALLBACK_NOTICE_ID);

  it("shows the notice on a fallback plan, ahead of Authorize", () => {
    render(<ExecutionPlan plan={plan({ planner_fallback: true })} />);
    const shown = notice();
    expect(shown?.getAttribute("role")).toBe("status");
    // Document order is reading order: the notice has to be met before the
    // button it is about, never after it.
    expect(
      shown!.compareDocumentPosition(authorizeButton()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Absent is an older backend; false is the planner's own plan. Neither is
  // a fallback, and the card must not say otherwise.
  it.each([
    ["the planner built the plan", { planner_fallback: false }],
    ["the backend predates the flag", { planner_fallback: undefined }],
  ])("shows no notice when %s", (_name, over) => {
    render(<ExecutionPlan plan={plan(over)} />);
    expect(notice()).toBeNull();
    expect(screen.queryByText(/built without the planner/i)).toBeNull();
  });

  // The reputation banner keeps its place immediately over the Authorize
  // panel; this notice sits above it.
  it("sits above the reputation banner when both are shown", () => {
    render(
      <ExecutionPlan
        plan={plan({ planner_fallback: true, reputation_degraded: true })}
      />,
    );
    const banner = document.getElementById(UNVERIFIED_BANNER_ID);
    expect(
      notice()!.compareDocumentPosition(banner!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Composed, never overwritten: each notice on the page is named once, in
  // reading order, and nothing absent from the page is named at all — a
  // dangling id describes nothing and fails the accessibility audit.
  it.each([
    [
      "the plan is a fallback",
      { planner_fallback: true },
      [PLANNER_FALLBACK_NOTICE_ID],
    ],
    [
      "a fallback plan also had a failed read",
      { planner_fallback: true, reputation_degraded: true },
      [PLANNER_FALLBACK_NOTICE_ID, UNVERIFIED_SUMMARY_ID],
    ],
    [
      "only a reputation read failed",
      { planner_fallback: false, reputation_degraded: true },
      [UNVERIFIED_SUMMARY_ID],
    ],
  ])(
    "describes Authorize by every notice shown when %s",
    (_name, over, ids) => {
      render(<ExecutionPlan plan={plan(over)} />);
      const describedBy = authorizeButton().getAttribute("aria-describedby");
      expect(describedBy?.split(" ")).toEqual(ids);
      for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
    },
  );

  const retryButton = () =>
    screen.getByRole("button", { name: /ask the planner again/i });

  // Decompose is the page's flow, not the card's, so the card hands the
  // request up rather than calling the API itself.
  it("hands the planner retry to the page", () => {
    const onReplan = vi.fn();
    render(
      <ExecutionPlan
        plan={plan({ planner_fallback: true })}
        onReplan={onReplan}
      />,
    );
    fireEvent.click(retryButton());
    expect(onReplan).toHaveBeenCalledTimes(1);
    expect(api.execute).not.toHaveBeenCalled();
  });

  // A new plan drops this card. With a run for it in flight, that would leave
  // the run going on out of sight, so the retry waits like the card's other
  // actions do.
  it("holds the planner retry while a run for the plan is in flight", async () => {
    api.execute.mockReturnValue(new Promise(() => {}));
    const onReplan = vi.fn();
    render(
      <ExecutionPlan
        plan={plan({ planner_fallback: true })}
        onReplan={onReplan}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /simulate/i }));
    await waitFor(() =>
      expect(retryButton().hasAttribute("disabled")).toBe(true),
    );
    fireEvent.click(retryButton());
    expect(onReplan).not.toHaveBeenCalled();
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
  /** What a screen reader hears from the step's chip: its sr-only words,
   *  found by what they say. The glyphs and figures beside them are hidden. */
  const chipSays = () =>
    screen.getByText(/on-chain reputation|estimate/, { selector: ".sr-only" })
      .textContent ?? "";

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
    expect(chipSays()).toContain("below the 2.75 network floor");
  });

  // Without the bound, the badge would fall back to comparing the headline —
  // the wrong number, which can clear an agent the planner refused or, as
  // here, condemn one on a score routing never used. A backend predating the
  // field gets no verdict at all.
  it("gives no floor verdict when the step carries no lower bound", () => {
    render(<ExecutionPlan plan={plan({ steps: [step({ rep_bps: 5000 })] })} />);
    expect(chipSays()).not.toMatch(/floor/);
  });

  it("clears a step whose lower bound clears the floor", () => {
    render(
      <ExecutionPlan
        plan={plan({
          steps: [step({ rep_bps: 6583, rep_lower_bound_bps: 6024 })],
        })}
      />,
    );
    expect(chipSays()).toContain("clears the 2.75 network floor");
    expect(chipSays()).not.toMatch(/below/);
  });

  // The evidence behind the score, in words a listener gets: how many rated
  // jobs, and how many of them were disputed.
  it("states the rated jobs and the dispute rate behind the score", () => {
    render(
      <ExecutionPlan
        plan={plan({
          steps: [step({ rep_count: 24, rep_dispute_rate_bps: 2500 })],
        })}
      />,
    );
    const label = chipSays();
    expect(label).toContain("from 24 rated jobs");
    expect(label).toContain("25.0% disputed");
  });

  // A prior served because the read failed is not a cold start, and "no
  // on-chain ratings yet" would misstate the agent's record. The step's own
  // flag decides; the plan-wide one stands in only when the step omits it.
  const FAILED_READ = /on-chain read did not come back/;
  const COLD_START = /no on-chain ratings yet/;
  const priorStep = (over: Partial<PlanStep> = {}) =>
    step({ rep_bps: 7000, rep_source: "prior", ...over });

  it.each([
    ["the step's read failed", { rep_degraded: true }, false, FAILED_READ],
    [
      "the step's read held in a plan where another failed",
      { rep_degraded: false },
      true,
      COLD_START,
    ],
    ["only the plan-wide flag is known", {}, true, FAILED_READ],
    ["no read failed anywhere", {}, false, COLD_START],
  ] as const)(
    "words a prior-backed step correctly when %s",
    (_name, stepOver, planDegraded, wording) => {
      render(
        <ExecutionPlan
          plan={plan({
            steps: [priorStep(stepOver)],
            reputation_degraded: planDegraded,
          })}
        />,
      );
      expect(chipSays()).toMatch(wording);
    },
  );
});
