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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { formatUsdc } from "@/lib/disputes";
import type {
  Dispute,
  DisputePanelView,
  DisputeViewer,
  SettlementStepView,
  StepDisputeState,
} from "@/lib/types";
import { ReceiptPanel } from "./receipt-panel";

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
    policy: {
      credited_fraction: 0.5,
      funded_by: "platform",
      adjudicated_by: "platform",
    },
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
          state: {
            kind: "disputed",
            dispute: dispute({ status: "crediting" }),
            showReason: false,
          },
        },
      ]),
    );
    expect(text()).toContain("Refund in progress");
    expect(actionButtons()).toHaveLength(0);
  });

  it("shows the buyer's own reason only when the view allows it", () => {
    const reason = "The summary missed the second half of the brief.";
    const row = (showReason: boolean) =>
      settled([
        {
          step: step(0),
          state: { kind: "disputed", dispute: dispute({ reason }), showReason },
        },
      ]);

    renderPanel(row(true));
    expect(text()).toContain(reason);
    expect(text()).toContain("your reason");
    cleanup();

    renderPanel(row(false));
    expect(text()).not.toContain(reason);
    expect(text()).not.toContain("your reason");
  });

  it("links a credited dispute's refund transaction", () => {
    const refund = "d".repeat(64);
    renderPanel(
      settled([
        {
          step: step(0),
          state: {
            kind: "disputed",
            dispute: dispute({ status: "credited", refund_tx: refund }),
            showReason: false,
          },
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
    expect(item.textContent).toContain("did not deliver");
    expect(item.textContent).toContain("never charged");
    expect(item.textContent).toContain("nothing to dispute");
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
            state: {
              kind: "disputed",
              dispute: dispute({ step_index: 1 }),
              showReason: false,
            },
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
          state: { kind: "disputed", dispute: dispute(), showReason: true },
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
