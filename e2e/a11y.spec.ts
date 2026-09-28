/**
 * Accessibility gate.
 *
 * Runs axe-core against the public marketing page and the console routes a
 * visitor actually lands on, asserting no WCAG 2.0/2.1 A or AA violations.
 * The point is regression protection: the a11y fixes in this repo (focus
 * rings, the inert mobile drawer, landmark structure, tab semantics) were
 * found by hand once, and without a gate they can quietly come back.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { WCAG_TAGS, disputeScan } from "./dispute-axe";
import {
  DISPUTE_WINDOW_S,
  mockApi,
  mockArtifact,
  mockArtifactResponse,
  mockDispute,
  mockDisputeApi,
  mockDisputeTaskId,
  mockReceiptDispute,
  mockRejectionReason,
  mockSettlementSteps,
  mockSettlementView,
  mockTaskReadToken,
  mockTraceStream,
  mockWallet,
  type MockDisputeApiOptions,
} from "./mocks";

const ROUTES = [
  "/",
  "/app",
  "/app/agents",
  "/app/register",
  "/app/bind",
  "/app/operator",
  "/app/ecosystem",
  "/app/reputation",
  "/app/orchestrator",
  "/app/trace",
  "/app/events",
  "/app/send",
  "/app/flow",
  "/app/pdax",
  "/app/wallet",
];

/**
 * What a route has to have rendered before axe looks at it. Without this the
 * sweep of /app/agents ran while the table was still a skeleton: a nameless
 * button on every row passed two runs in three, because axe raced the fetch.
 * The registry rows and the reputation batch (announced by the floor heading)
 * are both on screen before the page is judged.
 */
const READY: Partial<Record<string, (page: Page) => Promise<void>>> = {
  // The environment badge and the balance rows, so the sweep judges the page
  // a PDAX operator sees rather than its loading skeletons.
  "/app/pdax": async (page) => {
    await expect(page.getByText("uat", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("PHP", { exact: true })).toBeVisible();
  },
  "/app/agents": async (page) => {
    await expect(page.getByRole("rowheader")).not.toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Selection floor" }),
    ).toBeVisible();
  },
};

test.describe("accessibility", () => {
  for (const route of ROUTES) {
    test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
      await mockApi(page);
      await page.goto(route);
      await READY[route]?.(page);

      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      // Mapped to readable lines so a failure names the rule and the count
      // instead of dumping the whole axe result object.
      const summary = violations.map(
        (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
      );
      expect(summary).toEqual([]);
    });
  }
});

/**
 * The receipt and the dispute form (story 4.05) exist only on a settled
 * workflow opened with `?task=`. The sweep above visits /app/trace in demo
 * mode, where the receipt renders nothing, so neither state has reached axe
 * there — and they are the two a buyer acts in.
 *
 * One fixture carries every step state at once: a step still disputable, one
 * already disputed with its status badge, and one that was never charged and
 * says why.
 *
 * Every dispute state is judged by `disputeScan`, not a bare `analyze()`:
 * the card's gradient overlay makes axe give up on the contrast of every
 * line of text in the receipt, and a bare scan passed #3a3a3a text.
 */
