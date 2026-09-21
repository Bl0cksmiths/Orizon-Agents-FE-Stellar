// @vitest-environment jsdom
/**
 * Unit tests for ReceiptPanel — story 4.05's acceptance criteria, one state
 * at a time.
 *
 * The panel decides nothing: disputeView() hands it a finished view model and
 * these tests hand it the same. What they pin is what each decided state
 * SHOWS — above all that an action appears exactly where the view says one
 * exists, and that a viewer who did not pay is offered nothing at all.
 *
 * Amounts and countdowns are compared against lib/disputes' own formatters
 * rather than literal strings, so a formatting change there is not a failure
 * here.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { formatAge } from "@/components/ui/stale-badge";
import { formatRemaining, formatUsdc } from "@/lib/disputes";
import type {
  CreditPolicy,
  Dispute,
  DisputeArtifact,
  DisputePanelView,
  DisputeReceiptView,
  DisputeViewer,
  SettlementStepView,
  StepDisputeState,
} from "@/lib/types";
import { ReceiptPanel } from "./receipt-panel";
import { WindowState, formatLocalTime } from "./window-state";

afterEach(cleanup);

type SettledView = Extract<DisputePanelView, { kind: "settled" }>;

const HOUR = 3_600_000;
const SETTLED_AT = Date.UTC(2026, 8, 21, 10, 0, 0);
const CLOSES_AT = SETTLED_AT + 24 * HOUR;
const PAYER = "GBUYERXQ7DKMSZ4CAG2YV6WBXK3QHTRNPL5OIJEZAFUGDVCWMSRTYBYR";
const CHARGE_TX = "a".repeat(64);
const PROOF_TX = "b".repeat(64);

function step(
  index: number,
  over: Partial<SettlementStepView> = {},
): SettlementStepView {
  return {
    step_index: index,
    agent_id: `agt_${index}`,
    agent_name: `Agent ${index}`,
    price_usdc: 0.054,
    delivered: true,
    creditable_usdc: 0.027,
    output_summary: null,
    ...over,
  };
}

function dispute(over: Partial<Dispute> = {}): Dispute {
  return {
    id: "dsp_1",
    job_id_hex: "c".repeat(64),
    task_id: "task_1",
    step_index: 0,
    agent_id: "agt_0",
    payer: PAYER,
    reason: "The summary missed the second half of the brief.",
    status: "open",
    charged_usdc: 0.054,
    creditable_usdc: 0.027,
    opened_at: SETTLED_AT / 1000 + 60,
    resolved_at: null,
    refund_tx: null,
    rating_tx: null,
    ...over,
  };
}

/** The one policy every fixture in this file is settled under. */
const POLICY: CreditPolicy = {
  credited_fraction: 0.5,
  funded_by: "platform",
  adjudicated_by: "platform",
};

/**
 * The receipt disputeView() derives for a dispute, rebuilt by the same rules
 * so no fixture pairs a dispute with a receipt the data could never produce:
 * the refund confirmed only once credited with its hash, the rating only when
 * the ledger vouched for it, the settled figure final only beside a confirmed
 * refund, and both reasons for the payer alone. `over` is for a test that
 * pins one field on purpose.
 */
function receiptFor(
  d: Dispute,
  viewer: DisputeViewer = "payer",
  over: Partial<DisputeReceiptView> = {},
): DisputeReceiptView {
  const refundTx = d.refund_tx || null;
  let refund: DisputeArtifact = { txHash: null, state: "none" };
  if (d.status === "credited") {
    refund = refundTx
      ? { txHash: refundTx, state: "confirmed" }
      : { txHash: null, state: "pending" };
  } else if (d.status === "crediting") {
    refund = { txHash: refundTx, state: "pending" };
  } else if (d.status === "upheld") {
    refund = { txHash: null, state: "pending" };
  }
  const rating: DisputeArtifact = d.rating_tx
    ? {
        txHash: d.rating_tx,
        state: d.rating_confirmed === true ? "confirmed" : "pending",
      }
    : { txHash: null, state: "none" };
  const payer = viewer === "payer";
  return {
    status: d.status,
    openedAtMs: d.opened_at * 1000,
    lastChangedAtMs: (d.updated_at ?? d.resolved_at ?? d.opened_at) * 1000,
    amount:
      refund.state === "confirmed" && typeof d.credited_usdc === "number"
        ? { usdc: d.credited_usdc, final: true }
        : { usdc: d.creditable_usdc, final: false },
    fundedBy: "platform",
    refund,
    rating,
    reason: payer ? d.reason : null,
    rejectionReason:
      payer && d.status === "rejected" && d.rejection_reason?.trim()
        ? d.rejection_reason
        : null,
    ...over,
  };
}

