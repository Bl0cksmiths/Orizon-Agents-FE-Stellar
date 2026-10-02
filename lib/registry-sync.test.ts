/**
 * The complete-or-partial decision for each signal: the overview's flag, the
 * agents header, and the interim two-read rule used only when neither
 * exists.
 */
import { describe, expect, it } from "vitest";

import {
  INTERIM_READ_GAP_MS,
  InterimCountTracker,
  headerSyncSignal,
  interimAgrees,
  overviewSyncSignal,
} from "./registry-sync";

describe("overviewSyncSignal", () => {
  it("is synced only on registry_synced: true", () => {
    expect(overviewSyncSignal({ registry_synced: true })).toBe("synced");
  });

  it("is syncing on registry_synced: false", () => {
    expect(overviewSyncSignal({ registry_synced: false })).toBe("syncing");
  });

  it("says nothing when the backend predates the flag", () => {
    expect(overviewSyncSignal({})).toBe("unknown");
  });
});

describe("headerSyncSignal", () => {
  const h = (v?: string) =>
    new Headers(v === undefined ? {} : { "x-registry-synced": v });

  it("reads true and false, in any case and spacing", () => {
    expect(headerSyncSignal(h("true"))).toBe("synced");
    expect(headerSyncSignal(h(" TRUE "))).toBe("synced");
    expect(headerSyncSignal(h("false"))).toBe("syncing");
    expect(headerSyncSignal(h("False"))).toBe("syncing");
  });

  it("says nothing when the header is absent or unreadable", () => {
    expect(headerSyncSignal(h())).toBe("unknown");
    expect(headerSyncSignal(h("1"))).toBe("unknown");
    expect(headerSyncSignal(h(""))).toBe("unknown");
  });
});

describe("interimAgrees — the rule for a backend with no signal", () => {
  const at = (count: number, ms: number) => ({ count, at: ms });

  it("confirms two equal counts read the gap apart", () => {
    expect(interimAgrees(at(278, 0), at(278, INTERIM_READ_GAP_MS))).toBe(true);
  });

  it("rejects a mid-refill count that grew between the reads", () => {
    expect(interimAgrees(at(226, 0), at(266, INTERIM_READ_GAP_MS))).toBe(false);
  });

  it("rejects a count that shrank: the backend restarted between the reads", () => {
    expect(interimAgrees(at(278, 0), at(31, INTERIM_READ_GAP_MS))).toBe(false);
  });

  it("rejects equal counts read too close together", () => {
    expect(interimAgrees(at(31, 0), at(31, INTERIM_READ_GAP_MS - 1))).toBe(
      false,
    );
  });
});

describe("InterimCountTracker — the rule over a console's polls", () => {
  it("confirms a count only once it has held for the gap", () => {
    const t = new InterimCountTracker();
    expect(t.observe({ count: 278, at: 0 })).toBe(false);
    expect(t.observe({ count: 278, at: 5_000 })).toBe(false);
    expect(t.observe({ count: 278, at: INTERIM_READ_GAP_MS })).toBe(true);
    expect(t.observe({ count: 278, at: 60_000 })).toBe(true);
  });

  it("never confirms a refill in progress, and restarts on every change", () => {
    const t = new InterimCountTracker();
    expect(t.observe({ count: 31, at: 0 })).toBe(false);
    expect(t.observe({ count: 226, at: 15_000 })).toBe(false);
    expect(t.observe({ count: 266, at: 30_000 })).toBe(false);
    expect(t.observe({ count: 278, at: 45_000 })).toBe(false);
    expect(t.observe({ count: 278, at: 50_000 })).toBe(false);
    expect(t.observe({ count: 278, at: 55_000 })).toBe(true);
    // A restart: the count drops, and the run starts over.
    expect(t.observe({ count: 12, at: 70_000 })).toBe(false);
  });

  it("does not let an older sample extend a newer run", () => {
    const t = new InterimCountTracker();
    t.observe({ count: 278, at: 20_000 });
    expect(t.observe({ count: 278, at: 0 })).toBe(false);
    expect(t.observe({ count: 278, at: 9_999 })).toBe(false);
  });

  it("forgets its run on reset", () => {
    const t = new InterimCountTracker();
    t.observe({ count: 278, at: 0 });
    t.reset();
    expect(t.observe({ count: 278, at: INTERIM_READ_GAP_MS })).toBe(false);
  });
});
