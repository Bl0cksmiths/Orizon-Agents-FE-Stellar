// @vitest-environment jsdom
/**
 * Unit tests for the Ecosystem page and its AdoptionView.
 *
 * The page is evidence for SOW §6.3, so the tests are mostly about what it
 * must not claim: a missed target reading as anything but a miss, a
 * disagreeing "met" flag turning a miss into a success, a team wallet's
 * payment passing as an outsider's, a partial read passing as a zero, and a
 * failed read passing as "no operators". Each is asserted directly.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

const { getEcosystemAdoption, getStellarNetwork } = vi.hoisted(() => ({
  getEcosystemAdoption: vi.fn(),
  // Unanswered unless a test says otherwise: the asset is then unknown.
  getStellarNetwork: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getStellarNetwork,
}));
vi.mock("@/lib/ecosystem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ecosystem")>()),
  getEcosystemAdoption,
}));

import { OPERATOR_DOCS_URL, type EcosystemAdoption } from "@/lib/ecosystem";
import { AdoptionView } from "./adoption-view";
import EcosystemPage from "./page";

const TEAM = "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLETEAMXXXXXXXXXX";
const OUTSIDER = "GBOUTSIDERQKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEOUTXXXXXXXXX";
const BUYER = "GBUYER4H6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLECUSTOMERXXXXX";
const TX = "cd".repeat(32);
const HARD_FAILURE = "malformed response from /ecosystem/adoption";

function zero(over: Partial<EcosystemAdoption> = {}): EcosystemAdoption {
  return {
    network: "testnet",
    generated_at: 1_759_046_400,
    targets: {
      external_agents: 2,
      unique_operator_wallets: 2,
      settled_external_workflows: 3,
    },
    totals: {
      external_agents: 0,
      unique_operator_wallets: 0,
      settled_external_workflows: 0,
    },
    met: {
      external_agents: false,
      unique_operator_wallets: false,
      settled_external_workflows: false,
    },
    operators: [],
    excluded: [
      {
        owner: TEAM,
        owner_explorer: `https://stellar.expert/explorer/testnet/account/${TEAM}`,
        reason: "platform_key",
        role: "settler and scorer",
        agent_ids: ["code.gen", "seo.brief"],
      },
    ],
    degraded: false,
    unreadable_agents: [],
    ...over,
  };
}

function withOperator(payers: string[]): EcosystemAdoption {
  return zero({
    totals: {
      external_agents: 2,
      unique_operator_wallets: 1,
      settled_external_workflows: payers.length,
    },
    met: {
      external_agents: true,
      unique_operator_wallets: false,
      settled_external_workflows: false,
    },
    operators: [
      {
        owner: OUTSIDER,
        owner_explorer: null,
        agents: [
          {
            agent_id: "ext.translate",
            name: "Translator",
            active: true,
            bound: false,
            settled_workflows: payers.map((payer, i) => ({
              job_id_hex: `${i}`.repeat(32),
              tx_hash: TX,
              explorer: null,
              amount_usdc: 0.01,
              payer,
              settled_at: 1_759_046_400,
            })),
          },
          {
            agent_id: "ext.idle",
            name: null,
            active: null,
            bound: null,
            settled_workflows: [],
          },
        ],
      },
    ],
  });
}

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

/** One target's list item, found by its heading. */
function target(label: string): HTMLElement {
  return screen.getByRole("heading", { name: label }).closest("li")!;
}

afterEach(() => {
  cleanup();
  getEcosystemAdoption.mockReset();
  getStellarNetwork.mockImplementation(() => new Promise(() => {}));
});

describe("AdoptionView — the targets", () => {
  it("states today's zeros as three plain misses", () => {
    render(<AdoptionView adoption={zero()} />);
    expect(text(document.body)).toContain("0 of 3 targets met.");
    expect(text(target("Externally operated agents"))).toContain(
      "✕ Not met: 0 of 2, short by 2.",
    );
    expect(text(target("Unique operator wallets"))).toContain(
      "Not met: 0 of 2, short by 2.",
    );
    expect(
      text(target("Workflows routed to external agents and settled")),
    ).toContain("Not met: 0 of 3, short by 3.");
  });

  it("draws no progress bar and never softens a miss", () => {
    render(<AdoptionView adoption={zero()} />);
    expect(document.querySelector("progress, [role='progressbar']")).toBeNull();
    expect(text(document.body)).not.toMatch(/almost|nearly|on track/i);
  });

  it("states a met target as met", () => {
    render(<AdoptionView adoption={withOperator([BUYER])} />);
    expect(text(target("Externally operated agents"))).toContain(
      "✓ Met: 2 of 2.",
    );
    expect(text(document.body)).toContain("1 of 3 targets met.");
  });

  it("reads a met flag the numbers contradict as the miss they show", () => {
    render(
      <AdoptionView
        adoption={zero({
          met: { ...zero().met, unique_operator_wallets: true },
        })}
      />,
    );
    expect(text(target("Unique operator wallets"))).toContain(
      "Not met: 0 of 2, short by 2.",
    );
    expect(text(document.body)).toContain("0 of 3 targets met.");
  });
});