/**
 * A disputed step's state as disputeView() hands it to the panel for this
 * viewer: the buyer's words kept for the payer and blanked for anyone else,
 * and the receipt derived alongside.
 */
function disputed(
  d: Dispute,
  viewer: DisputeViewer = "payer",
): StepDisputeState {
  const payer = viewer === "payer";
  const state = {
    kind: "disputed" as const,
    dispute: payer ? d : { ...d, reason: "", rejection_reason: null },
    showReason: payer,
    receipt: receiptFor(d, viewer),
  };
  return state;
}

/** A settled view one hour into a 24-hour window, the payer looking. */
function settled(
  rows: { step: SettlementStepView; state: StepDisputeState }[],
  over: Partial<SettledView> = {},
): SettledView {
  return {
    kind: "settled",
    viewer: "payer",
    window: {
      open: true,
      closesAtMs: CLOSES_AT,
      remainingMs: 23 * HOUR,
    },
    jobIdHex: "c".repeat(64),
    payer: PAYER,
    settledAtMs: SETTLED_AT,
    settledUsdc: 0.162,
    chargeTx: CHARGE_TX,
    proofTx: PROOF_TX,
    policy: POLICY,
    steps: rows,
    ...over,
  };
}

const CLOSED = { open: false, closesAtMs: CLOSES_AT, remainingMs: 0 };

function renderPanel(view: DisputePanelView) {
  const onDispute = vi.fn();
  const onConnect = vi.fn();
  const utils = render(
    <ReceiptPanel view={view} onDispute={onDispute} onConnect={onConnect} />,
  );
  return { ...utils, onDispute, onConnect };
}

function text(): string {
  return document.body.textContent ?? "";
}

/** Every button whose name or text offers to dispute or to connect. */
function actionButtons(): HTMLElement[] {
  return screen
    .queryAllByRole("button")
    .filter((b) =>
      /dispute|connect/i.test(
        `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`,
      ),
    );
}

describe("ReceiptPanel — hidden", () => {
  it("renders nothing at all", () => {
    const { container } = renderPanel({ kind: "hidden" });
    expect(container.innerHTML).toBe("");
  });
});

describe("ReceiptPanel — not settled", () => {
  it("says disputes open once a running workflow settles", () => {
    renderPanel({ kind: "not_settled", running: true });
    expect(screen.getByRole("heading", { name: "Receipt" })).toBeTruthy();
    expect(text()).toContain("once this workflow settles");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("says nothing was charged when a finished workflow never settled", () => {
    renderPanel({ kind: "not_settled", running: false });
    expect(text()).toContain(
      "Nothing on this workflow was charged, so there is nothing to dispute.",
    );
    expect(text()).not.toContain("once this workflow settles");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("ReceiptPanel — the settled header", () => {
  it("shows the receipt heading, age, total and both transactions", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "disputable" } }]));

    expect(screen.getByRole("heading", { name: "Receipt" })).toBeTruthy();
    // One hour in, on the server's clock the view carries.
    expect(text()).toContain("Settled 1h ago");
    expect(text()).toContain(formatUsdc(0.162));

    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.endsWith(`/tx/${CHARGE_TX}`))).toBe(true);
    expect(hrefs.some((h) => h.endsWith(`/tx/${PROOF_TX}`))).toBe(true);
    expect(hrefs.some((h) => h.endsWith(`/account/${PAYER}`))).toBe(true);
  });

  it("names a transaction that was not recorded instead of dropping it", () => {
    renderPanel(settled([], { chargeTx: null, proofTx: null }));
    expect(text()).toContain("not recorded");
    const txLinks = screen
      .getAllByRole("link")
      .filter((a) => (a.getAttribute("href") ?? "").includes("/tx/"));
    expect(txLinks).toHaveLength(0);
  });
});