test.describe("accessibility — the trace page's receipt", () => {
  async function openReceipt(page: Page): Promise<void> {
    const settledAtS = Math.floor(Date.now() / 1000) - 60 * 60;
    await mockTaskReadToken(page);
    await mockWallet(page);
    await mockApi(page);
    await mockTraceStream(page, mockDisputeTaskId);
    await mockDisputeApi(page, {
      settlement: mockSettlementView({ settledAtS }),
      disputes: [
        mockDispute(mockSettlementSteps[0], {
          openedAtS: settledAtS + 600,
          reason: "the outline misses half of the brief",
        }),
      ],
    });
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    // Placed as the payer, not merely drawn: the scan judges the receipt a
    // payer acts in, with its Dispute button, never the anonymous one the
    // page shows until the wallet has restored.
    await expect(
      page
        .getByRole("region", { name: "Receipt" })
        .getByRole("button", { name: /^Dispute step/ }),
    ).toHaveCount(1);
  }

  async function violations(page: Page): Promise<string[]> {
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    return result.violations.map(
      (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
    );
  }

  test("the receipt panel has no WCAG A/AA violations", async ({ page }) => {
    await openReceipt(page);
    expect(await disputeScan(page)).toEqual([]);
  });

  // A workflow that shipped code opens on its artifact tab: the file list,
  // the code viewer and the sandboxed preview, none of which the sweep above
  // reaches. The calculator is the artifact the receipt's `code.gen` step
  // describes.
  test("the artifact a workflow shipped has no WCAG A/AA violations", async ({
    page,
  }) => {
    await mockApi(page, { artifact: mockArtifactResponse });
    await mockTraceStream(page, mockDisputeTaskId);
    await mockDisputeApi(page, {
      settlement: mockSettlementView({
        settledAtS: Math.floor(Date.now() / 1000) - 60 * 60,
      }),
    });
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    const tab = page.getByRole("tab", { name: /artifact/ });
    await expect(tab).toHaveAttribute("aria-selected", "true");
    // The preview view first, as it opens, then the file list.
    await expect(
      page.getByRole("tabpanel", { name: "preview" }).locator("iframe"),
    ).toHaveAttribute("title", mockArtifact.title);
    expect(await violations(page)).toEqual([]);

    await page.getByRole("tab", { name: "files" }).click();
    await expect(
      page.getByText(mockArtifact.files[2].path, { exact: true }).first(),
    ).toBeVisible();
    // The highlighted code, not its loading placeholder: the viewer is a
    // separate chunk, and a scan that raced it passed on the placeholder
    // while the code it then drew failed contrast one run in six.
    await expect(page.getByText("loading viewer…")).toHaveCount(0);
    await expect(page.locator("pre code .token").first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("the open dispute form has no WCAG A/AA violations", async ({
    page,
  }) => {
    await openReceipt(page);
    await page
      .getByRole("region", { name: "Receipt" })
      .getByRole("button", { name: /dispute/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // `disputeScan` waits out the entrance: the panel mounts at opacity 0.
    expect(await disputeScan(page)).toEqual([]);
  });
});

/**
 * The dispute receipt (story 4.06) in its two outcomes — the states a buyer
 * reads most closely, and the ones the evidence recording shows. The sweep
 * above holds only an open dispute, so neither outcome has reached axe there:
 * the refund and rating links, their confirmed states, and the rejection's
 * reason are all drawn only once a dispute resolves.
 */
test.describe("accessibility — the dispute receipt", () => {
  const disputedStep = mockSettlementSteps[1];

  /** Opens the receipt with the one step's dispute resolved as `status`. */
  async function openResolved(
    page: Page,
    status: "credited" | "rejected",
  ): Promise<Locator> {
    const settledAtS = Math.floor(Date.now() / 1000) - 60 * 60;
    await mockTaskReadToken(page);
    await mockWallet(page);
    await mockApi(page);
    await mockTraceStream(page, mockDisputeTaskId);
    await mockDisputeApi(page, {
      settlement: mockSettlementView({ settledAtS }),
      disputes: [
        mockReceiptDispute(disputedStep, {
          status,
          openedAtS: settledAtS + 600,
        }),
      ],
    });
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    const row = page
      .getByRole("region", { name: "Receipt" })
      .getByRole("listitem")
      .filter({ hasText: disputedStep.agent_id });
    await expect(row).toBeVisible();
    return row;
  }

  test("a credited receipt has no WCAG A/AA violations", async ({ page }) => {
    const row = await openResolved(page, "credited");
    // Scanned once the whole outcome is drawn, links and all — not the
    // moment the row appears.
    await expect(row.getByRole("link", { name: /refund/i })).toBeVisible();
    await expect(row.getByRole("link", { name: /rating/i })).toBeVisible();
    expect(await disputeScan(page)).toEqual([]);
  });

  test("a rejected receipt has no WCAG A/AA violations", async ({ page }) => {
    const row = await openResolved(page, "rejected");
    // The reason is the part of this state worth scanning; wait for it.
    await expect(row).toContainText(mockRejectionReason);
    expect(await disputeScan(page)).toEqual([]);
  });
});

/**
 * Every other state the dispute UI can be drawn in. The sweeps above hold a
 * receipt with an open dispute, the empty form and two resolved outcomes; an
 * image with no alt text injected into the dialog's done view, its error
 * state or an upheld receipt passed all of them, because none of those states
 * was ever put in front of axe.
 */
test.describe("accessibility — every dispute state", () => {
  const [, codeStep] = mockSettlementSteps;
  const nowS = () => Math.floor(Date.now() / 1000);
  const receipt = (page: Page) => page.getByRole("region", { name: "Receipt" });

  async function open(
    page: Page,
    api: MockDisputeApiOptions,
    {
      wallet = true,
      routes,
    }: { wallet?: boolean; routes?: (page: Page) => Promise<void> } = {},
  ): Promise<void> {
    await mockTaskReadToken(page);
    if (wallet) await mockWallet(page);
    await mockApi(page);
    await mockTraceStream(page, mockDisputeTaskId);
    await mockDisputeApi(page, api);
    await routes?.(page);
    await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
    await expect(page.getByText("workflow settled")).toBeVisible();
  }

  /** Opens the form on the code step with a reason typed, ready to submit. */
  async function fillForm(page: Page): Promise<Locator> {
    await receipt(page)
      .getByRole("listitem")
      .filter({ hasText: codeStep.agent_id })
      .getByRole("button", { name: /dispute/i })
      .click();
    const form = page.getByRole("dialog");
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    return form;
  }

  const settled = () => mockSettlementView({ settledAtS: nowS() - 60 * 60 });

  test("the form while the wallet is asked to sign: no WCAG A/AA violations", async ({
    page,
  }) => {
    // Every signature request swallowed and never answered, ahead of the
    // mock wallet's own reply, so the form holds its signing state.
    await page.addInitScript(() => {
      window.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as { source?: string; type?: string } | null;
        if (
          data?.source === "FREIGHTER_EXTERNAL_MSG_REQUEST" &&
          data.type === "SUBMIT_BLOB"
        ) {
          event.stopImmediatePropagation();
        }
      });
    });
    await open(page, { settlement: settled() });
    const form = await fillForm(page);
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await expect(form.getByRole("status")).toContainText(
      "Waiting for your wallet",
    );
    expect(await disputeScan(page)).toEqual([]);
  });

  test("the form after a refusal: no WCAG A/AA violations", async ({
    page,
  }) => {
    let serverAheadMs = 0;
    await open(page, {
      settlement: settled(),
      clock: () => Date.now() + serverAheadMs,
    });
    const form = await fillForm(page);
    serverAheadMs = DISPUTE_WINDOW_S * 1000;
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await expect(form.getByRole("alert")).toContainText("has closed");
    await expect(
      form.getByRole("button", { name: "Back to the receipt" }),
    ).toBeFocused();
    expect(await disputeScan(page)).toEqual([]);
  });

  test("the form once the dispute is raised: no WCAG A/AA violations", async ({
    page,
  }) => {
    await open(page, { settlement: settled() });
    const form = await fillForm(page);
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await expect(form).toContainText("dispute raised");
    await expect(form.getByRole("button", { name: "Done" })).toBeVisible();
    expect(await disputeScan(page)).toEqual([]);
  });

  for (const [label, dispute, waitFor] of [
    [
      "an upheld dispute, nothing paid yet",
      { status: "upheld" },
      "No transaction on record",
    ],
    [
      "a refund in flight",
      {
        status: "crediting",
        refund_tx:
          "28dd7753821ea76879f0c8d3899255a06905a39bfc1fc2f3a833f353015d15a1",
      },
      "Submitted, waiting for confirmation",
    ],
  ] as const) {
    test(`a receipt with ${label}: no WCAG A/AA violations`, async ({
      page,
    }) => {
      await open(page, {
        settlement: settled(),
        disputes: [
          mockReceiptDispute(codeStep, {
            ...dispute,
            openedAtS: nowS() - 40 * 60,
          }),
        ],
      });
      await expect(
        receipt(page).getByRole("listitem").filter({ hasText: waitFor }),
      ).toBeVisible();
      expect(await disputeScan(page)).toEqual([]);
    });
  }

  test("a receipt whose window has closed: no WCAG A/AA violations", async ({
    page,
  }) => {
    await open(page, {
      settlement: mockSettlementView({
        settledAtS: nowS() - DISPUTE_WINDOW_S - 60 * 60,
      }),
    });
    await expect(
      receipt(page).getByText("Dispute window closed", { exact: true }),
    ).toBeVisible();
    expect(await disputeScan(page)).toEqual([]);
  });

  test("the prompt to connect the wallet that paid: no WCAG A/AA violations", async ({
    page,
  }) => {
    await open(page, { settlement: settled() }, { wallet: false });
    await expect(
      receipt(page).getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
    expect(await disputeScan(page)).toEqual([]);
  });

  // Both of its lines: still looking for a settlement a sealed run should
  // have, and — once that wait is spent — nothing charged at all.
  test("a workflow with no settlement: no WCAG A/AA violations", async ({
    page,
  }) => {
    await page.clock.install({ time: Date.now() });
    await open(page, {
      settlement: null,
      clock: () => page.evaluate(() => Date.now()),
    });
    await expect(receipt(page)).toContainText("once this workflow settles");
    expect(await disputeScan(page)).toEqual([]);

    // The panel reads every few seconds for half a minute before it says so.
    await expect
      .poll(
        async () => {
          await page.clock.runFor(3_000);
          return (await receipt(page).textContent()) ?? "";
        },
        { timeout: 60_000 },
      )
      .toContain("nothing to dispute");
    expect(await disputeScan(page)).toEqual([]);
  });

  test("the receipt's skeleton while it loads: no WCAG A/AA violations", async ({
    page,
  }) => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await open(
      page,
      { settlement: settled() },
      {
        routes: async (p) => {
          await p.route(
            (url) => /\/api\/tasks\/[^/]+\/disputes$/.test(url.pathname),
            async (route) => {
              await answered;
              await route.fallback();
            },
          );
        },
      },
    );
    await expect(page.getByText("Loading the receipt…")).toBeAttached();
    expect(await disputeScan(page)).toEqual([]);
    answer();
  });

  test("a receipt that could not be read: no WCAG A/AA violations", async ({
    page,
  }) => {
    await open(
      page,
      { settlement: settled() },
      {
        routes: async (p) => {
          await p.route(
            (url) => /\/api\/tasks\/[^/]+\/disputes$/.test(url.pathname),
            (route) =>
              route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({
                  detail: "Service Unavailable",
                  error: {
                    code: "service_unavailable",
                    message: "service unavailable",
                    request_id: "e2e0000000000503",
                  },
                }),
              }),
          );
        },
      },
    );
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "receipt unavailable",
    );
    expect(await disputeScan(page)).toEqual([]);
  });
});
