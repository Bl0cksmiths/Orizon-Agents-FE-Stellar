// @vitest-environment jsdom
/**
 * Rendering tests for the evidence page, against the fixture index in
 * test/fixtures/evidence/ (its hashes are clearly fake).
 *
 * What is asserted is what the reviewer depends on: every status and badge
 * reads as an icon beside a word; the checklist suggestion is derived and
 * says the Chapter Lead decides; each deliverable quotes the SOW; each link
 * is labelled, leaves the site safely and says where it opens; a transaction
 * shows its shortened hash and date after the label; every link has its URL
 * ready for print; a missed target's reason is inline; the disclosures show
 * their SOW reference and what changed.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { evidencePaths, loadEvidence } from "@/lib/evidence/load";
import { SOW_6_1 } from "@/lib/evidence/sow.mjs";
import type { EvidenceIndex } from "@/lib/evidence/types";
import { EvidenceArticle } from "./evidence-article";
import { EvidenceLinks } from "./evidence-links";
import { StatusBadge } from "./status-badge";

const FIXTURE_DIR = path.resolve(__dirname, "../../test/fixtures/evidence");
const fixture = (): EvidenceIndex =>
  loadEvidence(evidencePaths({ EVIDENCE_CONTENT_DIR: FIXTURE_DIR }));

const text = (el: Element | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const HASH = "1".repeat(64);
const TX_URL = `https://stellar.expert/explorer/testnet/tx/${HASH}`;

afterEach(cleanup);

function section(name: string | RegExp) {
  const heading = screen.getByRole("heading", { name });
  const el = heading.closest("section");
  if (!el) throw new Error(`no section for ${String(name)}`);
  return el;
}

describe("status badges", () => {
  const cases = [
    ["present", "✓", "Present"],
    ["partial", "◐", "Partial"],
    ["missing", "✕", "Missing"],
    ["met", "✓", "Met"],
    ["not_met", "✕", "Not met"],
  ] as const;
  for (const [status, icon, word] of cases) {
    it(`${status}: the icon beside the word, the icon hidden from screen readers`, () => {
      const { container } = render(<StatusBadge status={status} />);
      const badge = container.querySelector(`[data-status="${status}"]`)!;
      expect(text(badge)).toBe(`${icon}${word}`);
      const hidden = badge.querySelector('[aria-hidden="true"]')!;
      expect(hidden.textContent).toBe(icon);
      // The word is real text, not a colour or an icon alone.
      expect(badge.lastChild?.textContent).toBe(word);
      // It prints as black text in a black box, not as a colour.
      expect(badge.className).toContain("print:text-black");
      expect(badge.className).toContain("print:border-black");
    });
  }

  it("reads a prefix to screen readers only", () => {
    const { container } = render(
      <StatusBadge status="partial" prefix="Status:" />,
    );
    const sr = container.querySelector(".sr-only")!;
    expect(sr.textContent).toBe("Status: ");
  });
});

describe("evidence links", () => {
  it("puts the label first, then the shortened hash and the date, for a transaction", () => {
    const { container } = render(
      <EvidenceLinks
        links={[
          {
            label: "Registration by an outside operator",
            url: TX_URL,
            kind: "tx",
            tx_hash: HASH,
            date: "2026-09-12",
          },
        ]}
      />,
    );
    const item = container.querySelector("li")!;
    const link = within(item).getByRole("link");
    expect(link.getAttribute("href")).toBe(TX_URL);
    expect(item.firstElementChild).toBe(link);
    expect(text(link)).toBe(
      "Registration by an outside operator (opens Stellar Expert) ↗",
    );
    const hash = item.querySelector(`[title="${HASH}"]`)!;
    expect(hash.className).toContain("font-mono");
    expect(hash.className).toContain("text-[11px]");
    expect(text(hash)).toBe("transaction 11111111…11111111");
    expect(item.querySelector("time")!.getAttribute("dateTime")).toBe(
      "2026-09-12",
    );
    expect(text(item.querySelector("time"))).toBe("September 12, 2026");
  });

  it("opens an outside link in a new tab with no opener and no referrer", () => {
    render(
      <EvidenceLinks
        links={[
          {
            label: "Frontend pull request",
            url: "https://github.com/Bl0cksmiths/x/pull/1",
            kind: "pr",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", {
      name: "Frontend pull request (opens GitHub)",
    });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps a page on the site in the same tab, with no hint", () => {
    render(
      <EvidenceLinks
        links={[
          {
            label: "The live register page",
            url: "https://orizons.xyz/app/agents/register",
            kind: "page",
          },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: "The live register page" });
    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("rel")).toBeNull();
  });

  it("carries each URL for print, hidden on screen", () => {
    const { container } = render(
      <EvidenceLinks
        links={[
          { label: "Proof one here", url: TX_URL, kind: "tx", tx_hash: HASH },
        ]}
      />,
    );
    const url = container.querySelector("[data-print-url]")!;
    expect(url.textContent).toBe(TX_URL);
    expect(url.className).toMatch(/(^| )hidden( |$)/);
    expect(url.className).toContain("print:block");
  });

  it("says so when there is nothing to click", () => {
    render(<EvidenceLinks links={[]} />);
    expect(screen.getByText("No proof link yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("the evidence page", () => {
  it("heads the page with the title, snapshot date, network and SOW, and how to use it", () => {
    render(<EvidenceArticle index={fixture()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Fixture evidence index" }),
    ).toBeTruthy();
    const header = screen.getByRole("banner");
    expect(text(header)).toContain("As ofSeptember 28, 2026");
    expect(text(header)).toContain("NetworkStellar testnet");
    expect(text(header)).toContain("SOWv4, dated August 1, 2026");
    const how = section("How to use this page");
    expect(text(how)).toContain(
      "Each row below shows a claim and the links that prove it; click a link to see the proof on Stellar Expert, the public ledger explorer",
    );
  });

  it("suggests a §6.2 marking per row, derived from the items, and says the Chapter Lead decides", () => {
    render(<EvidenceArticle index={fixture()} />);
    const summary = section("Checklist summary (SOW §6.2)");
    expect(text(summary)).toContain(
      "The Chapter Lead decides; this page only suggests a marking.",
    );
    expect(text(summary)).toContain(
      "How the suggestion is worked out: If every item is present, the suggestion is Present. If at least one item is present or partial, it is Partial. If none is, it is Missing.",
    );
    const table = within(summary).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((r) => [
        within(r).getByRole("rowheader").querySelector("a")!.textContent,
        r.querySelector("[data-status]")!.getAttribute("data-status"),
      ]),
    ).toEqual([
      ["Deliverable 1: Permissionless Agent Registration", "present"],
      ["Deliverable 2: Reputation-Gated Routing", "partial"],
      [
        "Deliverable 3: Automated Dispute Window + Partial-Credit Refund",
        "missing",
      ],
      ["Deliverable 4: Ecosystem Validation Package", "partial"],
      ["Repositories & Deployments", "present"],
    ]);
    expect(text(rows[1])).toContain("1 present, 1 partial, 1 missing (of 3)");
    // Each row jumps to its deliverable's section.
    expect(within(rows[2]).getByRole("link").getAttribute("href")).toBe(
      "#deliverable-d3",
    );
    expect(document.getElementById("deliverable-d3")?.tagName).toBe("H3");
  });

  it("has a caption and scoped headers on every table", () => {
    const { container } = render(<EvidenceArticle index={fixture()} />);
    const tables = container.querySelectorAll("table");
    expect(tables).toHaveLength(2);
    for (const table of Array.from(tables)) {
      expect(text(table.querySelector("caption"))).not.toBe("");
      for (const th of Array.from(table.querySelectorAll("thead th"))) {
        expect(th.getAttribute("scope")).toBe("col");
      }
      for (const th of Array.from(table.querySelectorAll("tbody th"))) {
        expect(th.getAttribute("scope")).toBe("row");
      }
      expect(table.querySelectorAll("tbody th").length).toBe(
        table.querySelectorAll("tbody tr").length,
      );
    }
  });

  it("mirrors SOW §6.1: each deliverable quotes its evidence type and description verbatim", () => {
    render(<EvidenceArticle index={fixture()} />);
    for (const row of SOW_6_1) {
      const el = document.getElementById(
        `deliverable-${row.id.toLowerCase()}`,
      )!;
      const sec = el.closest("section")!;
      expect(text(sec)).toContain(
        `Evidence type (SOW §6.1)${row.evidence_type}`,
      );
      expect(text(sec.querySelector("blockquote p"))).toBe(`“${row.sow_text}”`);
    }
  });

  it("shows each item's claim, status in words, links and why it falls short", () => {
    const { container } = render(<EvidenceArticle index={fixture()} />);
    const partial = container.querySelector('[data-item="6.1-D2-b"]')!;
    expect(
      within(partial as HTMLElement).getByRole("heading", { level: 4 })
        .textContent,
    ).toBe("Fixture: a below-floor agent is left out of a plan");
    expect(text(partial.querySelector("[data-status]"))).toBe(
      "Status: ◐Partial",
    );
    expect(text(partial)).toContain(
      "Why: Fixture partial note: the recording shows the notice but not the agent’s score.",
    );
    const missing = container.querySelector('[data-item="6.1-D2-c"]')!;
    expect(text(missing)).toContain("No proof link yet.");
    expect(text(missing)).toContain("Why: Fixture missing note");
    const present = container.querySelector('[data-item="6.1-D1-c"]')!;
    expect(text(present)).not.toContain("Why:");
    expect(
      within(present as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe(TX_URL);
  });

  it("counts the metrics met and states each missed target's reason inline", () => {
    render(<EvidenceArticle index={fixture()} />);
    const metrics = section("Success metrics (SOW §6.3)");
    expect(text(metrics.querySelector("[data-met-count]"))).toBe(
      "7 of 11 metrics met.",
    );
    const rows = within(metrics).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(11);
    const m03 = rows[2];
    expect(text(within(m03).getByRole("rowheader"))).toContain(
      "Workflows routed to external agents & settled on Testnet",
    );
    const status = m03.querySelector('[data-metric-status="not_met"]')!;
    expect(text(status)).toBe(
      "✕Not metWhy: Fixture reason for m03: not reached in the fixture.",
    );
    expect(m03.querySelector("[title]")).toBeNull();
    expect(text(m03)).toContain("No proof link yet.");
    const m01 = rows[0];
    expect(text(m01.querySelector("[data-metric-status]"))).toBe("✓Met");
    expect(text(m01)).toContain("≥ 2");
    expect(text(m01)).toContain("How measured: Fixture method for m01.");
  });

  it("lists every disclosure with its SOW reference and what changed", () => {
    const { container } = render(<EvidenceArticle index={fixture()} />);
    const ids = Array.from(container.querySelectorAll("[data-disclosure]")).map(
      (d) => d.getAttribute("data-disclosure"),
    );
    expect(ids).toEqual([
      "testnet",
      "platform_credits",
      "offchain_binding",
      "single_settler_key",
    ]);
    expect(
      text(container.querySelector('[data-disclosure="testnet"]')),
    ).toContain("SOW reference: §3.6");
    expect(
      text(container.querySelector('[data-disclosure="platform_credits"]')),
    ).toContain("Changed since the SOW: Fixture: changed since the SOW.");
    expect(
      text(container.querySelector('[data-disclosure="offchain_binding"]')),
    ).not.toContain("SOW reference");
  });

  it("shows the notes, and no Notes heading when there are none", () => {
    const index = fixture();
    render(<EvidenceArticle index={index} />);
    expect(text(section("Notes"))).toContain("Fixture note: XLM, not USDC");
    cleanup();
    render(<EvidenceArticle index={{ ...index, notes: [] }} />);
    expect(screen.queryByRole("heading", { name: "Notes" })).toBeNull();
  });

  it("points to the guide, the demo, the ecosystem page, the litepaper and the repos", () => {
    render(<EvidenceArticle index={fixture()} />);
    const where = section("Where else to look");
    const hrefs = within(where)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs.slice(0, 4)).toEqual([
      "/guide/list-your-agent",
      "/demo",
      "/app/ecosystem",
      "/litepaper",
    ]);
    expect(hrefs.slice(4)).toHaveLength(3);
    for (const name of [
      "Frontend source code (opens GitHub)",
      "Backend source code (opens GitHub)",
      "Smart contracts source code (opens GitHub)",
    ]) {
      const a = within(where).getByRole("link", { name });
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("target")).toBe("_blank");
    }
    const printed = Array.from(where.querySelectorAll("[data-print-url]")).map(
      (p) => p.textContent,
    );
    expect(printed.slice(0, 4)).toEqual([
      "https://orizons.xyz/guide/list-your-agent",
      "https://orizons.xyz/demo",
      "https://orizons.xyz/app/ecosystem",
      "https://orizons.xyz/litepaper",
    ]);
  });

  it("gives every link on the page a URL to print", () => {
    const { container } = render(<EvidenceArticle index={fixture()} />);
    const outbound = Array.from(container.querySelectorAll("a")).filter(
      (a) => !a.getAttribute("href")!.startsWith("#"),
    );
    expect(outbound.length).toBeGreaterThan(10);
    for (const a of outbound) {
      const printed = a.parentElement!.querySelector("[data-print-url]");
      expect(printed, a.textContent ?? "").not.toBeNull();
    }
  });

  it("never shows a bare hash as a link's text", () => {
    const { container } = render(<EvidenceArticle index={fixture()} />);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(text(a)).not.toMatch(/^[0-9a-f…]+$/);
      expect(text(a)).not.toMatch(/[0-9a-f]{64}/);
    }
  });
});