describe("ReceiptPanel — the step list", () => {
  it("lists each step with its number, agent and price", () => {
    renderPanel(
      settled([
        { step: step(0), state: { kind: "view_only" } },
        {
          step: step(1, { agent_name: null, price_usdc: 0.108 }),
          state: { kind: "view_only" },
        },
      ]),
    );

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Step 1");
    expect(items[0].textContent).toContain("Agent 0");
    expect(items[0].textContent).toContain(formatUsdc(0.054));
    // No registered name: the agent id stands in for it.
    expect(items[1].textContent).toContain("Step 2");
    expect(items[1].textContent).toContain("agt_1");
    expect(items[1].textContent).toContain(formatUsdc(0.108));
  });

  it("offers a Dispute button that hands back the right step", () => {
    const second = step(1, { agent_name: "Code Critic" });
    const { onDispute } = renderPanel(
      settled([
        { step: step(0), state: { kind: "disputable" } },
        { step: second, state: { kind: "disputable" } },
      ]),
    );

    const button = screen.getByRole("button", {
      name: /^Dispute step 2, Code Critic$/,
    });
    fireEvent.click(button);
    expect(onDispute).toHaveBeenCalledTimes(1);
    expect(onDispute).toHaveBeenCalledWith(second);
  });

  it("shows what an upheld dispute would credit next to the action", () => {
    renderPanel(
      settled([
        {
          step: step(0, { creditable_usdc: 0.027 }),
          state: { kind: "disputable" },
        },
      ]),
    );
    expect(text()).toContain(`credits ${formatUsdc(0.027)} if upheld`);
  });

  it("shows a disputed step's status and never a second Dispute button", () => {
    renderPanel(
      settled([
        {
          step: step(0),
          state: disputed(dispute({ status: "crediting" })),
        },
      ]),
    );
    expect(text()).toContain("Refund in progress");
    expect(actionButtons()).toHaveLength(0);
  });

  it("shows the buyer's own reason to the payer and nobody else", () => {
    const reason = "The summary missed the second half of the brief.";
    const row = (viewer: DisputeViewer) =>
      settled(
        [{ step: step(0), state: disputed(dispute({ reason }), viewer) }],
        { viewer },
      );

    renderPanel(row("payer"));
    expect(text()).toContain(reason);
    expect(text()).toMatch(/your reason/i);
    cleanup();

    renderPanel(row("other"));
    expect(text()).not.toContain(reason);
    expect(text()).not.toMatch(/your reason/i);
  });

  it("links a credited dispute's refund transaction", () => {
    const refund = "d".repeat(64);
    renderPanel(
      settled([
        {
          step: step(0),
          state: disputed(dispute({ status: "credited", refund_tx: refund })),
        },
      ]),
    );
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.endsWith(`/tx/${refund}`))).toBe(true);
  });

  it("explains a step that was never charged and offers nothing", () => {
    renderPanel(
      settled([
        {
          step: step(0, { delivered: false, creditable_usdc: 0 }),
          state: { kind: "not_charged" },
        },
      ]),
    );
    const item = screen.getByRole("listitem");
    expect(item.textContent).toContain(
      "Nothing was charged for this step, so there is nothing to dispute.",
    );
    // Not every uncharged step failed: the line must not claim a cause.
    expect(item.textContent).not.toContain("did not deliver");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers nothing on a step whose window has closed", () => {
    renderPanel(
      settled([{ step: step(0), state: { kind: "window_closed" } }], {
        window: CLOSED,
      }),
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // The window state says why, once, above the list.
    expect(text()).toContain("Dispute window closed");
  });

  it("renders a view-only step with no control, no hint, nothing", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "view_only" } }]));
    const item = screen.getByRole("listitem");
    expect(item.querySelectorAll("button")).toHaveLength(0);
    expect(item.textContent ?? "").not.toMatch(/dispute/i);
  });
});

