// @vitest-environment jsdom
/**
 * The operator's price control names no currency. The price is in whatever
 * the escrow's SAC wraps — native XLM on testnet — and this panel has no
 * network read, so it prints the figure bare, as the marketplace's price
 * column and the operator card beside it do. "USDC" was the wire field's
 * name talking (friction F-022).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { Agent } from "@/lib/types";

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({ connected: true, address: "G".repeat(56) }),
}));

import { ManagePanel } from "./manage-panel";

afterEach(cleanup);

const AGENT: Agent = {
  id: "code_gen",
  name: "Code Gen",
  skills: ["code"],
  price: 0.054,
  rep: 4.2,
  status: "online",
  runs: 3,
  owner: "G".repeat(56),
  source: "onchain",
};

describe("ManagePanel", () => {
  it("states the current price with no unit, and never USDC", () => {
    const { container } = render(
      <ManagePanel agent={AGENT} owner={AGENT.owner!} onChanged={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("New price · current 0.054");
    expect(text).not.toMatch(/USDC/);
  });
});
