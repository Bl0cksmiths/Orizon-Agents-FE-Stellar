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

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import { formatAge } from "@/components/ui/stale-badge";
import { disputeReceipt, formatAmount, formatRemaining } from "@/lib/disputes";
import type {
  CreditPolicy,
  Dispute,
  DisputePanelView,
  DisputeReceiptView,
  DisputeViewer,
  SettlementStepView,
  StepDisputeState,
} from "@/lib/types";
import type { EscrowGeneration } from "@/lib/escrow-generation";
import type { ReasonUnlockStatus } from "@/lib/use-reason-unlock";
import { AmountAssetProvider } from "./amount-asset";
import { ReceiptPanel } from "./receipt-panel";
import { WindowState } from "./window-state";

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
 * The receipt disputeView() derives for a dispute — by calling the very
 * function it calls, so no fixture here can pair a dispute with a receipt the
 * data layer would never produce, and a change to those rules reaches these
 * tests instead of drifting past a hand-kept copy. `over` is for a test that
 * pins one field on purpose.
 */
function receiptFor(
  d: Dispute,
  viewer: DisputeViewer = "payer",
  over: Partial<DisputeReceiptView> = {},
): DisputeReceiptView {
  return { ...disputeReceipt(d, viewer, POLICY), ...over };
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
  rows: SettledView["steps"],
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
    reasonsWithheld: false,
    ...over,
  };
}

const CLOSED = { open: false, closesAtMs: CLOSES_AT, remainingMs: 0 };

/** Testnet, where the escrow's SAC wraps the native asset: amounts are XLM. */
function Testnet({ children }: { children: ReactNode }) {
  return <AmountAssetProvider asset="native">{children}</AmountAssetProvider>;
}

/** An amount as the panel prints it on testnet. */
const xlm = (n: number) => formatAmount(n, "native");

/** Rendered on escrow v2 unless a test names the escrow it is about. */
function renderPanel(
  view: DisputePanelView,
  escrowGeneration: EscrowGeneration = "v2",
) {
  const onDispute = vi.fn();
  const onConnect = vi.fn();
  const utils = render(
    <ReceiptPanel
      view={view}
      onDispute={onDispute}
      onConnect={onConnect}
      escrowGeneration={escrowGeneration}
    />,
    { wrapper: Testnet },
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

  // Hedged to what the panel knows: no charge ON RECORD, never "nothing was
  // charged", which a lost record or a late one would make false.
  it("says no charge is on record when a finished workflow never settled", () => {
    renderPanel({ kind: "not_settled", running: false });
    expect(text()).toContain(
      "No charge is on record for this workflow, so there is nothing to dispute.",
    );
    expect(text()).not.toContain("was charged");
    expect(text()).not.toContain("once this workflow settles");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("ReceiptPanel — the unit its amounts are printed in", () => {
  // F-022: every `*_usdc` figure is in whatever the escrow's SAC wraps, and
  // with the asset unknown no unit is claimed at all — least of all the one
  // in the field name.
  it("prints its figures with no unit, and never USDC, while the asset is unknown", () => {
    render(
      <ReceiptPanel
        view={settled([{ step: step(0), state: { kind: "disputable" } }])}
        onDispute={vi.fn()}
        onConnect={vi.fn()}
        escrowGeneration="v2"
      />,
    );
    expect(text()).toContain(formatAmount(0.162, null));
    expect(text()).not.toMatch(/USDC|XLM/);
  });

  it("prints them in XLM on testnet", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "disputable" } }]));
    expect(text()).toContain("0.162 XLM");
    expect(text()).not.toMatch(/USDC/);
  });
});