describe("ReceiptPanel — a disputed step's receipt", () => {
  const REFUND = "d".repeat(64);
  const RATING = "e".repeat(64);
  const RESOLVED_AT = SETTLED_AT / 1000 + 1_800;
  // Credited with a figure deliberately unlike the promise (0.027), so a
  // receipt printing the promise could not pass for one printing the payment.
  const credited = dispute({
    status: "credited",
    refund_tx: REFUND,
    rating_tx: RATING,
    rating_confirmed: true,
    credited_usdc: 0.0265,
    resolved_at: RESOLVED_AT,
    updated_at: RESOLVED_AT,
  });

  it("draws the receipt in the disputed step's row, with no dispute button", () => {
    renderPanel(
      settled([
        {
          step: step(0, { agent_name: "Code Critic" }),
          state: disputed(credited),
        },
        { step: step(1), state: { kind: "disputable" } },
      ]),
    );
    const [row, other] = screen.getAllByRole("listitem");

    const receipt = within(row).getByRole("group", {
      name: "Dispute receipt, Code Critic",
    });
    expect(receipt.textContent).toContain("Refunded");
    expect(receipt.textContent).toContain(
      `${formatUsdc(0.0265)} credited to your wallet — funded by the platform, not clawed back from the agent.`,
    );
    const hrefs = within(receipt)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toEqual([
      expect.stringMatching(new RegExp(`/tx/${REFUND}$`)),
      expect.stringMatching(new RegExp(`/tx/${RATING}$`)),
    ]);

    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    // The status is said once in the row — by the receipt, not a second badge.
    expect(row.textContent?.match(/Dispute status:/g)).toHaveLength(1);
    // The other settled step is still the buyer's to dispute.
    expect(
      within(other).getByRole("button", { name: /^Dispute step 2/ }),
    ).toBeTruthy();
  });

  it("dates the receipt on the panel's server clock, not the device's", () => {
    renderPanel(settled([{ step: step(0), state: disputed(dispute()) }]));
    // Raised a minute after settlement; the view is an hour in, so on the
    // server's clock the dispute is 59 minutes old — whatever this machine's
    // own clock says.
    const openedAt = new Date(SETTLED_AT + 60_000).toISOString();
    const raised = document.querySelector(`time[datetime="${openedAt}"]`);
    expect(raised?.parentElement?.textContent).toContain(
      formatAge(HOUR - 60_000),
    );
  });

  it("speaks to a non-payer as an onlooker, and never with the buyer's words", () => {
    renderPanel(
      settled([{ step: step(0), state: disputed(credited, "other") }], {
        viewer: "other",
      }),
    );
    const receipt = screen.getByRole("group", { name: /dispute receipt/i });
    expect(receipt.textContent).toContain("credited to the payer's wallet");
    expect(receipt.textContent).not.toMatch(/\byour?\b/i);
    expect(text()).not.toContain(credited.reason);
  });
});

describe("ReceiptPanel — who is looking", () => {
  const rows = [{ step: step(0), state: { kind: "view_only" } as const }];
  const PROMPT =
    "If you paid for this workflow, connect that wallet to dispute a step.";

  it("asks an anonymous viewer to connect the paying wallet", () => {
    const { onConnect } = renderPanel(settled(rows, { viewer: "anonymous" }));
    expect(text()).toContain(PROMPT);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(onConnect).toHaveBeenCalledTimes(1);
    // Connecting is the only thing on offer: no step can be disputed yet.
    expect(screen.queryAllByRole("button", { name: /dispute/i })).toHaveLength(
      0,
    );
  });

  it("does not prompt an anonymous viewer once the window has closed", () => {
    renderPanel(
      settled([{ step: step(0), state: { kind: "window_closed" } }], {
        viewer: "anonymous",
        window: CLOSED,
      }),
    );
    expect(text()).not.toContain(PROMPT);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("never shows the connect prompt to the payer", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "disputable" } }]));
    expect(text()).not.toContain(PROMPT);
    expect(screen.queryAllByRole("button", { name: /connect/i })).toHaveLength(
      0,
    );
  });

  // The rule the story is built around: a wallet that did not pay sees the
  // receipt and nothing else — no button, no disabled button, no prompt.
  it("gives a connected non-payer no dispute or connect affordance", () => {
    renderPanel(
      settled(
        [
          { step: step(0), state: { kind: "view_only" } },
          {
            step: step(1),
            state: disputed(dispute({ step_index: 1 }), "other"),
          },
          {
            step: step(2, { delivered: false }),
            state: { kind: "not_charged" },
          },
        ],
        { viewer: "other" },
      ),
    );
    expect(actionButtons()).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("button, [role='button']")).toHaveLength(
      0,
    );
    expect(text()).not.toContain(PROMPT);
    expect(text()).not.toContain("terms");
  });

  it.each<DisputeViewer>(["other", "anonymous"])(
    "offers a %s viewer no Dispute button",
    (viewer) => {
      renderPanel(settled(rows, { viewer }));
      expect(
        screen.queryAllByRole("button", { name: /dispute/i }),
      ).toHaveLength(0);
    },
  );
});

