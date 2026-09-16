// @vitest-environment jsdom
/**
 * Unit tests for SettlementPanel.
 *
 * This panel reports money, so the tests are mostly about what it must NOT
 * say. Every one of its states can degrade into the same lie — a zero — and a
 * zero is the one figure an operator will act on without checking: a failed
 * lookup rendered as "0 XLM earned", a scan that never ran rendered as "0 XLM
 * earned", a self-payment counted as revenue. Each of those is asserted
 * against directly rather than only asserting the happy wording.
 *
 * The other half is the copy itself, which is load-bearing and therefore
 * pinned: that an empty window is scoped to the retention window instead of
 * the agent's history, that the absence is attributed to the escrow defect
 * rather than to demand for the agent, and that nothing anywhere promises a
 * payment that is going to arrive later.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { AgentSettlement, SettlementEntry } from "@/lib/types";

// Hoisted: the vi.mock factory runs before module-scope consts exist.
const { getSettlement } = vi.hoisted(() => ({ getSettlement: vi.fn() }));
vi.mock("@/lib/api", () => ({ getSettlement }));

import { SettlementPanel } from "./settlement-panel";

const AGENT = "weather_bot";
const PLATFORM = "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEPLATFORMXXXX";
const CUSTOMER = "GBUYER4H6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLECUSTOMERXXXX";

/**
 * A rejection useFetch will NOT retry on its own (see isTransientFetchError):
 * a transient message schedules a background retry and the assertions would
 * then race the timer.
 */
const HARD_FAILURE = "malformed response from /stellar/settlement";

function settlement(over: Partial<AgentSettlement> = {}): AgentSettlement {
  return {
    agent_id: AGENT,
    asset: "native",
    window_days: 7,
    scanned_ledgers: 120_960,
    entries: [],
    total_stroops: 0,
    self_payment_stroops: 0,
    truncated: false,
    unavailable: null,
    ...over,
  };
}

function entry(over: Partial<SettlementEntry> = {}): SettlementEntry {
  return {
    job_id: "9f2c41a8b7e04d5c8a1b2c3d4e5f6071",
    auth_id: "1a2b3c4d5e6f70819a2b3c4d5e6f7081",
    amount_stroops: 1_610_000,
    ledger: 1_284_551,
    at: "2026-09-12T04:18:33Z",
    payer: PLATFORM,
    self_payment: true,
    ...over,
  };
}

function renderPanel() {
  return render(<SettlementPanel agentId={AGENT} agentName={AGENT} />);
}

/** Everything the user can read, whitespace-normalized for substring checks. */
function visibleText(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

afterEach(() => {
  cleanup();
  getSettlement.mockReset();
});

describe("SettlementPanel — before an answer arrives", () => {
  it("announces the read and shows no figure while the lookup is in flight", () => {
    getSettlement.mockReturnValue(new Promise(() => {}));
    renderPanel();

    expect(screen.getByRole("status").textContent).toContain(
      `Reading settlement for ${AGENT}`,
    );
    // The whole point: nothing numeric, and above all no unit-bearing zero.
    expect(visibleText()).not.toContain("XLM");
    expect(screen.queryByText("settled revenue")).toBeNull();
  });

  it("renders a failed lookup as a failure, never as a zero", async () => {
    getSettlement.mockRejectedValue(new Error(HARD_FAILURE));
    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      `Settlement could not be loaded for ${AGENT}`,
    );
    expect(alert.textContent).toContain("failed lookup, not a zero");
    // The backend's own words are passed through, not swallowed.
    expect(alert.textContent).toContain(HARD_FAILURE);

    expect(visibleText()).not.toContain("XLM");
    expect(screen.queryByText("settled revenue")).toBeNull();
    expect(screen.queryByText("excluded self-payments")).toBeNull();
  });

  it("recovers from a failed lookup when the operator retries", async () => {
    getSettlement.mockRejectedValueOnce(new Error(HARD_FAILURE));
    getSettlement.mockResolvedValueOnce(settlement());
    renderPanel();

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await screen.findByText("settled revenue");
    expect(getSettlement).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SettlementPanel — a scan that could not run", () => {
  it("reports an unavailable scan as a missing reading rather than a zero", async () => {
    getSettlement.mockResolvedValue(
      settlement({ unavailable: "soroban rpc unreachable" }),
    );
    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The settlement scan could not run");
    expect(alert.textContent).toContain("a missing reading, not a zero");
    expect(alert.textContent).toContain("soroban rpc unreachable");

    // `total_stroops` is a default in this payload, so no figure may be drawn
    // from it — this is the assertion that catches the tempting bug.
    expect(screen.queryByText("settled revenue")).toBeNull();
    expect(visibleText()).not.toContain("0.0 XLM");
    expect(visibleText()).toContain(
      "A scan that never ran and a scan that ran and found nothing are different results",
    );
  });

  it("dates the reading as stale instead of presenting it as live when a re-scan fails", async () => {
    getSettlement.mockResolvedValueOnce(
      settlement({ unavailable: "soroban rpc unreachable" }),
    );
    getSettlement.mockRejectedValueOnce(new Error(HARD_FAILURE));
    renderPanel();

    await screen.findByText(/The settlement scan could not run/);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((a) =>
            (a.textContent ?? "").includes(
              `Settlement could not be refreshed for ${AGENT}`,
            ),
          ),
      ).toBe(true);
    });
    // StaleBadge is a polite status, and it only renders once something has
    // actually loaded — its presence is the proof the panel knows the reading
    // on screen is frozen rather than current.
    expect(screen.getByRole("status").textContent).toContain("stale");
    expect(visibleText()).toContain("the last reading that succeeded");
  });
});