describe("ReceiptPanel — the settled header", () => {
  it("shows the receipt heading, age, total and both transactions", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "disputable" } }]));

    expect(screen.getByRole("heading", { name: "Receipt" })).toBeTruthy();
    // One hour in, on the server's clock the view carries.
    expect(text()).toContain("Settled 1h ago");
    expect(text()).toContain(xlm(0.162));

    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.endsWith(`/tx/${CHARGE_TX}`))).toBe(true);
    expect(hrefs.some((h) => h.endsWith(`/tx/${PROOF_TX}`))).toBe(true);
    expect(hrefs.some((h) => h.endsWith(`/account/${PAYER}`))).toBe(true);
  });

  it("gives each explorer link a name of its own", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "disputable" } }]));

    // Three links to three different resources. Read out of context in a
    // links list, one shared name tells a screen-reader user nothing about
    // which is which (WCAG 2.4.4).
    const names = screen
      .getAllByRole("link")
      .map((a) => (a.textContent ?? "").trim());
    expect(names).toEqual([
      "view payer on stellar.expert ▸",
      "view charge on stellar.expert ▸",
      "view seal on stellar.expert ▸",
    ]);
    expect(new Set(names).size).toBe(names.length);
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
    expect(items[0].textContent).toContain(xlm(0.054));
    // No registered name: the agent id stands in for it.
    expect(items[1].textContent).toContain("Step 2");
    expect(items[1].textContent).toContain("agt_1");
    expect(items[1].textContent).toContain(xlm(0.108));
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

  // A policy that credits nothing is possible, and the dialog handles it;
  // the row printed "credits 0 XLM if upheld" beside the action.
  it("offers no credit hint beside a step an uphold would credit nothing for", () => {
    renderPanel(
      settled([
        {
          step: step(0, { creditable_usdc: 0 }),
          state: { kind: "disputable" },
        },
      ]),
    );
    expect(
      screen.getByRole("button", { name: "Dispute step 1, Agent 0" }),
    ).toBeTruthy();
    expect(text()).not.toContain("if upheld");
    expect(text()).not.toMatch(/credits (up to )?0 XLM/);
  });

  // The struck figure is for the eye; the ear hears what it means. And the
  // prices a screen reader is told were charged add up to what the header
  // says was charged — a receipt that sums to more is not a receipt.
  it("voices an uncharged step's price as not charged, and hides the struck figure", () => {
    renderPanel(
      settled(
        [
          { step: step(0), state: { kind: "disputable" } },
          {
            step: step(1, {
              price_usdc: 0.012,
              delivered: false,
              creditable_usdc: 0,
            }),
            state: { kind: "not_charged" },
          },
        ],
        { settledUsdc: 0.054 },
      ),
    );
    const [, uncharged] = screen.getAllByRole("listitem");
    expect(
      within(uncharged).getByText("Not charged, priced at 0.012 XLM"),
    ).toBeTruthy();
    const struck = within(uncharged).getByText("0.012 XLM");
    expect(struck.closest("[aria-hidden='true']")).not.toBeNull();

    const heard = Array.from(screen.getByRole("list").querySelectorAll("span"))
      .filter(
        (el) =>
          /^\d+(\.\d+)? XLM$/.test(el.textContent ?? "") &&
          el.closest("[aria-hidden='true']") === null,
      )
      .map((el) => parseFloat(el.textContent ?? ""));
    expect(heard).toEqual([0.054]);
    expect(heard.reduce((a, b) => a + b, 0)).toBeCloseTo(0.054, 9);
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
    // A ceiling, never an exact promise (D-071).
    expect(text()).toContain(`credits up to ${xlm(0.027)} if upheld`);
    expect(text()).not.toContain(`credits ${xlm(0.027)} if upheld`);
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

  // The clock for a closed window was read DURING render — an impure render,
  // and since nothing re-renders a closed window on its own the ages froze at
  // first paint until an unrelated poll happened to land.
  it("keeps a closed window's ages moving without a new view", () => {
    vi.useFakeTimers();
    vi.setSystemTime(CLOSES_AT + HOUR);
    try {
      renderPanel(
        settled([{ step: step(0), state: { kind: "window_closed" } }], {
          window: CLOSED,
        }),
      );
      // 24 hours of window plus the hour since it closed.
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(text()).toContain(`Settled ${formatAge(25 * HOUR)}`);

      act(() => {
        vi.advanceTimersByTime(24 * HOUR);
      });
      expect(text()).toContain(`Settled ${formatAge(49 * HOUR)}`);
    } finally {
      vi.useRealTimers();
    }
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
      `${xlm(0.0265)} credited to your wallet — funded by the platform, not clawed back from the agent.`,
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

  it("states a policy that credits nothing as nothing, never as 0%", () => {
    renderPanel(
      settled(
        [
          {
            step: step(0, { creditable_usdc: 0 }),
            state: { kind: "disputable" },
          },
        ],
        { policy: { ...POLICY, credited_fraction: 0 } },
      ),
    );
    expect(text()).toContain(
      "Under the current terms an upheld dispute credits nothing back.",
    );
    expect(text()).not.toContain("0%");
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

  /**
   * A printed instant ending in its zone — "GMT+8", "UTC", "PDT", never a
   * bare "PM" — in whichever zone the suite runs. Asserted as a pattern, never against
   * `formatLocalTime` itself: a check that compares the component's output
   * with the component's own formatter passes with the zone dropped.
   */
  const ZONED =
    /^Sep 2[23], 2026, \d{1,2}:\d{2}(?:\s?[AP]M)?\s(?:(?:GMT|UTC)(?:[+-]\d{1,2}(?::\d{2})?)?|(?![AP]M$)[A-Z]{2,5})$/;
  const closingText = (root: ParentNode) =>
    root.querySelector("time")?.textContent ?? "";

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
    expect(closingText(container)).toMatch(ZONED);
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      new Date(CLOSES_AT).toISOString(),
    );
  });

  it("shows when a closed window closed, in local time", () => {
    const { container } = render(
      <WindowState window={CLOSED} settledAtMs={SETTLED_AT} />,
    );
    expect(container.textContent).toContain("Dispute window closed");
    expect(closingText(container)).toMatch(ZONED);
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
    expect(closingText(container)).toMatch(ZONED);
    expect(summary).toBe(
      `Dispute window open until ${closingText(container)}.`,
    );
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

// D-067: the payer's offer to sign for words the backend withheld.
describe("ReceiptPanel — reasons the backend withheld", () => {
  const OFFER = /Show my reason/;

  /** The offer's own live region: the panel has others (the window's). */
  const outcome = () =>
    screen
      .getByRole("button", { name: OFFER })
      .closest(".clip-cyber-sm")
      ?.querySelector('[role="status"]')?.textContent;

  function renderWithUnlock(
    over: Partial<SettledView>,
    status: ReasonUnlockStatus = "idle",
    offered = true,
  ) {
    const onUnlock = vi.fn();
    render(
      <ReceiptPanel
        view={settled([], over)}
        onDispute={vi.fn()}
        onConnect={vi.fn()}
        reasonUnlock={offered ? { status, onUnlock } : null}
        escrowGeneration="v2"
      />,
    );
    return onUnlock;
  }

  it("offers the payer a signature that costs nothing, and asks for it only on a press", () => {
    const onUnlock = renderWithUnlock({ reasonsWithheld: true });
    expect(text()).toContain("it costs nothing and sends no transaction");
    expect(onUnlock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: OFFER }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("offers nothing when nothing was withheld from the payer", () => {
    renderWithUnlock({ reasonsWithheld: false });
    expect(screen.queryByRole("button", { name: OFFER })).toBeNull();
  });

  it("offers nothing when the page has no grant to ask for", () => {
    renderWithUnlock({ reasonsWithheld: true }, "idle", false);
    expect(screen.queryByRole("button", { name: OFFER })).toBeNull();
  });

  it("stays put while the wallet is open, and takes no press", () => {
    const onUnlock = renderWithUnlock({ reasonsWithheld: true }, "signing");
    const button = screen.getByRole("button", { name: /Signing/ });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onUnlock).not.toHaveBeenCalled();
    expect(
      button.closest(".clip-cyber-sm")?.querySelector('[role="status"]')
        ?.textContent,
    ).toContain("Waiting for your wallet");
  });

  it("states a declined prompt quietly, never as an error", () => {
    renderWithUnlock({ reasonsWithheld: true }, "declined");
    expect(outcome()).toBe(
      "Not signed. Your reason stays hidden until you choose to show it.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(text()).not.toMatch(/error|failed|⚠/i);
    // The offer stands: declining is not the end of it.
    expect(screen.getByRole("button", { name: OFFER })).toBeTruthy();
  });
});

// ── escrow v2: what the settlement did with the buyer's money ──

describe("ReceiptPanel — a workflow with no settlement on record", () => {
  const status = () => screen.getByRole("status");

  it.each([
    [
      "failed",
      "settlement failed",
      "The settlement did not go through, so no agent was paid.",
    ],
    [
      "unconfirmed",
      "settlement unconfirmed",
      "is not confirmed on-chain, and it may still land",
    ],
    [
      "released",
      "custody released",
      "returned the whole authorization from escrow to the wallet that paid",
    ],
    ["skipped", "nothing charged", "nothing was charged"],
  ] as const)(
    "says a %s settlement is exactly that, in a live region",
    (state, badge, sentence) => {
      renderPanel({
        kind: "not_settled",
        running: false,
        settlementState: state,
      });
      expect(text()).toContain(badge);
      expect(status().textContent).toContain(sentence);
      // Never the words of a finished, paid run.
      expect(text()).not.toMatch(/✓|\bpaid \d/);
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    },
  );

  // The failed state is the one that leaves funds in escrow: the buyer is
  // told who returns them and how, without "your" to a stranger reading.
  it("says how funds left in escrow by a failed settlement come back", () => {
    renderPanel({
      kind: "not_settled",
      running: false,
      settlementState: "failed",
    });
    expect(status().textContent).toContain(
      "the platform returns it automatically when it can, and otherwise the wallet that paid can reclaim it once the authorization expires.",
    );
  });

  // v1 took no custody and cannot complete a payment (D-039): a failed
  // settlement charged nothing and left nothing to reclaim.
  it("says a failed v1 settlement charged nothing, and offers no way back", () => {
    renderPanel(
      { kind: "not_settled", running: false, settlementState: "failed" },
      "v1",
    );
    expect(status().textContent).toBe(
      "The settlement did not go through, so no agent was paid. On this deployment the escrow cannot yet complete a payment (a known defect; the fix is deployed separately), so a paid run reports its settlement as failed and nothing is charged.",
    );
    expect(text()).not.toMatch(/into escrow|reclaim|returns it/);
  });

  it("says only what failed while the escrow is unknown", () => {
    renderPanel(
      { kind: "not_settled", running: false, settlementState: "failed" },
      "unknown",
    );
    expect(status().textContent).toBe(
      "The settlement did not go through, so no agent was paid.",
    );
  });

  it("keeps the running sentence while the workflow is still going", () => {
    renderPanel({
      kind: "not_settled",
      running: true,
      settlementState: "failed",
    });
    expect(text()).toContain("once this workflow settles");
    expect(text()).not.toContain("settlement failed");
  });

  it("says no charge is on record when the backend knows no state", () => {
    renderPanel({ kind: "not_settled", running: false, settlementState: null });
    expect(status().textContent).toBe(
      "No charge is on record for this workflow, so there is nothing to dispute.",
    );
  });
});

describe("ReceiptPanel — an escrow v2 settlement", () => {
  const PAID: SettlementStepView = step(0, { paid_usdc: 0.054 });
  const PLATFORM: SettlementStepView = step(1, {
    agent_id: "agt_05x7",
    agent_name: "seo.brief",
    paid_usdc: 0,
    delivered: true,
    creditable_usdc: 0,
  });

  /** The settlement sentence — the receipt's window state is a status too. */
  const settlementStatus = () =>
    screen
      .getAllByRole("status")
      .find((el) => /escrow|settle|on-chain/i.test(el.textContent ?? ""));

  function v2(over: Partial<SettledView> = {}): SettledView {
    return settled(
      [
        {
          step: PAID,
          state: { kind: "disputable" },
          payout: {
            kind: "paid",
            usdc: 0.054,
            tx: CHARGE_TX,
            receiptIdHex: null,
          },
        },
        {
          step: PLATFORM,
          state: { kind: "not_charged" },
          payout: { kind: "platform" },
        },
      ],
      {
        settlementState: "settled",
        remainder: { kind: "unreported" },
        ...over,
      },
    );
  }

  it("shows each paid step's payout with a link of its own to the settlement", () => {
    renderPanel(v2());
    expect(text()).toContain(`paid ${xlm(0.054)} to the operator`);
    const link = screen.getByRole("link", {
      name: "view step 1 payout on stellar.expert",
    });
    expect(link.getAttribute("href")).toMatch(new RegExp(`/tx/${CHARGE_TX}$`));
  });

  // A seeded platform agent has no on-chain owner: it was never paid.
  it("shows a platform agent's step as delivered and not billed, never as paid", () => {
    renderPanel(v2());
    const row = screen.getByText("seo.brief").closest("li");
    expect(row?.textContent).toContain(
      "delivered · not billed (platform agent)",
    );
    expect(row?.textContent).not.toMatch(/\bpaid\b/);
    expect(screen.queryByRole("link", { name: /step 2 payout/ })).toBeNull();
  });

  it.each([
    ["free", "delivered · not billed (free step)"],
    ["owner_unreadable", "delivered · not paid (operator could not be read)"],
    ["over_cap", "delivered · not paid (over the authorized maximum)"],
  ] as const)(
    "says a delivered %s step was not billed, never paid",
    (reason, words) => {
      renderPanel(
        settled(
          [
            {
              step: step(0, { paid_usdc: 0, delivered: true }),
              state: { kind: "not_charged" },
              payout: { kind: "not_billed", reason },
            },
          ],
          { settlementState: "settled", remainder: { kind: "unreported" } },
        ),
      );
      expect(text()).toContain(words);
      expect(text()).not.toMatch(/\bpaid \d/);
    },
  );

  it("says the rest went back, and that its amount was not reported", () => {
    renderPanel(v2());
    expect(text()).toContain("the rest, to the payer · amount not reported");
    expect(settlementStatus()?.textContent).toContain(
      "the rest of the authorization went back to the wallet that paid",
    );
  });

  it("states a remainder the backend reported", () => {
    renderPanel(v2({ remainder: { kind: "returned", usdc: 0.017 } }));
    expect(text()).toContain(`${xlm(0.017)} to the payer`);
  });

  it("links nothing for a payout whose transaction was not recorded", () => {
    const view = v2();
    view.steps[0] = {
      ...view.steps[0],
      payout: { kind: "paid", usdc: 0.054, tx: null, receiptIdHex: null },
    };
    renderPanel(view);
    expect(screen.queryByRole("link", { name: /payout/ })).toBeNull();
  });

  // Nothing on an unconfirmed or failed settlement may read as money moved.
  it.each([
    ["unconfirmed", "not confirmed yet"],
    ["failed", "none yet · still held in escrow"],
  ] as const)(
    "shows no total and nothing paid when the settlement is %s",
    (state, remainder) => {
      renderPanel(
        settled(
          [
            {
              step: PAID,
              state:
                state === "unconfirmed"
                  ? { kind: "payout_unconfirmed" }
                  : { kind: "not_charged" },
              payout:
                state === "unconfirmed"
                  ? { kind: "pending" }
                  : { kind: "not_paid" },
            },
          ],
          {
            settlementState: state,
            remainder:
              state === "unconfirmed" ? { kind: "pending" } : { kind: "held" },
          },
        ),
      );
      expect(text()).not.toContain(xlm(0.162));
      expect(text()).toContain("nothing is shown as paid");
      expect(text()).not.toMatch(/\bpaid \d|✓ settled|Settled \d/);
      expect(text()).toContain(remainder);
      expect(text()).toContain(
        state === "unconfirmed"
          ? "settlement unconfirmed"
          : "settlement failed",
      );
    },
  );

  // Only v2 holds anything: a v1 or unknown escrow never reads as holding
  // the buyer's money, even on a recorded receipt whose settlement failed.
  it.each(["v1", "unknown"] as const)(
    "never says a failed settlement's funds are held when the escrow is %s",
    (generation) => {
      renderPanel(
        settled(
          [
            {
              step: PAID,
              state: { kind: "not_charged" },
              payout: { kind: "not_paid" },
            },
          ],
          { settlementState: "failed", remainder: { kind: "held" } },
        ),
        generation,
      );
      expect(text()).toContain("settlement failed");
      expect(text()).toContain(
        "The settlement did not go through, so no agent was paid.",
      );
      expect(text()).not.toMatch(/held in escrow|into escrow|reclaim/);
      expect(text()).not.toContain("none yet");
    },
  );

  it("offers no dispute on a step whose payout is unconfirmed, and says why", () => {
    renderPanel(
      settled(
        [
          {
            step: PAID,
            state: { kind: "payout_unconfirmed" },
            payout: { kind: "pending" },
          },
        ],
        { settlementState: "unconfirmed", remainder: { kind: "pending" } },
      ),
    );
    expect(actionButtons()).toHaveLength(0);
    expect(text()).toContain("payout not confirmed");
    expect(text()).toContain(
      "This step's payout is not confirmed on-chain yet, so it cannot be disputed until it is.",
    );
    expect(text()).toContain(`Payout not confirmed, priced at ${xlm(0.054)}`);
  });

  it("says it stopped checking an unconfirmed settlement", () => {
    renderPanel(
      settled([], {
        settlementState: "unconfirmed",
        remainder: { kind: "pending" },
        settlementStoppedChecking: true,
      }),
    );
    expect(settlementStatus()?.textContent).toContain(
      "This page has stopped checking for it — reload to look again.",
    );
  });

  // A pre-v2 receipt reads exactly as before.
  it("adds nothing to a receipt from a backend that reports no state", () => {
    renderPanel(settled([{ step: step(0), state: { kind: "disputable" } }]));
    expect(text()).toContain("settled");
    expect(text()).not.toMatch(/returned|payout|platform agent/);
    expect(settlementStatus()).toBeUndefined();
  });
});

describe("ReceiptPanel — the run's seal", () => {
  it.each([
    ["sealed", "Sealed on Stellar"],
    ["pending", "Sealing… checking the ledger"],
    ["unconfirmed", "Seal not confirmed yet"],
    ["failed", "Seal failed — your payment stands"],
  ] as const)("says a %s seal in words, as a status", (seal, label) => {
    renderPanel(settled([], { seal }));
    expect(
      screen
        .getAllByRole("status")
        .some((el) => (el.textContent ?? "").includes(label)),
    ).toBe(true);
  });

  it("keeps the seal's transaction link beside it", () => {
    renderPanel(settled([], { seal: "sealed" }));
    const links = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(links.some((href) => href.includes(PROOF_TX))).toBe(true);
  });

  it("says why there is no seal when none was submitted", () => {
    renderPanel(settled([], { seal: null }));
    expect(text()).toContain("No attestation seal was submitted");
  });

  it("adds no seal line for a backend that does not report one", () => {
    renderPanel(settled([]));
    expect(text()).not.toMatch(
      /Sealed on Stellar|Sealing…|Seal not|Seal failed|No attestation seal/,
    );
  });
});

describe("ReceiptPanel — a delivery-only seal", () => {
  it("says the run was attested with no payment made", () => {
    renderPanel({
      kind: "not_settled",
      running: false,
      seal: "sealed",
      sealKind: "delivery_only",
    });
    expect(text()).toContain(
      "Attested on Stellar — delivered, no payment made",
    );
    expect(text()).not.toMatch(/payment stands|dispute window/i);
  });

  it("keeps today's wording when the backend sends no kind", () => {
    renderPanel(settled([], { seal: "failed" }));
    expect(text()).toContain("Seal failed — your payment stands");
  });
});

describe("ReceiptPanel · the reconciliation", () => {
  const recon = {
    rows: [
      {
        stepIndex: 0,
        agent: "code.gen",
        delivered: true,
        planned: 540_000n,
        charged: 540_000n,
        returned: 0n,
        balanced: true,
        builtInUnpaid: false,
      },
    ],
    planned: 540_000n,
    charged: 540_000n,
    returned: 0n,
    authorized: null,
    headroom: null,
    balanced: true,
    issues: [],
    held: false,
    allReturnedBuiltIn: false,
    exact: true,
    asset: null,
    settleTx: CHARGE_TX,
  };

  it("draws planned, charged and returned once the view reconciles them", async () => {
    renderPanel(settled([], { reconciliation: recon }));
    const table = await screen.findByRole("table");
    expect(table.textContent).toContain("code.gen");
    // Planned and charged, on the step and in the total.
    expect(within(table).getAllByText("0.054").length).toBe(4);
  });

  it("draws no table for a settlement it cannot reconcile", () => {
    renderPanel(settled([]));
    expect(screen.queryByRole("table")).toBeNull();
  });
});