describe("ReceiptPanel — the terms", () => {
  it("states the policy in force beside the action", () => {
    renderPanel(
      settled([{ step: step(0), state: { kind: "disputable" } }], {
        policy: {
          credited_fraction: 0.25,
          funded_by: "platform",
          adjudicated_by: "platform",
        },
      }),
    );
    expect(text()).toContain("credits 25% of that step's charge");
    expect(text()).toContain("never clawed back from the agent");
    expect(text()).toContain("The platform decides each dispute");
  });

  it("leaves the terms out when there is nothing to act on", () => {
    renderPanel(
      settled([
        {
          step: step(0),
          state: disputed(dispute()),
        },
      ]),
    );
    expect(text()).not.toContain("upheld dispute credits");
  });
});

describe("ReceiptPanel — structure", () => {
  it("is a region named by its heading", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "view_only" } }]));
    const region = screen.getByRole("region", { name: "Receipt" });
    expect(region.querySelector("h2")?.textContent).toBe("Receipt");
    expect(region.querySelector("ol")).not.toBeNull();
  });
});

describe("WindowState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const FOUR_MIN = 4 * 60_000 + 12_000;

  function open(remainingMs: number) {
    return { open: true, closesAtMs: CLOSES_AT, remainingMs };
  }

  it("shows an open window's countdown and its closing time", () => {
    const { container } = render(
      <WindowState window={open(FOUR_MIN)} settledAtMs={SETTLED_AT} />,
    );
    expect(container.textContent).toContain("Dispute window open");
    expect(container.textContent).toContain(formatRemaining(FOUR_MIN));
    expect(container.textContent).toContain(formatLocalTime(CLOSES_AT));
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      new Date(CLOSES_AT).toISOString(),
    );
  });

  it("shows when a closed window closed, in local time", () => {
    const { container } = render(
      <WindowState window={CLOSED} settledAtMs={SETTLED_AT} />,
    );
    expect(container.textContent).toContain("Dispute window closed");
    expect(container.textContent).toContain(formatLocalTime(CLOSES_AT));
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      new Date(CLOSES_AT).toISOString(),
    );
    expect(container.textContent).not.toContain("left");
  });

  // A screen reader must not hear the countdown on every tick. It sits in an
  // aria-live="off" span; what is announced is a summary naming the absolute
  // time, which does not change as the page's clock re-derives the view.
  it("keeps the countdown out of the announced summary", () => {
    const { container, rerender } = render(
      <WindowState window={open(FOUR_MIN)} settledAtMs={SETTLED_AT} />,
    );

    const countdown = container.querySelector("[aria-live='off']");
    expect(countdown?.textContent).toBe(formatRemaining(FOUR_MIN));

    const status = screen.getByRole("status");
    const summary = status.textContent;
    expect(summary).toContain(formatLocalTime(CLOSES_AT));
    expect(summary).not.toContain(formatRemaining(FOUR_MIN));
    expect(status.contains(countdown)).toBe(false);

    // The page's clock ticks: a new view, five seconds on.
    rerender(
      <WindowState window={open(FOUR_MIN - 5_000)} settledAtMs={SETTLED_AT} />,
    );
    expect(countdown?.textContent).toBe(formatRemaining(FOUR_MIN - 5_000));
    expect(screen.getByRole("status").textContent).toBe(summary);
  });

  // One clock, and it is the page's. Time passing changes nothing here until
  // the view does — including the window closing, which is disputeView()'s
  // call and never this component's.
  it("renders the time it is given and keeps no clock of its own", async () => {
    vi.useFakeTimers();
    const { container } = render(
      <WindowState window={open(2_000)} settledAtMs={SETTLED_AT} />,
    );
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(container.textContent).toContain("Dispute window open");
    expect(container.querySelector("[aria-live='off']")?.textContent).toBe(
      formatRemaining(2_000),
    );
  });

  // The summary is the same node in both states, so its text changing in
  // place is what a screen reader hears when the window closes.
  it("announces the close through the same status node", () => {
    const { rerender } = render(
      <WindowState window={open(FOUR_MIN)} settledAtMs={SETTLED_AT} />,
    );
    const before = screen.getByRole("status");
    rerender(<WindowState window={CLOSED} settledAtMs={SETTLED_AT} />);
    const after = screen.getByRole("status");
    expect(after).toBe(before);
    expect(after.textContent).toContain("closed");
  });
});
