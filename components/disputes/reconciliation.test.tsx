// @vitest-environment jsdom
/**
 * The receipt's reconciliation: planned against charged against returned,
 * per step and in all, to the stroop, with the settlement transaction one
 * click away on stellar.expert.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { reconcileSettlement } from "@/lib/reconcile";
import type {
  SettlementState,
  SettlementStepView,
  SettlementTotals,
  SettlementView,
  WireAmount,
} from "@/lib/types";
import { AmountAssetProvider } from "./amount-asset";
import { ReconciliationTable } from "./reconciliation";

afterEach(cleanup);

const SETTLE_TX = "a".repeat(64);

const step = (
  i: number,
  over: Partial<SettlementStepView> = {},
): SettlementStepView => ({
  step_index: i,
  agent_id: `agt_${i}`,
  agent_name: `agent ${i}`,
  price_usdc: 0,
  delivered: true,
  creditable_usdc: 0,
  output_summary: null,
  ...over,
});

const amt = (stroops: number): WireAmount => ({ stroops, display: "—" });
const money = (planned: number, charged: number, returned: number) => ({
  planned: amt(planned),
  charged: amt(charged),
  returned: amt(returned),
});
const totals = (
  authorized: number,
  planned: number,
  charged: number,
  returned: number,
  surplus: number,
): SettlementTotals => ({
  authorized: amt(authorized),
  planned: amt(planned),
  charged: amt(charged),
  returned: amt(returned),
  surplus: amt(surplus),
});

const settlement = (over: Partial<SettlementView> = {}): SettlementView => ({
  job_id_hex: "ab".repeat(16),
  payer: "GPAYER",
  settled_at: 1,
  window_closes_at: 2,
  settled_usdc: 0,
  charge_tx: SETTLE_TX,
  proof_tx: null,
  policy: {
    credited_fraction: 0.5,
    funded_by: "platform",
    adjudicated_by: "platform",
  },
  steps: [
    step(0, {
      agent_name: "research.pro",
      ...money(240_000, 240_000, 0),
    }),
    step(1, {
      agent_name: "copywrite.v3",
      delivered: false,
      ...money(123_457, 0, 123_457),
    }),
    step(2, {
      agent_name: "code.gen",
      ...money(540_000, 540_000, 0),
    }),
  ],
  totals: totals(903_457, 903_457, 780_000, 123_457, 0),
  ...over,
});

function show(
  s: SettlementView = settlement(),
  state: SettlementState = "settled",
  asset: string | null = "native",
) {
  const recon = reconcileSettlement(s, state);
  if (!recon) throw new Error("no reconciliation");
  return render(
    <AmountAssetProvider asset={asset}>
      <ReconciliationTable recon={recon} />
    </AmountAssetProvider>,
  );
}

/** The table's rows as the cells read, header and totals included. */
const cells = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .map((r) =>
      Array.from(r.querySelectorAll("th, td")).map((c) => c.textContent),
    );

describe("ReconciliationTable", () => {
  it("lists every step's planned, charged and returned amount and the totals", () => {
    show();
    expect(cells()).toEqual([
      ["Step", "Planned", "Charged", "Returned"],
      ["1 · research.pro", "0.024", "0.024", "0.000"],
      ["2 · copywrite.v3 · not delivered", "0.0123457", "0.000", "0.0123457"],
      ["3 · code.gen", "0.054", "0.054", "0.000"],
      ["Total", "0.0903457", "0.078", "0.0123457"],
    ]);
  });

  it("names the unit once, in the caption, and never USDC on testnet", () => {
    const { container } = show();
    expect(
      screen.getByRole("table").querySelector("caption")?.textContent,
    ).toContain("in XLM");
    expect(container.textContent).not.toMatch(/USDC/);
  });

  it("takes the settlement's own asset over the network's", () => {
    show(
      settlement({ asset: { code: "USDC", issuer: "GISSUER", decimals: 7 } }),
    );
    expect(
      screen.getByRole("table").querySelector("caption")?.textContent,
    ).toContain("in USDC");
  });

  it("says the totals add up, and what was authorized", () => {
    const { container } = show();
    const text = container.textContent ?? "";
    expect(text).toContain(
      "Charged plus returned equals planned, to the stroop.",
    );
    expect(text).toContain("Authorized 0.0903457 XLM");
  });

  it("links the settlement transaction on stellar.expert", () => {
    show();
    const link = screen.getByRole("link", {
      name: /view the settlement that paid and returned on stellar\.expert/i,
    });
    expect(link.getAttribute("href")).toBe(
      `https://stellar.expert/explorer/testnet/tx/${SETTLE_TX}`,
    );
  });

  it("says plainly when the figures do not add up", () => {
    const { container } = show(
      settlement({ totals: totals(903_457, 903_457, 780_001, 123_456, 0) }),
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("These figures do not add up");
    expect(alert.textContent).toContain(
      "the steps' charges do not sum to the settlement's total",
    );
    expect(container.textContent).not.toContain("to the stroop.");
  });

  it("shows nothing as charged or returned while the settlement is unconfirmed", () => {
    const { container } = show(settlement(), "unconfirmed");
    expect(cells()[1]).toEqual([
      "1 · research.pro",
      "0.024",
      "pending",
      "pending",
    ]);
    expect(container.textContent).toContain("once the settlement confirms");
  });

  it("says a failed settlement's custody is still held", () => {
    const { container } = show(settlement(), "failed");
    expect(cells()[4]).toEqual(["Total", "0.0903457", "0.000", "held"]);
    expect(container.textContent).toContain("still held in escrow");
  });

  it("names the authorization's headroom the escrow also returned", () => {
    const { container } = show(
      settlement({
        steps: [step(0, money(0, 0, 0))],
        totals: totals(10_000, 0, 0, 10_000, 10_000),
      }),
    );
    expect(container.textContent).toContain(
      "The escrow also returned 0.001 XLM authorized above the plan's price.",
    );
  });
});
