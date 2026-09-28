// @vitest-environment jsdom
/**
 * The trace's on-chain receipts (finding S7): a hash is evidence only once
 * the backend says the settlement confirmed. Plain DOM checks — this repo
 * does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { OnChainReceipts } from "./on-chain-receipts";

afterEach(cleanup);

const CHARGE = "c".repeat(64);
const PROOF = "d".repeat(64);
const txLinks = () =>
  screen
    .queryAllByRole("link")
    .filter((a) => (a.getAttribute("href") ?? "").includes("/tx/"));

describe("OnChainReceipts", () => {
  it("links the settlement and the seal once the settlement is settled", () => {
    render(
      <OnChainReceipts state="settled" chargeTx={CHARGE} proofTx={PROOF} />,
    );
    expect(document.body.textContent).toContain("On-chain receipts");
    const hrefs = txLinks().map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      expect.stringMatching(new RegExp(`/tx/${CHARGE}$`)),
      expect.stringMatching(new RegExp(`/tx/${PROOF}$`)),
    ]);
  });

  it.each([
    ["failed", "settlement failed", "did not go through"],
    ["unconfirmed", "settlement unconfirmed", "may still land"],
    ["released", "custody released", "returned the whole authorization"],
    ["skipped", "nothing charged", "nothing was charged"],
  ] as const)(
    "shows a %s settlement's state, never its hashes as receipts",
    (state, badge, reason) => {
      render(
        <OnChainReceipts state={state} chargeTx={CHARGE} proofTx={PROOF} />,
      );
      const text = document.body.textContent ?? "";
      expect(text).toContain(badge);
      expect(screen.getByRole("status").textContent).toContain(reason);
      expect(text).not.toContain("On-chain receipts");
      expect(text).not.toContain(CHARGE);
      expect(txLinks()).toHaveLength(0);
    },
  );

  // An older backend reported a rejected settlement's hash as `charge_tx`.
  it("links nothing when the backend never said how the run settled", () => {
    render(
      <OnChainReceipts state={undefined} chargeTx={CHARGE} proofTx={null} />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "has not reported how this run settled",
    );
    expect(txLinks()).toHaveLength(0);
  });
});
