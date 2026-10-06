// @vitest-environment jsdom
/**
 * The agents page's freshness (story 5.01 AC2: "the score falls as seen on
 * the agents page"): coming back to the tab re-reads anything older than
 * five seconds, the page dates what it shows, and Refresh reads at once.
 * Everything else on the page has suites of its own; this stubs around it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const { api } = vi.hoisted(() => ({
  api: {
    listAgentsPage: vi.fn(),
    listAgentsWithSync: vi.fn(),
    listReputation: vi.fn(),
  },
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));
vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({ connected: false, address: null }),
}));
vi.mock("./use-binding-status", () => ({
  useBindingStatus: () => ({ stateOf: () => undefined }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AgentsPage from "./page";

const AGENT = {
  id: "agt_01h8",
  name: "copywrite.v3",
  skills: ["copy"],
  price: 0.012,
  rep: 4.9,
  status: "online",
  runs: 3,
  source: "seeded",
  bound: null,
};
const BATCH = { reputations: {}, floor_bps: 5500, prior_bps: 7000 };

/** The registry as a server that does not page answers `?limit=`: all of
 * it, no total — the shape the test fixtures and a direct backend give. */
const unpaged = (agents: object[]) => ({
  agents,
  paged: false,
  total: null,
  nextCursor: null,
  signal: "unknown",
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.listAgentsPage.mockResolvedValue(unpaged([AGENT]));
  api.listReputation.mockResolvedValue(BATCH);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const focus = () =>
  act(async () => {
    window.dispatchEvent(new Event("focus"));
  });

describe("AgentsPage — freshness", () => {
  it("dates the reading on screen once one has landed", async () => {
    render(<AgentsPage />);
    const stamp = await screen.findByText(/^updated/i);
    expect(stamp.querySelector("time")?.getAttribute("dateTime")).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("re-reads on return to the tab once the reading is five seconds old", async () => {
    render(<AgentsPage />);
    await screen.findByText(/^updated/i);
    expect(api.listReputation).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    await focus();
    expect(api.listReputation).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await focus();
    await waitFor(() => expect(api.listReputation).toHaveBeenCalledTimes(2));
    expect(api.listAgentsPage).toHaveBeenCalledTimes(2);
  });

  it("reads both again at once on Refresh", async () => {
    render(<AgentsPage />);
    await screen.findByText(/^updated/i);
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(api.listAgentsPage).toHaveBeenCalledTimes(2));
    expect(api.listReputation).toHaveBeenCalledTimes(2);
  });
});

describe("AgentsPage — rows named by agent", () => {
  // Two agents sharing a name: the id kept in each row header's name is what
  // still tells them apart once there is no id column to read it from.
  const TWIN = { ...AGENT, id: "agt_02k4" };

  it("has no id column", async () => {
    render(<AgentsPage />);
    await screen.findAllByRole("rowheader");
    const headers = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim());
    expect(headers).not.toContain("id");
    expect(headers[0]).toBe("agent");
  });

  it("heads each row with the agent's name and its id", async () => {
    api.listAgentsPage.mockResolvedValue(unpaged([AGENT, TWIN]));
    render(<AgentsPage />);
    expect(await screen.findAllByRole("rowheader")).toHaveLength(2);
    expect(
      screen.getByRole("rowheader", { name: "copywrite.v3 (id: agt_01h8)" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("rowheader", { name: "copywrite.v3 (id: agt_02k4)" }),
    ).toBeTruthy();
  });

  it("keeps the id on the name's title and in screen-reader text", async () => {
    render(<AgentsPage />);
    const header = await screen.findByRole("rowheader");
    const name = header.querySelector('[title="id: agt_01h8"]');
    expect(name?.textContent).toBe("copywrite.v3 (id: agt_01h8)");
    expect(name?.querySelector(".sr-only")?.textContent).toBe("(id: agt_01h8)");
  });
});

describe("AgentsPage — the registry a page at a time", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...AGENT,
      id: `bulk_${i}`,
      name: `Bulk ${i}`,
    }));

  it("paints the first page, then reads the whole registry once", async () => {
    const all = many(120);
    api.listAgentsPage.mockResolvedValue({
      agents: all.slice(0, 50),
      paged: true,
      total: 120,
      nextCursor: "50",
      signal: "synced",
    });
    let finish!: (v: object) => void;
    api.listAgentsWithSync.mockReturnValue(
      new Promise((r) => {
        finish = r;
      }),
    );
    render(<AgentsPage />);
    expect(await screen.findAllByRole("rowheader")).toHaveLength(50);
    expect(api.listAgentsPage).toHaveBeenCalledWith(
      { limit: 50 },
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/loading the rest of the registry/i)).toBeTruthy();

    await act(async () => {
      finish({ agents: all, signal: "synced", readAt: null });
    });
    expect(api.listAgentsWithSync).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("rowheader")).toHaveLength(50);
    expect(screen.getByText("Showing 50 of 120 agents")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("rowheader")).toHaveLength(100);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByRole("rowheader")).toHaveLength(120);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("never states a registry count the registry has not called complete", async () => {
    api.listAgentsPage.mockResolvedValue({
      agents: many(50),
      paged: true,
      total: 266,
      nextCursor: "50",
      signal: "syncing",
    });
    api.listAgentsWithSync.mockResolvedValue({
      agents: many(266),
      signal: "syncing",
      readAt: null,
    });
    render(<AgentsPage />);
    await screen.findByText("Showing 50 agents");
    expect(document.body.textContent).not.toContain("266");
  });

  it("reads once from a server that does not page", async () => {
    api.listAgentsPage.mockResolvedValue(unpaged(many(60)));
    render(<AgentsPage />);
    expect(await screen.findAllByRole("rowheader")).toHaveLength(50);
    expect(api.listAgentsWithSync).not.toHaveBeenCalled();
    expect(screen.getByText("Showing 50 agents")).toBeTruthy();
  });

  it("starts the window over on a new search", async () => {
    api.listAgentsPage.mockResolvedValue(unpaged(many(120)));
    render(<AgentsPage />);
    await screen.findAllByRole("rowheader");
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByRole("rowheader")).toHaveLength(120);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "bulk" },
    });
    expect(screen.getAllByRole("rowheader")).toHaveLength(50);
  });

  it("shows the waking line, not an error, while the backend wakes", async () => {
    api.listAgentsPage.mockRejectedValue(
      new Error(
        "GET /agents → 503 — the backend is waking up — this usually takes under a minute",
      ),
    );
    render(<AgentsPage />);
    await waitFor(() => expect(api.listAgentsPage).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("[data-wake-status]")).not.toBeNull();
  });
});