describe("AdoptionView — a partial read", () => {
  it("says how many agents it could not verify, never zero", () => {
    render(
      <AdoptionView
        adoption={zero({
          degraded: true,
          unreadable_agents: ["a.one", "b.two"],
        })}
      />,
    );
    expect(text(document.body)).toContain(
      "Couldn't verify 2 agents right now. Whatever they would add is missing from the figures below until they can be read again — a gap, not a zero.",
    );
    expect(text(document.body)).toContain("Not verified: a.one, b.two");
    expect(text(target("Externally operated agents"))).toContain(
      "May be incomplete",
    );
  });

  it("still speaks when degraded without naming anyone", () => {
    render(<AdoptionView adoption={zero({ degraded: true })} />);
    expect(text(document.body)).toContain(
      "Couldn't verify every agent right now.",
    );
  });

  it("is silent about verification when the read was whole", () => {
    render(<AdoptionView adoption={zero()} />);
    expect(text(document.body)).not.toContain("Couldn't verify");
    expect(text(document.body)).not.toContain("May be incomplete");
  });
});

describe("AdoptionView — external operators", () => {
  it("gives an empty list honest copy, the register link and the docs", () => {
    render(<AdoptionView adoption={zero()} />);
    const heading = screen.getByRole("heading", {
      name: "No external operators yet",
    });
    const card = heading.parentElement!;
    expect(text(card)).toContain(
      "Nobody outside the Blocksmiths operates an agent on Orizon yet. Every agent registered today belongs to a wallet we control, and those are listed below, not counted.",
    );
    expect(
      within(card)
        .getByRole("link", { name: "Register an agent" })
        .getAttribute("href"),
    ).toBe("/app/register");
    expect(
      within(card)
        .getByRole("link", { name: /Read the operator docs/ })
        .getAttribute("href"),
    ).toBe(OPERATOR_DOCS_URL);
  });

  it("does not mention excluded wallets when there are none", () => {
    render(<AdoptionView adoption={zero({ excluded: [] })} />);
    expect(text(document.body)).toContain(
      "No agent on the registry is owned by an outside wallet.",
    );
    expect(text(document.body)).toContain(
      "No wallet was excluded in this read.",
    );
  });

  it("links the operator's wallet and badges each agent in words", () => {
    render(<AdoptionView adoption={withOperator([BUYER])} />);
    const heading = screen.getByRole("heading", {
      name: /^Operator GBOU…XXXX/,
    });
    expect(within(heading).getByRole("link").getAttribute("href")).toBe(
      `https://stellar.expert/explorer/testnet/account/${OUTSIDER}`,
    );
    const translator = screen
      .getByRole("heading", { name: "Translator" })
      .closest("li")!;
    expect(text(translator)).toContain("active");
    expect(text(translator)).not.toContain("inactive");
    expect(text(translator)).toContain("unbound");
    // A name the backend did not send falls back to the id, and a flag it
    // did not send is said to be unknown — not "inactive".
    const idle = screen
      .getByRole("heading", { name: "ext.idle" })
      .closest("li")!;
    expect(text(idle)).toContain("activity unknown");
    expect(text(idle)).toContain("binding unknown");
    expect(text(idle)).toContain("No settled workflows yet.");
  });

  it("lists each settled workflow with its tx link and payer", () => {
    render(<AdoptionView adoption={withOperator([BUYER])} asset="native" />);
    const table = screen.getByRole("table", {
      name: "Settled workflows for ext.translate",
    });
    const [row] = within(table).getAllByRole("row").slice(1);
    // Testnet settles in native XLM, whatever the wire field is called.
    expect(text(row)).toContain("0.01 XLM");
    expect(text(row)).not.toContain("USDC");
    expect(text(row)).toContain("GBUY…XXXX");
    const tx = within(row).getByRole("link", { name: /^tx cdcdcdcd…/ });
    expect(tx.getAttribute("href")).toBe(
      `https://stellar.expert/explorer/testnet/tx/${TX}`,
    );
    expect(text(row)).not.toContain("team-funded");
  });

  it("labels a team payer with the role the backend sends", () => {
    const a = withOperator([BUYER, BUYER]);
    const [outside, team] = a.operators[0].agents[0].settled_workflows;
    outside.payer_team_role = null;
    team.payer_team_role = "developer";
    render(<AdoptionView adoption={a} />);
    const rows = within(
      screen.getByRole("table", {
        name: "Settled workflows for ext.translate",
      }),
    )
      .getAllByRole("row")
      .slice(1);
    expect(text(rows[0])).not.toContain("team-funded");
    expect(text(rows[1])).toContain(
      "team-funded: developer — paid by a wallet we control",
    );
  });

  it("falls back to the excluded list when the backend sends no role field", () => {
    render(<AdoptionView adoption={withOperator([BUYER, TEAM])} />);
    const rows = within(
      screen.getByRole("table", {
        name: "Settled workflows for ext.translate",
      }),
    )
      .getAllByRole("row")
      .slice(1);
    expect(text(rows[0])).not.toContain("team-funded");
    expect(text(rows[1])).toContain(
      "team-funded: settler and scorer — paid by a wallet we control",
    );
  });
});

