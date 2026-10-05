/**
 * The committed evidence index against what Stellar testnet actually holds.
 *
 * The structural validator (validate.mjs) checks that a transaction link goes
 * to its own hash; it cannot know what the transaction says. QA found labels
 * that claimed more than the chain carries, so these tests pin each rating
 * link to the arguments of its ReputationLedger `submit` call, read from
 * Horizon testnet on 2026-10-06: the agent id (a Soroban symbol), the score
 * out of 100, the job amount in stroops and the rating's kind.
 *
 * Anything else a label quotes about a rating, such as the router's lower
 * bound, is worked out off-chain from many ratings and the router's settings;
 * a link to one transaction cannot show it.
 */

import { describe, expect, it } from "vitest";
import { loadEvidence } from "./load";
import type { EvidenceLink } from "./types";

type Rating = {
  agent: string;
  score: number;
  stroops: number;
  kind: "auto" | "dispute";
};

/** Every rating transaction the index links, as the ledger recorded it. */
const RATINGS: Readonly<Record<string, Rating>> = {
  "3aafc504ff0b3943ffa1c92ded576991dcfac888df59ab6164027d7ff43501f9": {
    agent: "calculatorai",
    score: 95,
    stroops: 100_000,
    kind: "auto",
  },
  adb7592eed1f403b39765da94ab9eff204b0fea33d7da52e5fe6a33c9750d40e: {
    agent: "calculatorai",
    score: 95,
    stroops: 100_000,
    kind: "auto",
  },
  "7ab2dd12333c6d6819aa0045e240e6bf30deceb5fcb10645b5ba5df2e7aee52c": {
    agent: "keyboardai",
    score: 95,
    stroops: 2_000_000,
    kind: "auto",
  },
  cfc0b964906c3695f94cd2d3a1d4e8a8511fe5784a2c5d8b6c26e794a32fb201: {
    agent: "agt_09l5",
    score: 70,
    stroops: 240_000,
    kind: "auto",
  },
  "149805cfd72bef2dcbbdd30f6a3014a2af3d2839fcce61774bf0e95772a51ed8": {
    agent: "uat624_ext_op",
    score: 20,
    stroops: 100_000,
    kind: "auto",
  },
  e7885bf192688ed4b65006abe82b5b5f58737b15fd06bfaa9c54de13fa0b9663: {
    agent: "faulty_test_v2",
    score: 20,
    stroops: 2_000_000,
    kind: "auto",
  },
  "2980361e248b6a1284e17a2a7ec38d354991afc25f6f982270eb0710fa1aa388": {
    agent: "faulty_test_v2",
    score: 20,
    stroops: 2_000_000,
    kind: "auto",
  },
  cc83982bd11e39fe61f3446df7f9cfa4a30a741d77ab717abf204894bbf4e30f: {
    agent: "faulty_test_v2",
    score: 20,
    stroops: 2_000_000,
    kind: "auto",
  },
  b512135ffade2d6518fd8cf1628f20787846ed0e311750043b87723dee453a49: {
    agent: "calculatorai",
    score: 10,
    stroops: 100_000,
    kind: "dispute",
  },
};

/** Every link in the index, with where it sits. */
function allLinks(): { where: string; link: EvidenceLink }[] {
  const index = loadEvidence();
  return [
    ...index.deliverables.flatMap((d) =>
      d.items.flatMap((item) =>
        item.links.map((link) => ({ where: item.id, link })),
      ),
    ),
    ...index.metrics.flatMap((m) =>
      m.links.map((link) => ({ where: m.id, link })),
    ),
  ];
}

/** A link that presents one rating: "Rating of …" or "Dispute rating …". */
const RATING_LABEL = /^Rating of |\bDispute rating\b/;

function ratingLinks() {
  return allLinks().filter(
    ({ link }) => link.kind === "tx" && RATING_LABEL.test(link.label),
  );
}

describe("rating links say only what the chain carries", () => {
  it("each one is a rating whose arguments are pinned above", () => {
    const links = ratingLinks();
    expect(links.length).toBeGreaterThan(0);
    for (const { where, link } of links) {
      expect(
        RATINGS[link.tx_hash ?? ""],
        `${where}: ${link.tx_hash} is not a pinned rating`,
      ).toBeDefined();
    }
  });

  it("quote no lower bound: the router works that out off-chain (QA D-081)", () => {
    for (const { where, link } of ratingLinks()) {
      expect(link.label, where).not.toMatch(
        /lower bound|\bbps\b|\d{4} to \d{4}/i,
      );
    }
  });

  // The ledger keys a rating by the agent's id, a Soroban symbol: letters,
  // digits and "_" only. A catalogue name such as "research.pro" cannot be
  // one, so a label that leads with it names something the chain does not
  // hold (QA D-087).
  it("name the agent by the id the chain holds (QA D-087)", () => {
    for (const { where, link } of ratingLinks()) {
      const subject = link.label.split(":")[0];
      const { agent } = RATINGS[link.tx_hash ?? ""];
      expect(subject, where).toMatch(
        new RegExp(`(^|[^\\w])${agent}($|[^\\w])`),
      );
      expect(subject, where).not.toMatch(/\w\.\w/);
    }
  });

  it("quote the score the chain holds, when they quote one", () => {
    for (const { where, link } of ratingLinks()) {
      const quoted = /(\d+) out of 100/.exec(link.label);
      if (!quoted) continue;
      expect(Number(quoted[1]), `${where}: ${link.label}`).toBe(
        RATINGS[link.tx_hash ?? ""].score,
      );
    }
  });
});
