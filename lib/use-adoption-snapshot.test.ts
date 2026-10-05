// @vitest-environment jsdom
/**
 * The adoption snapshot (lib/use-adoption-snapshot.ts): what it keeps, what
 * it refuses to show again, and that broken storage never breaks the page.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EcosystemAdoption } from "./ecosystem";
import {
  ADOPTION_SNAPSHOT_KEY,
  readAdoptionSnapshot,
  saveAdoptionSnapshot,
  useAdoptionSnapshot,
} from "./use-adoption-snapshot";

const adoption: EcosystemAdoption = {
  network: "testnet",
  generated_at: 1_759_046_400,
  targets: {
    external_agents: 2,
    unique_operator_wallets: 2,
    settled_external_workflows: 3,
  },
  totals: {
    external_agents: 1,
    unique_operator_wallets: 1,
    settled_external_workflows: 0,
  },
  met: {
    external_agents: false,
    unique_operator_wallets: false,
    settled_external_workflows: false,
  },
  operators: [],
  excluded: [],
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("adoption snapshot storage", () => {
  it("keeps what it is given and gives it back", () => {
    saveAdoptionSnapshot(adoption);
    expect(readAdoptionSnapshot()).toEqual(adoption);
  });

  it("refuses a snapshot this build cannot read", () => {
    window.localStorage.setItem(
      ADOPTION_SNAPSHOT_KEY,
      JSON.stringify({ ...adoption, met: { external_agents: "false" } }),
    );
    expect(readAdoptionSnapshot()).toBeNull();
    window.localStorage.setItem(ADOPTION_SNAPSHOT_KEY, "{not json");
    expect(readAdoptionSnapshot()).toBeNull();
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readAdoptionSnapshot(broken)).toBeNull();
    expect(() => saveAdoptionSnapshot(adoption, broken)).not.toThrow();
    expect(readAdoptionSnapshot(null)).toBeNull();
  });
});

describe("useAdoptionSnapshot", () => {
  it("offers the stored snapshot after mount", async () => {
    saveAdoptionSnapshot(adoption);
    const { result } = renderHook(() => useAdoptionSnapshot(null));
    await waitFor(() => expect(result.current).toEqual(adoption));
  });

  it("stores each live read as it lands", () => {
    const next = { ...adoption, generated_at: adoption.generated_at + 60 };
    renderHook(({ latest }) => useAdoptionSnapshot(latest), {
      initialProps: { latest: next as EcosystemAdoption | null },
    });
    expect(readAdoptionSnapshot()).toEqual(next);
  });
});