describe("AdoptionView — wallets we control", () => {
  it("lists every excluded wallet with its role and reason", () => {
    render(
      <AdoptionView
        adoption={zero({
          excluded: [
            ...zero().excluded,
            {
              owner: OUTSIDER,
              reason: "team_wallet",
              role: null,
              agent_ids: [],
            },
            { owner: BUYER, reason: "audit_key", agent_ids: ["x"] },
          ],
        })}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Wallets we control (not counted)" }),
    ).toBeTruthy();
    const rows = within(
      screen.getByRole("table", {
        name: "Wallets we control, which are not counted",
      }),
    )
      .getAllByRole("row")
      .slice(1);
    expect(rows).toHaveLength(3);
    expect(text(rows[0])).toContain("settler and scorer");
    expect(text(rows[0])).toContain("Platform key");
    expect(text(rows[0])).toContain("code.gen, seo.brief");
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe(
      `https://stellar.expert/explorer/testnet/account/${TEAM}`,
    );
    expect(text(rows[1])).toContain("Team wallet");
    expect(text(rows[1])).toContain("none");
    // A reason this build does not know still excludes the wallet.
    expect(text(rows[2])).toContain("audit key");
  });
});

describe("EcosystemPage — states", () => {
  it("announces the read while it is in flight and claims nothing", () => {
    getEcosystemAdoption.mockReturnValue(new Promise(() => {}));
    render(<EcosystemPage />);
    expect(screen.getByRole("status").textContent).toBe(
      "Loading ecosystem adoption…",
    );
    expect(text(document.body)).not.toContain("No external operators");
    expect(text(document.body)).not.toContain("targets met");
  });

  it("reports a failed read as a failure with a retry, never as no operators", async () => {
    getEcosystemAdoption.mockRejectedValue(new Error(HARD_FAILURE));
    render(<EcosystemPage />);
    const alert = await screen.findByRole("alert");
    expect(text(alert)).toContain(
      "Could not read ecosystem adoption. Nothing below is a count of zero; the figures simply did not arrive.",
    );
    expect(text(document.body)).not.toContain("No external operators");

    getEcosystemAdoption.mockResolvedValue(zero());
    fireEvent.click(within(alert).getByRole("button", { name: "retry" }));
    expect(
      await screen.findByRole("heading", { name: "No external operators yet" }),
    ).toBeTruthy();
  });

  it("labels amounts with the asset the network reports, and with none while it is unknown", async () => {
    getEcosystemAdoption.mockResolvedValue(withOperator([BUYER]));
    render(<EcosystemPage />);
    const table = await screen.findByRole("table", {
      name: "Settled workflows for ext.translate",
    });
    const row = () => within(table).getAllByRole("row")[1];
    expect(text(row())).toContain("0.01");
    expect(text(row())).not.toMatch(/XLM|USDC/);
    cleanup();

    getStellarNetwork.mockResolvedValue({
      network: "testnet",
      network_passphrase: "Test SDF Network ; September 2015",
      rpc_url: "https://soroban-testnet.stellar.org",
      admin: TEAM,
      asset: "native",
      asset_sac: "CDLZ",
      contracts: {},
    } as never);
    render(<EcosystemPage />);
    const again = await screen.findByRole("table", {
      name: "Settled workflows for ext.translate",
    });
    await within(again).findByText(/0\.01 XLM/);
  });

  it("renders the payload once it lands", async () => {
    getEcosystemAdoption.mockResolvedValue(zero());
    render(<EcosystemPage />);
    expect(
      await screen.findByRole("heading", { name: "SOW §6.3 targets" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
