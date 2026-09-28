// @vitest-environment jsdom
/**
 * Unit tests for OnboardingChecklist.
 *
 * What an operator on a call needs from this panel is narrow and exact: every
 * step's status in words (never colour or glyph alone), the first step that is
 * not done called out as "Next", a link to the page that fixes it, and a
 * re-check that says what it found — including when the backend handed back
 * its cached answer. Each of those is asserted directly.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const { getAgentReadiness } = vi.hoisted(() => ({
  getAgentReadiness: vi.fn(),
}));
vi.mock("@/lib/readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/readiness")>()),
  getAgentReadiness,
}));

import {
  READINESS_STEP_KEYS,
  formatCheckedAt,
  type AgentReadiness,
} from "@/lib/readiness";
import { OnboardingChecklist } from "./onboarding-checklist";

const AGENT = "weather_bot";
const CHECKED = 1_759_046_400;
const TX = "9f2c41a8b7e04d5c8a1b2c3d4e5f60719f2c41a8b7e04d5c8a1b2c3d4e5f6071";
/** Not retried by useFetch, so the assertions never race a backoff timer. */
const HARD_FAILURE = "malformed response from /agents/weather_bot/readiness";

function readiness(
  statuses: Partial<Record<string, string>> = {},
  over: Partial<AgentReadiness> = {},
): AgentReadiness {
  return {
    agent_id: AGENT,
    checked_at: CHECKED,
    ready: false,
    steps: READINESS_STEP_KEYS.map((key) => ({
      key,
      status: statuses[key] ?? "done",
      detail: `${key} detail`,
      action: statuses[key] && statuses[key] !== "done" ? `fix ${key}` : null,
      evidence: null,
    })),
    ...over,
  };
}

function renderChecklist() {
  return render(<OnboardingChecklist agentId={AGENT} />);
}

const steps = () =>
  within(
    screen.getByRole("list", { name: `Onboarding steps for ${AGENT}` }),
  ).getAllByRole("listitem");

const liveRegion = () =>
  screen
    .getAllByRole("status")
    .find((el) => el.getAttribute("aria-live") === "polite")!;

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

afterEach(() => {
  cleanup();
  getAgentReadiness.mockReset();
});

