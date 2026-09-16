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
/** The account that signs settlements and owns the platform's batch agent. */
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

/** One charge event; a platform self-payment unless a test says otherwise. */
function entry(over: Partial<SettlementEntry> = {}): SettlementEntry {
  return {
    job_id: "9f2c41a8b7e04d5c8a1b2c3d4e5f6071",
    auth_id: "1a2b3c4d5e6f70819a2b3c4d5e6f7081",
    amount_stroops: 1_610_000,
    ledger: 1_284_551,
    at: "2026-09-12T04:18:33Z",
    payer: PLATFORM,
    self_payment: true,
    exclusion: "settler",
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

/**
 * A StatTile's figure and its unit, read as the two separate elements the
 * component deliberately keeps them in — the split is what stops Card's
 * clip-path from swallowing half a money value, so it is asserted rather than
 * flattened into one string.
 */
function tileFigure(label: string): { value: string; unit: string } {
  const wrapper = screen.getByText(label).parentElement;
  const figure = wrapper?.children[1];
  const unit = figure?.querySelector("span")?.textContent?.trim() ?? "";
  const whole = (figure?.textContent ?? "").trim();
  return { value: whole.slice(0, whole.length - unit.length).trim(), unit };
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

describe("SettlementPanel — a window that ran and found nothing", () => {
  it("scopes an empty window to the retention limit, not to the agent's history", async () => {
    getSettlement.mockResolvedValue(settlement());
    renderPanel();

    await screen.findByText(`No payment has settled to ${AGENT}.`);
    const text = visibleText();
    expect(text).toContain(
      "The escrow recorded no charge against this agent in the last 7 days",
    );
    expect(text).toContain(
      "Soroban RPC keeps 7 days of contract events and drops everything older",
    );
    // The sentence the whole state exists for: an empty log is a statement
    // about seven days, never about everything the agent has ever done.
    expect(text).toContain("not about the agent's whole history");

    // A measured zero is shown, unlike the failure states above.
    expect(tileFigure("settled revenue")).toEqual({
      value: "0.0",
      unit: "XLM",
    });
  });

  it("attributes the absence to the escrow defect, not to demand for the agent", async () => {
    getSettlement.mockResolvedValue(settlement());
    renderPanel();

    const heading = await screen.findByRole("heading", {
      name: "Why nothing settles",
    });
    expect(heading.tagName).toBe("H3");

    const text = visibleText();
    expect(text).toContain(
      "The escrow's charge path cannot move a customer's funds",
    );
    expect(text).toContain(
      "That transfer fails without failing the run — the run still finalizes as complete",
    );
    expect(text).toContain(
      "It is not a measure of your agent, and not a signal about demand for it",
    );
  });

  it("never promises a payment that is going to arrive later", async () => {
    getSettlement.mockResolvedValue(settlement());
    renderPanel();

    await screen.findByText(`No payment has settled to ${AGENT}.`);
    // Consolation of that shape would be an invention: nobody can say this
    // agent gets paid once the contract is fixed, so nothing may imply it.
    expect(visibleText()).not.toMatch(
      /will be paid|paid later|once (this|the|it)[^.]*fixed|coming soon|pending payment/i,
    );
  });

  it("takes the unit from the payload instead of naming a currency", async () => {
    getSettlement.mockResolvedValue(settlement());
    renderPanel();

    await screen.findByText("settled revenue");
    const text = visibleText();
    // Testnet's SAC wraps the native asset, so this figure is XLM. "USDC"
    // here would be a fabricated currency on a money figure.
    expect(text).not.toContain("USDC");
    expect(text).toContain(
      "the escrow's token wraps this chain's native asset",
    );
    expect(tileFigure("excluded self-payments")).toEqual({
      value: "0.0",
      unit: "XLM",
    });
  });

  it("follows the payload when the escrow wraps something other than the native asset", async () => {
    getSettlement.mockResolvedValue(
      settlement({ asset: "usdc", total_stroops: 25_000_000 }),
    );
    renderPanel();

    await screen.findByText("settled revenue");
    expect(tileFigure("settled revenue")).toEqual({
      value: "2.5",
      unit: "USDC",
    });
    expect(visibleText()).not.toContain("native asset");
  });
});

describe("SettlementPanel — a charge paid by the platform to itself", () => {
  const selfPaid = () =>
    settlement({
      entries: [entry()],
      total_stroops: 0,
      self_payment_stroops: 1_610_000,
    });

  it("narrows the claim to customer payment when a charge does exist", async () => {
    getSettlement.mockResolvedValue(selfPaid());
    renderPanel();

    // A charge did settle on-chain here, so the blunt "no payment settled"
    // would be false; only the customer half of it is zero.
    await screen.findByText(`No customer payment has settled to ${AGENT}.`);
    expect(visibleText()).toContain(
      "The charges below are the only ones in the last 7 days, and none of them is a customer paying for work",
    );
  });

  it("shows the self-payment, labels it in words, and keeps it out of revenue", async () => {
    getSettlement.mockResolvedValue(selfPaid());
    renderPanel();

    await screen.findByText("settled revenue");
    // Revenue excludes it; the excluded figure is reported next to it rather
    // than dropped, which is the difference between excluding and hiding.
    expect(tileFigure("settled revenue")).toEqual({
      value: "0.0",
      unit: "XLM",
    });
    expect(tileFigure("excluded self-payments")).toEqual({
      value: "0.161",
      unit: "XLM",
    });
    expect(tileFigure("charged events")).toEqual({ value: "1", unit: "" });

    const text = visibleText();
    // The label carries its meaning in words, not in the magenta alone.
    expect(text).toContain("self-payment · excluded");
    expect(text).toContain(
      "The payer on this charge resolves to the platform's own settler",
    );
    expect(text).toContain("it moved platform funds to the platform");
    expect(text).toContain("0.161 XLM");
  });

  it("links the payer to the explorer so the claim can be checked", async () => {
    getSettlement.mockResolvedValue(selfPaid());
    renderPanel();

    const link = await screen.findByRole("link");
    // "trust us, it was us" is not evidence; the address has to be verifiable.
    expect(link.getAttribute("href")).toBe(
      `https://stellar.expert/explorer/testnet/account/${PLATFORM}`,
    );
    expect(visibleText()).toContain(PLATFORM);
  });

  it("names a missing close time instead of printing Invalid Date", async () => {
    getSettlement.mockResolvedValue(
      settlement({
        entries: [entry({ at: null })],
        self_payment_stroops: 1_610_000,
      }),
    );
    renderPanel();

    await screen.findByText("settled revenue");
    expect(visibleText()).toContain("not reported by the rpc");
    expect(visibleText()).not.toContain("Invalid Date");
  });
});

describe("SettlementPanel — a charge a customer actually paid", () => {
  it("counts it as revenue and drops the defect explanation", async () => {
    getSettlement.mockResolvedValue(
      settlement({
        entries: [
          entry({
            payer: CUSTOMER,
            self_payment: false,
            amount_stroops: 25_000_000,
          }),
        ],
        total_stroops: 25_000_000,
      }),
    );
    renderPanel();

    await screen.findByText("settled revenue");
    expect(tileFigure("settled revenue")).toEqual({
      value: "2.5",
      unit: "XLM",
    });
    expect(visibleText()).toContain("customer payment");

    // An agent with real revenue is not living under the charge defect, and a
    // standing contract-bug essay over a working figure would be noise.
    expect(
      screen.queryByRole("heading", { name: "Why nothing settles" }),
    ).toBeNull();
    expect(visibleText()).not.toContain("has settled to");
  });
});

describe("SettlementPanel — a scan that stopped early", () => {
  it("calls a truncated scan a floor rather than a total", async () => {
    getSettlement.mockResolvedValue(settlement({ truncated: true }));
    renderPanel();

    await screen.findByText("settled revenue");
    const text = visibleText();
    expect(text).toContain(
      "The scan stopped at its page limit before it reached the end of the 7-day window",
    );
    expect(text).toContain("Every figure below is a floor rather than a total");
    expect(text).toContain("stopped at the page cap");
  });

  it("puts the caveat above the figures it weakens", async () => {
    getSettlement.mockResolvedValue(settlement({ truncated: true }));
    renderPanel();

    const label = await screen.findByText("settled revenue");
    const caveat = screen.getByText(/Every figure below is a floor/);
    // An operator who meets the caveat after the numbers has already drawn
    // the conclusion, so DOM order is part of the claim.
    expect(
      caveat.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("SettlementPanel — structure", () => {
  it("names the panel with a heading its section points at", async () => {
    getSettlement.mockResolvedValue(settlement());
    const { container } = renderPanel();

    const heading = await screen.findByRole("heading", { name: "Settlement" });
    // h2 under the page's h1: the panel owns its level so several of these can
    // sit on one dashboard without skipping a heading level.
    expect(heading.tagName).toBe("H2");
    expect(
      container.querySelector("section")?.getAttribute("aria-labelledby"),
    ).toBe(heading.id);
  });

  it("re-reads the chain on demand through a keyboard-reachable control", async () => {
    getSettlement.mockResolvedValue(settlement());
    renderPanel();

    const button = await screen.findByRole("button", { name: /re-scan/i });
    // The shared inset ring — the cyber clip-paths eat an offset one, so a
    // hand-rolled focus style here would leave the control invisible to a
    // keyboard user.
    expect(button.className).toContain("focus-visible:ring-inset");

    fireEvent.click(button);
    await waitFor(() => expect(getSettlement).toHaveBeenCalledTimes(2));
  });
});
