/**
 * The §6.2 checklist suggestion is derived from the items, by one rule:
 * all present → Present; any present or partial → Partial; none → Missing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checklistRows,
  countStatuses,
  describeCounts,
  metCount,
  metricsHeadline,
  suggestMarking,
} from "./checklist";
import type { EvidenceIndex, ItemStatus } from "./types";

const items = (...statuses: ItemStatus[]) =>
  statuses.map((status) => ({ status }));

describe("suggestMarking", () => {
  it("is Present when every item is present", () => {
    expect(suggestMarking(items("present"))).toBe("present");
    expect(suggestMarking(items("present", "present", "present"))).toBe(
      "present",
    );
  });

  it("is Partial when some but not all are present", () => {
    expect(suggestMarking(items("present", "missing"))).toBe("partial");
    expect(suggestMarking(items("missing", "present", "partial"))).toBe(
      "partial",
    );
  });

  it("is Partial when only partial items stand in for proof", () => {
    expect(suggestMarking(items("partial"))).toBe("partial");
    expect(suggestMarking(items("partial", "missing", "missing"))).toBe(
      "partial",
    );
  });

  it("is Missing when nothing is present or partial", () => {
    expect(suggestMarking(items("missing"))).toBe("missing");
    expect(suggestMarking(items("missing", "missing"))).toBe("missing");
  });

  it("is Missing, not Present, with no items at all", () => {
    expect(suggestMarking([])).toBe("missing");
  });
});

describe("counts", () => {
  it("counts each status and says so in words", () => {
    const counts = countStatuses(
      items("present", "partial", "missing", "missing"),
    );
    expect(counts).toEqual({ present: 1, partial: 1, missing: 2 });
    expect(describeCounts(counts)).toBe(
      "1 present, 1 partial, 2 missing (of 4)",
    );
  });
});

describe("checklistRows", () => {
  const fixture: EvidenceIndex = JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../../test/fixtures/evidence/index.json"),
      "utf8",
    ),
  );

  it("suggests one marking per §6.2 row, in order", () => {
    expect(
      checklistRows(fixture.deliverables).map((r) => [r.row, r.marking]),
    ).toEqual([
      ["Deliverable 1", "present"],
      ["Deliverable 2", "partial"],
      ["Deliverable 3", "missing"],
      ["Deliverable 4", "partial"],
      ["Repositories & Deployments", "present"],
    ]);
  });

  it("follows the items when they change", () => {
    const d = structuredClone(fixture.deliverables);
    d[2].items[0].status = "present";
    expect(checklistRows(d)[2].marking).toBe("partial");
    d[2].items.forEach((i) => (i.status = "present"));
    expect(checklistRows(d)[2].marking).toBe("present");
  });

  it("counts the metrics met", () => {
    expect(metCount(fixture.metrics)).toBe(7);
  });

  it("heads the metrics with the count met out of the rows shown", () => {
    expect(metricsHeadline(fixture.metrics)).toBe(
      `7 of ${fixture.metrics.length} metrics met`,
    );
    expect(
      metricsHeadline([
        { status: "met" },
        { status: "not_met" },
        { status: "met" },
      ]),
    ).toBe("2 of 3 metrics met");
    expect(metricsHeadline([])).toBe("0 of 0 metrics met");
  });
});
