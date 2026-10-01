// @vitest-environment jsdom
/**
 * The settled-workflow chart draws only the measured series, labels its
 * axes with real dates and counts, and says in words when there is nothing
 * to draw — never a flat or invented line.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { REASONS } from "@/lib/network-stats";
import type { SettledDay } from "@/lib/types";
import { SettledChart, formatDay, seriesSummary } from "./settled-chart";

afterEach(cleanup);

/** Sep 19 – Oct 2, 2026: three settled on Oct 1, one on Oct 2. */
const days: SettledDay[] = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 19 + i)).toISOString().slice(0, 10),
  settled: i === 12 ? 3 : i === 13 ? 1 : 0,
}));

describe("formatDay", () => {
  it("reads the date in UTC", () => {
    expect(formatDay("2026-10-02")).toBe("Oct 2");
    expect(formatDay("2026-01-01")).toBe("Jan 1");
  });
});

describe("SettledChart", () => {
  it("draws one bar per day, scaled to the peak, with real axis labels", () => {
    const { container } = render(
      <SettledChart series={{ ok: true, value: days }} />,
    );
    const bars = container.querySelectorAll("g[data-day]");
    expect(bars).toHaveLength(14);

    const height = (date: string) =>
      Number(
        container
          .querySelector(`g[data-day="${date}"] rect:last-of-type`)
          ?.getAttribute("height"),
      );
    expect(height("2026-10-01")).toBeCloseTo(138);
    expect(height("2026-10-02")).toBeCloseTo(46);
    expect(height("2026-09-19")).toBe(0);

    // y: the peak and the baseline; x: the first and last day.
    expect(container.textContent).toContain("Sep 19");
    expect(container.textContent).toContain("Oct 2");
    const yAxis = container.querySelector("svg")?.previousElementSibling;
    expect(
      Array.from(yAxis?.children ?? []).map((el) => el.textContent),
    ).toEqual(["3", "0"]);
  });

  it("describes the chart and carries the data as a table", () => {
    render(<SettledChart series={{ ok: true, value: days }} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Settled workflows per day, Sep 19 to Oct 2: 4 settled workflows in total, at most 3 on Oct 1.",
    );
    const table = screen.getByRole("table", {
      name: "Settled workflows per day",
    });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(14);
    expect(table.textContent).toContain("Oct 13");
  });

  it("says nothing settled instead of drawing a flat line", () => {
    const { container } = render(
      <SettledChart
        series={{ ok: true, value: days.map((d) => ({ ...d, settled: 0 })) }}
      />,
    );
    expect(container.textContent).toBe(
      "No settled workflows in the last 14 days.",
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("treats an empty series as nothing settled in the window", () => {
    const { container } = render(
      <SettledChart series={{ ok: true, value: [] }} />,
    );
    expect(container.textContent).toBe(
      "No settled workflows in the last 14 days.",
    );
  });

  it("gives the reason when the series is not measured", () => {
    const { container } = render(
      <SettledChart
        series={{ ok: false, reason: REASONS.settledUnreported }}
      />,
    );
    expect(container.textContent).toBe(
      `Settled-workflow history unavailable — ${REASONS.settledUnreported}.`,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("seriesSummary", () => {
  it("names a single workflow in the singular", () => {
    expect(
      seriesSummary([
        { date: "2026-10-01", settled: 0 },
        { date: "2026-10-02", settled: 1 },
      ]),
    ).toBe(
      "Settled workflows per day, Oct 1 to Oct 2: 1 settled workflow in total, at most 1 on Oct 2.",
    );
  });
});
