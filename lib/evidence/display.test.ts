import { describe, expect, it } from "vitest";
import {
  deliverableAnchor,
  deliverableHeading,
  destination,
  formatDate,
  ITEM_STATUS,
  METRIC_STATUS,
  truncateHash,
} from "./display";

describe("evidence display helpers", () => {
  it("writes dates in words, in UTC", () => {
    expect(formatDate("2026-09-29")).toBe("September 29, 2026");
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("shortens a hash to its ends", () => {
    expect(truncateHash("a".repeat(8) + "b".repeat(48) + "c".repeat(8))).toBe(
      "aaaaaaaa…cccccccc",
    );
  });

  it("names a deliverable's section the way the SOW numbers it", () => {
    expect(deliverableHeading("D3", "Dispute")).toBe("Deliverable 3: Dispute");
    expect(deliverableHeading("RD", "Repositories & Deployments")).toBe(
      "Repositories & Deployments",
    );
    expect(deliverableAnchor("RD")).toBe("deliverable-rd");
  });

  it("says where an outside link opens", () => {
    expect(
      destination(
        `https://stellar.expert/explorer/testnet/tx/${"1".repeat(64)}`,
      ),
    ).toEqual({
      external: true,
      site: "Stellar Expert",
      hint: "(opens Stellar Expert)",
    });
    expect(
      destination("https://github.com/Bl0cksmiths/x/pull/1"),
    ).toMatchObject({ hint: "(opens GitHub)" });
    expect(destination("https://www.example.com/a")).toMatchObject({
      hint: "(opens example.com)",
    });
  });

  it("keeps a page on the site itself in the tab", () => {
    expect(destination("https://orizons.xyz/app/agents")).toEqual({
      external: false,
    });
    expect(destination("https://www.orizons.xyz/demo")).toEqual({
      external: false,
    });
  });

  it("labels every status in words, with an icon beside", () => {
    expect(Object.values(ITEM_STATUS).map((s) => s.label)).toEqual([
      "Present",
      "Partial",
      "Missing",
    ]);
    expect(METRIC_STATUS.not_met.label).toBe("Not met");
    for (const s of [
      ...Object.values(ITEM_STATUS),
      ...Object.values(METRIC_STATUS),
    ]) {
      expect(s.icon).not.toBe("");
    }
  });
});
