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
    listAgents: vi.fn(),
    listReputation: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => api);
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.listAgents.mockResolvedValue([AGENT]);
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
    expect(api.listAgents).toHaveBeenCalledTimes(2);
  });

  it("reads both again at once on Refresh", async () => {
    render(<AgentsPage />);
    await screen.findByText(/^updated/i);
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(api.listAgents).toHaveBeenCalledTimes(2));
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
    api.listAgents.mockResolvedValue([AGENT, TWIN]);
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