describe("OnboardingChecklist — before an answer", () => {
  it("announces the check and lists no step while it is in flight", () => {
    getAgentReadiness.mockReturnValue(new Promise(() => {}));
    renderChecklist();
    expect(screen.getAllByRole("status").map((el) => el.textContent)).toContain(
      `Checking onboarding for ${AGENT}…`,
    );
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("reports a failed check as our failure, with a retry", async () => {
    getAgentReadiness.mockRejectedValue(new Error(HARD_FAILURE));
    renderChecklist();
    const alert = await screen.findByRole("alert");
    expect(text(alert)).toContain(
      `Could not check onboarding for ${AGENT}. That is a fact about our request, not about your agent.`,
    );
    expect(screen.queryByRole("list")).toBeNull();

    getAgentReadiness.mockResolvedValue(readiness());
    fireEvent.click(within(alert).getByRole("button", { name: "retry" }));
    await screen.findByRole("list");
    expect(getAgentReadiness).toHaveBeenCalledTimes(2);
  });
});

describe("OnboardingChecklist — the steps", () => {
  it("lists all seven, numbered and in order", async () => {
    getAgentReadiness.mockResolvedValue(readiness());
    renderChecklist();
    await screen.findByRole("list");
    expect(
      steps().map((li) => /\d\. [A-Za-z -]+?(?=Done)/.exec(text(li))?.[0]),
    ).toEqual([
      "1. Registered on-chain",
      "2. Active",
      "3. Endpoint bound",
      "4. Endpoint reachable",
      "5. Routable",
      "6. First workflow run",
      "7. First settlement",
    ]);
  });

  it.each([
    ["done", "Done", "✓"],
    ["todo", "To do", "–"],
    ["failed", "Failed", "✕"],
    ["unknown", "Couldn't check", "?"],
    ["pending", "Couldn't check", "?"],
  ])(
    "says %s in words, with the glyph hidden from screen readers",
    async (status, words, glyph) => {
      getAgentReadiness.mockResolvedValue(readiness({ bound: status }));
      renderChecklist();
      await screen.findByRole("list");
      const li = steps()[2];
      expect(text(li)).toContain(`3. Endpoint bound${words}`);
      const icon = li.querySelector('[aria-hidden="true"]');
      expect(icon?.textContent).toBe(glyph);
    },
  );

  it("never reads an unknown status as done", async () => {
    getAgentReadiness.mockResolvedValue(readiness({ registered: "complete" }));
    renderChecklist();
    await screen.findByRole("list");
    expect(text(steps()[0])).not.toContain("Done");
    expect(text(screen.getByText(/^Next:/).parentElement!)).toContain(
      "Next: Registered on-chain (Couldn't check)",
    );
  });

  it("shows the detail, and the action only on a step not yet done", async () => {
    const r = readiness({ bound: "todo" });
    // An action the backend left on a finished step is stale advice.
    r.steps[0].action = "register the agent";
    getAgentReadiness.mockResolvedValue(r);
    renderChecklist();
    await screen.findByRole("list");
    expect(text(steps()[2])).toContain("bound detail");
    expect(text(steps()[2])).toContain("To do: fix bound");
    expect(text(steps()[0])).not.toContain("To do:");
  });

  it("links a step to the page that fixes it, and a finished step to nothing", async () => {
    getAgentReadiness.mockResolvedValue(
      readiness({ registered: "done", bound: "todo", routable: "failed" }),
    );
    renderChecklist();
    await screen.findByRole("list");
    const bindLink = within(steps()[2]).getByRole("link", {
      name: "Open Bind",
    });
    expect(bindLink.getAttribute("href")).toBe("/app/bind?agent=weather_bot");
    expect(
      within(steps()[4])
        .getByRole("link", { name: "Open the marketplace" })
        .getAttribute("href"),
    ).toBe("/app/agents");
    expect(within(steps()[0]).queryByRole("link")).toBeNull();
  });

  it("links a step's on-chain evidence", async () => {
    const r = readiness();
    r.steps[0].evidence = { tx_hash: TX };
    getAgentReadiness.mockResolvedValue(r);
    renderChecklist();
    await screen.findByRole("list");
    const link = within(steps()[0]).getByRole("link");
    expect(link.getAttribute("href")).toBe(
      `https://stellar.expert/explorer/testnet/tx/${TX}`,
    );
    expect(text(link)).toContain("tx 9f2c41a8…");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("OnboardingChecklist — the next step", () => {
  it("is the first step not done, even when a later one failed", async () => {
    getAgentReadiness.mockResolvedValue(
      readiness({ bound: "todo", reachable: "failed", first_run: "todo" }),
    );
    renderChecklist();
    await screen.findByRole("list");
    const box = screen.getByText(/^Next:/).closest("div")!;
    expect(text(box)).toContain("Next: Endpoint bound (To do)");
    expect(text(box)).toContain("fix bound");
    expect(
      within(box).getByRole("link", { name: "Open Bind" }).getAttribute("href"),
    ).toBe("/app/bind?agent=weather_bot");
    expect(steps()[2].getAttribute("aria-current")).toBe("step");
    expect(
      steps().filter((li) => li.getAttribute("aria-current") === "step"),
    ).toHaveLength(1);
  });

  it("falls back to the detail when the step carries no action", async () => {
    const r = readiness({ active: "failed" });
    r.steps[1].action = null;
    getAgentReadiness.mockResolvedValue(r);
    renderChecklist();
    await screen.findByRole("list");
    const box = screen.getByText(/^Next:/).closest("div")!;
    expect(text(box)).toContain("active detail");
    expect(within(box).queryByRole("link")).toBeNull();
  });

  it("says so when every step is done", async () => {
    getAgentReadiness.mockResolvedValue(readiness({}, { ready: true }));
    renderChecklist();
    await screen.findByRole("list");
    expect(screen.queryByText(/^Next:/)).toBeNull();
    expect(screen.getByText(/All 7 steps done\./)).toBeTruthy();
    expect(
      steps().some((li) => li.getAttribute("aria-current") === "step"),
    ).toBe(false);
  });
});

describe("OnboardingChecklist — ready", () => {
  it.each([
    [true, "Ready to be routed"],
    [false, "Not ready to be routed"],
  ])("ready=%s reads %j", async (ready, words) => {
    getAgentReadiness.mockResolvedValue(readiness({}, { ready }));
    renderChecklist();
    await screen.findByRole("list");
    expect(screen.getByText(words)).toBeTruthy();
  });
});

describe("OnboardingChecklist — re-check", () => {
  it("stamps the check time and explains the backend cache", async () => {
    getAgentReadiness.mockResolvedValue(readiness());
    renderChecklist();
    await screen.findByRole("list");
    expect(text(document.body)).toContain(
      `checked ${formatCheckedAt(CHECKED)}`,
    );
    expect(text(document.body)).toContain(
      "The backend caches this check for about 30 seconds, so a step you just fixed can take that long to show as done.",
    );
  });

  it("is silent at load, then announces exactly what the re-check found", async () => {
    getAgentReadiness.mockResolvedValue(readiness({ bound: "todo" }));
    renderChecklist();
    await screen.findByRole("list");
    expect(liveRegion().textContent).toBe("");

    getAgentReadiness.mockResolvedValue(
      readiness({ reachable: "todo" }, { checked_at: CHECKED + 45 }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Re-check onboarding for ${AGENT}` }),
    );
    await waitFor(() =>
      expect(liveRegion().textContent).toBe(
        "Re-checked weather_bot: 6 of 7 steps done. Next: Endpoint reachable.",
      ),
    );
    expect(getAgentReadiness).toHaveBeenCalledTimes(2);
    expect(text(document.body)).toContain(
      `checked ${formatCheckedAt(CHECKED + 45)}`,
    );
    expect(text(steps()[2])).toContain("Done");
  });

  it("says the backend served its cached check when nothing moved", async () => {
    getAgentReadiness.mockResolvedValue(readiness({ bound: "todo" }));
    renderChecklist();
    await screen.findByRole("list");
    fireEvent.click(screen.getByRole("button", { name: /Re-check/ }));
    await waitFor(() =>
      expect(liveRegion().textContent).toContain("Same check as before, from"),
    );
  });

  it("disables itself while the re-check is in flight", async () => {
    getAgentReadiness.mockResolvedValue(readiness());
    renderChecklist();
    await screen.findByRole("list");
    getAgentReadiness.mockReturnValue(new Promise(() => {}));
    const button = screen.getByRole("button", { name: /Re-check/ });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));
    expect(text(button)).toContain("Re-checking…");
  });

  it("keeps the last check on screen when a re-check fails, and says so", async () => {
    getAgentReadiness.mockResolvedValue(readiness({ bound: "todo" }));
    renderChecklist();
    await screen.findByRole("list");
    getAgentReadiness.mockRejectedValue(new Error("GET → 503 — rpc down"));
    fireEvent.click(screen.getByRole("button", { name: /Re-check/ }));
    const alert = await screen.findByRole("alert");
    expect(text(alert)).toContain(
      `Re-check failed for ${AGENT}. Still showing the check from ${formatCheckedAt(CHECKED)}.`,
    );
    expect(text(alert)).toContain("rpc down");
    expect(steps()).toHaveLength(7);
    // Announced once, by the alert — not a second time by the live region.
    expect(liveRegion().textContent).toBe("");
  });
});
