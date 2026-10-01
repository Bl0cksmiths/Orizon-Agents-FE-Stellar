/**
 * The marketing nav's link config: which link is the current page, and that
 * the sheet and the bar offer the same links.
 */

import { describe, expect, it } from "vitest";
import {
  GUIDE,
  groupIsCurrent,
  isCurrent,
  MENUS,
  PLATFORM,
  RESOURCES,
  SHEET_SECTIONS,
} from "./links";

const byLabel = (label: string) => {
  const link = [...PLATFORM.links, ...RESOURCES.links, GUIDE].find(
    (l) => l.label === label,
  );
  if (!link) throw new Error(`no link ${label}`);
  return link;
};

describe("isCurrent", () => {
  it("marks a page's own link, and every page beneath it", () => {
    expect(isCurrent(byLabel("Evidence"), "/evidence")).toBe(true);
    expect(isCurrent(byLabel("Litepaper"), "/litepaper")).toBe(true);
    expect(isCurrent(GUIDE, "/guide/list-your-agent")).toBe(true);
    expect(isCurrent(GUIDE, "/guide")).toBe(true);
  });

  it("does not mark a page that only shares a prefix", () => {
    expect(isCurrent(byLabel("Evidence"), "/evidence-old")).toBe(false);
    expect(isCurrent(GUIDE, "/guides")).toBe(false);
  });

  it("never marks the home page's section links", () => {
    for (const link of PLATFORM.links) {
      expect(isCurrent(link, "/")).toBe(false);
      expect(link.href.startsWith("/#")).toBe(true);
    }
  });

  it("marks nothing without a pathname", () => {
    expect(isCurrent(GUIDE, null)).toBe(false);
  });
});

describe("groupIsCurrent", () => {
  it("is true for the menu holding the current page only", () => {
    expect(groupIsCurrent(RESOURCES, "/litepaper")).toBe(true);
    expect(groupIsCurrent(PLATFORM, "/litepaper")).toBe(false);
    expect(groupIsCurrent(RESOURCES, "/")).toBe(false);
  });
});

describe("the bar and the sheet", () => {
  it("offer the same links, with the Guide leading the sheet's resources", () => {
    const bar = [...MENUS.flatMap((g) => g.links), GUIDE].map((l) => l.href);
    const sheet = SHEET_SECTIONS.flatMap((g) => g.links).map((l) => l.href);
    expect([...sheet].sort()).toEqual([...bar].sort());
    expect(SHEET_SECTIONS[1].links[0]).toBe(GUIDE);
  });

  it("gives every link a one-line description", () => {
    for (const link of SHEET_SECTIONS.flatMap((g) => g.links)) {
      expect(link.description.length).toBeGreaterThan(10);
      expect(link.description).not.toMatch(/\n/);
    }
  });
});
