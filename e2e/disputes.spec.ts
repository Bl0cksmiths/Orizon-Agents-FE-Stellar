/**
 * Disputing a settled step from the trace / receipt view (story 4.05).
 *
 * Every test drives the real trace page at `?task=` with the backend mocked
 * at the network: the trace stream replays a finished run, and the dispute
 * routes answer from `mockDisputeApi`, which remembers what was opened so a
 * later read shows it. A connected wallet is `mockWallet`'s — a restored
 * Freighter session plus a stand-in for its content script — so the signing
 * step is exercised rather than skipped, exactly as the bind specs do it.
 *
 * These run against a MOCKED backend. What they capture is test evidence of
 * the UI's behaviour, not the SOW §6.1 recording, which must be made against
 * the deployed backend.
 */
import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import { disputeScan } from "./dispute-axe";
import { horizontalOverflow } from "./dispute-layout";
import {
  DISPUTE_WINDOW_S,
  mockApi,
  mockDispute,
  mockDisputeApi,
  mockDisputeJobIdHex,
  mockDisputeTaskId,
  mockDisputesRouteMissing,
  mockOtherOwnerAddress,
  mockReasonTooLongMessage,
  mockSettlementSteps,
  mockSettlementView,
  mockSignature,
  mockTaskReadToken,
  mockTraceStream,
  mockWallet,
  mockWalletAddress,
  type MockDisputeApiOptions,
} from "./mocks";

const HOUR_S = 60 * 60;

/** The receipt's own re-read cadence while a dispute is merely open. */
const ADJUDICATION_POLL_MS = 30_000;

const [briefStep, codeStep, failedStep] = mockSettlementSteps;

/** The one read the receipt is drawn from. */
const DISPUTES_READ = /\/api\/tasks\/[^/]+\/disputes$/;

/** Now, in epoch seconds, on the clock the mock server shares with the page. */
const nowS = () => Math.floor(Date.now() / 1000);

/**
 * Opens the trace page on the settled workflow and waits for the run to
 * finish replaying — the receipt is only asked for once the stream seals.
 */
async function openTrace(
  page: Page,
  api: MockDisputeApiOptions,
  {
    wallet = true,
    token = true,
    routes,
  }: {
    wallet?: boolean;
    /**
     * The tab holds the task's read token, as the one that ran the workflow
     * does; without it the backend withholds the buyer's words.
     */
    token?: boolean;
    /** Routes registered last, so they win over the dispute mock. */
    routes?: (page: Page) => Promise<void>;
  } = {},
): Promise<void> {
  if (token) await mockTaskReadToken(page);
  if (wallet) await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  await mockDisputeApi(page, api);
  await routes?.(page);
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("workflow settled")).toBeVisible();
}

const receipt = (page: Page): Locator =>
  page.getByRole("region", { name: "Receipt" });

/** Every dispute action on the page, wherever it is drawn. */
const disputeButtons = (page: Page): Locator =>
  page.getByRole("button", { name: /dispute/i });

/** The receipt's row for one step, found by the agent it paid. */
const stepRow = (page: Page, agent: string): Locator =>
  receipt(page).getByRole("listitem").filter({ hasText: agent });

const dialog = (page: Page): Locator => page.getByRole("dialog");

/**
 * Waits until the connected wallet is restored AND the receipt has placed its
 * viewer by it: the header shows the wallet, and the prompt an unplaced,
 * anonymous viewer gets is gone. A count of zero taken before that is a
 * count of a page that has not decided who is looking yet — true of every
 * viewer, and so proof of nothing.
 */
async function walletPlaced(page: Page): Promise<void> {
  await expect(
    page
      .getByRole("button", { name: new RegExp(mockWalletAddress.slice(0, 4)) })
      .first(),
  ).toBeVisible();
  await expect(
    receipt(page).getByRole("button", { name: /connect/i }),
  ).toHaveCount(0);
}

/** Opens the dispute form for one step. */
async function openDialog(page: Page, agent: string): Promise<Locator> {
  await stepRow(page, agent)
    .getByRole("button", { name: /dispute/i })
    .click();
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

test.describe("dispute action on the trace / receipt view", () => {
  test("the payer, an hour after settling, is offered a dispute on every settled step and sees the time left", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });

    await expect(receipt(page)).toBeVisible();
    for (const step of [briefStep, codeStep]) {
      await expect(
        stepRow(page, step.agent_id).getByRole("button", { name: /dispute/i }),
      ).toBeVisible();
    }
    await expect(disputeButtons(page)).toHaveCount(2);

    // Settled an hour into a 24-hour window: just under 23 hours are left,
    // and the page says so before the buyer reaches for the action.
    await expect(
      receipt(page).getByText(/^22h 5\dm left$|^23h left$/),
    ).toBeVisible();
    await expect(
      receipt(page).getByText("Dispute window open", { exact: true }),
    ).toBeVisible();
  });

  test("a step that did not deliver offers no dispute, and says why", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });

    // Placed as the payer first — the other two steps carry their actions —
    // so the empty row below is the payer's, not an unplaced page's.
    await walletPlaced(page);
    await expect(disputeButtons(page)).toHaveCount(2);
    const row = stepRow(page, failedStep.agent_id);
    await expect(row).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row).toContainText(/not charged|did not deliver/i);
  });

  test("the reason is required: submit stays disabled until it is filled", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });
    const form = await openDialog(page, codeStep.agent_id);

    const reason = form.getByRole("textbox", { name: /your reason/i });
    const submit = form.getByRole("button", { name: /sign and submit/i });
    await expect(reason).toHaveValue("");
    await expect(submit).toBeDisabled();

    // Whitespace is not a reason.
    await reason.fill("   ");
    await expect(submit).toBeDisabled();

    await reason.fill("the calculator app does not compute anything");
    await expect(submit).toBeEnabled();

    await reason.fill("");
    await expect(submit).toBeDisabled();
  });

  // The fraction is printed to at most two decimal places, so a third is
  // "33.33%", never a recomputed "33%" or a raw 33.333… — and the RECEIPT
  // prints the same share as the form. The two used different formatters and
  // disagreed on anything finer than a tenth: 0.0625 read "6.3%" above the
  // action and "6.25%" inside it, the receipt's figure rounded UP, over the
  // share the backend will actually pay. The half-credit case, which is the
  // policy in force, passes either way.
  for (const { fraction, percent, credit } of [
    { fraction: 0.5, percent: "50%", credit: "0.027 USDC" },
    { fraction: 1 / 3, percent: "33.33%", credit: "0.018 USDC" },
    { fraction: 0.0625, percent: "6.25%", credit: "0.003375 USDC" },
  ]) {
    test(`the credit terms (${percent}) are stated in the form before anything is submitted`, async ({
      page,
    }) => {
      const opened: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/disputes") {
          opened.push(request.method());
        }
      });
      await openTrace(page, {
        settlement: mockSettlementView({
          settledAtS: nowS() - HOUR_S,
          creditedFraction: fraction,
        }),
      });
      // The receipt states the same share above the action it belongs to.
      await expect(receipt(page)).toContainText(
        `An upheld dispute credits ${percent} of that step's charge back to you,`,
      );

      const form = await openDialog(page, codeStep.agent_id);

      // The fraction as served, the one who pays it, and the one who
      // decides — all on screen while the reason is empty and submit is off.
      await expect(form).toContainText(
        `An upheld dispute credits ${percent} of this step's charge back to the wallet that paid.`,
      );
      await expect(form).toContainText(
        "The platform pays the credit. Nothing is clawed back from the agent.",
      );
      await expect(form).toContainText(
        "The platform reviews the dispute and decides. There is no on-chain arbitration.",
      );
      // And what that comes to for this step, as the backend computed it —
      // a ceiling, never an exact promise (D-071).
      await expect(form).toContainText(`Up to ${credit}`);
      await expect(
        stepRow(page, codeStep.agent_id).getByText(/if upheld$/),
      ).toHaveText(`credits up to ${credit} if upheld`);
      await expect(
        form.getByRole("button", { name: /sign and submit/i }),
      ).toBeDisabled();
      expect(opened).toEqual([]);
    });
  }

  // A policy may credit nothing; every fixture above credits something, so
  // "credits 0 USDC if upheld" beside the action went unseen.
  test("a policy that credits nothing says so, on the row and in the form", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({
        settledAtS: nowS() - HOUR_S,
        creditedFraction: 0,
      }),
    });
    const row = stepRow(page, codeStep.agent_id);
    await expect(row.getByRole("button", { name: /dispute/i })).toBeVisible();
    await expect(row).not.toContainText("if upheld");
    await expect(receipt(page)).toContainText(
      "Under the current terms an upheld dispute credits nothing back.",
    );
    await expect(receipt(page)).not.toContainText("0%");

    const form = await openDialog(page, codeStep.agent_id);
    await expect(form).toContainText("Nothing, under the current terms");
    await expect(form).not.toContainText(/Up to 0|credits 0/);
  });

  test("a closed window says it closed and when, and offers no action anywhere", async ({
    page,
  }) => {
    const settledAtS = nowS() - DISPUTE_WINDOW_S - HOUR_S;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS }),
    });

    await expect(receipt(page)).toBeVisible();
    await expect(
      receipt(page).getByText("Dispute window closed", { exact: true }),
    ).toBeVisible();
    // "When" is the window's own closing instant — machine-readable on the
    // <time> the buyer sees, and spoken in the sentence a screen reader gets.
    const closesAtIso = new Date(
      (settledAtS + DISPUTE_WINDOW_S) * 1000,
    ).toISOString();
    const closedAt = receipt(page).locator(`time[datetime="${closesAtIso}"]`);
    await expect(closedAt).toBeVisible();
    const closedAtText = (await closedAt.textContent()) ?? "";
    // A deadline with its zone named: "2:05 PM" is a different moment for
    // the buyer and for whoever they forward it to.
    expect(closedAtText).toMatch(
      /\d:\d{2}(?:\s?[AP]M)?\s(?:(?:GMT|UTC)(?:[+-]\d{1,2}(?::\d{2})?)?|(?![AP]M$)[A-Z]{2,5})$/,
    );
    await expect(
      receipt(page)
        .getByRole("status")
        .filter({ hasText: /dispute window/ }),
    ).toHaveText(`The dispute window closed on ${closedAtText}.`);
    await expect(disputeButtons(page)).toHaveCount(0);
  });

  test("an already disputed step shows its dispute and status, not a second action", async ({
    page,
  }) => {
    const settledAtS = nowS() - HOUR_S;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS }),
      disputes: [
        mockDispute(codeStep, {
          openedAtS: settledAtS + 600,
          reason: "the calculator app does not compute anything",
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row).toContainText(
      "the calculator app does not compute anything",
    );
    await expect(row.getByRole("button", { name: /dispute/i })).toHaveCount(0);
    // The other settled step is still the buyer's to dispute.
    await expect(
      stepRow(page, briefStep.agent_id).getByRole("button", {
        name: /dispute/i,
      }),
    ).toBeVisible();
  });

  // The backend sends the buyer's words only to a read that proves it may
  // see the task — the task's token, or a read grant. The mocks used to send
  // them to every read, so nothing here ever met the empty reason the live
  // backend gives the same payer in any other tab.
  test("a tab without the task's token is not sent the buyer's words, and draws none", async ({
    page,
  }) => {
    const settledAtS = nowS() - HOUR_S;
    const reason = "the calculator app does not compute anything";
    await openTrace(
      page,
      {
        settlement: mockSettlementView({ settledAtS }),
        disputes: [
          mockDispute(codeStep, { openedAtS: settledAtS + 600, reason }),
        ],
      },
      { token: false },
    );

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row.getByText("Your reason")).toHaveCount(0);
    expect(await page.content()).not.toContain(reason);
  });

  test("a wallet that did not pay sees no dispute affordance anywhere on the page", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({
        settledAtS: nowS() - HOUR_S,
        payer: mockOtherOwnerAddress,
      }),
    });

    // The connected wallet is `mockWalletAddress`; the payer is another.
    await expect(
      page
        .getByRole("button", {
          name: new RegExp(mockWalletAddress.slice(0, 4)),
        })
        .first(),
    ).toBeVisible();
    await expect(receipt(page)).toBeVisible();
    // Placed as a stranger, not merely not placed yet: the prompt an
    // unconnected viewer gets is gone too.
    await expect(
      receipt(page).getByRole("button", { name: /connect/i }),
    ).toHaveCount(0);
    await expect(disputeButtons(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("with no wallet connected, the page prompts to connect and offers no dispute", async ({
    page,
  }) => {
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      { wallet: false },
    );

    const prompt = receipt(page).getByRole("button", { name: /connect/i });
    await expect(prompt).toBeVisible();
    await expect(disputeButtons(page)).toHaveCount(0);

    // The prompt is the console's own connect flow: it opens the wallet
    // picker every other page uses.
    await prompt.click();
    await expect(page.locator("section.stellar-wallets-kit")).toBeVisible();
  });

  test("the happy path: reason, signature, and the step then shows its dispute", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });
    const form = await openDialog(page, codeStep.agent_id);
    const reason = "the calculator app does not compute anything";
    await form.getByRole("textbox", { name: /your reason/i }).fill(reason);

    const openRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/disputes",
    );
    await form.getByRole("button", { name: /sign and submit/i }).click();

    // What reached the backend is what the wallet signed, byte for byte, from
    // the wallet that paid, against the challenge's nonce.
    const body = (await openRequest).postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      job_id_hex: mockDisputeJobIdHex,
      step_index: codeStep.step_index,
      reason,
      payer: mockWalletAddress,
      signature_b64: mockSignature,
    });

    // Pending, then the dispute with its status, in the form itself — and
    // the sentence that says what was done, word for word: nothing has been
    // paid, and the credit is a ceiling (D-071).
    await expect(form).toContainText("dispute raised");
    await expect(form).toContainText(/under review/i);
    await expect(form.getByText(/is now under review/)).toHaveText(
      `Step ${codeStep.step_index + 1} (${codeStep.agent_id}) is now under review. If the platform upholds your dispute, up to 0.027 USDC is credited to the wallet that paid. This receipt shows the outcome once it is decided.`,
    );
    await expect(form).not.toContainText(/has been credited|received/);
    await form.getByRole("button", { name: "Done" }).click();
    await expect(dialog(page)).toHaveCount(0);

    // …and on the receipt, re-read from the server: the step shows its
    // dispute, the buyer's own words and its status, and the action is gone.
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row).toContainText(reason);
    await expect(row.getByRole("button", { name: /dispute/i })).toHaveCount(0);
    await expect(disputeButtons(page)).toHaveCount(1);
  });

  // The happy path takes the opener away: raising a dispute turns the step
  // from disputable to disputed, so the Dispute button is gone before the
  // buyer presses Done. Focus was left on <body>, where the first Tab does
  // nothing and the whole page has to be walked back to the receipt the
  // buyer was reading (WCAG 2.4.3).
  test("after Done, focus lands on the receipt rather than on the page body", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await expect(form).toContainText("dispute raised");
    await form.getByRole("button", { name: "Done" }).click();
    await expect(dialog(page)).toHaveCount(0);

    const landed = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? "",
      text: (document.activeElement?.textContent ?? "").trim(),
    }));
    expect(landed).toEqual({ tag: "H2", text: "Receipt" });

    // And the next Tab carries on into the receipt from there, rather than
    // starting again at the skip link above the whole document.
    await page.keyboard.press("Tab");
    const next = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? "",
      inReceipt: !!document.activeElement?.closest("section"),
    }));
    expect(next.tag).not.toBe("BODY");
    expect(next.inReceipt).toBe(true);
  });

  /** Where keyboard focus is, as a tag and its text. */
  const focused = (page: Page) =>
    page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? "",
      text: (document.activeElement?.textContent ?? "").trim(),
    }));
  const ON_RECEIPT = { tag: "H2", text: "Receipt" };

  // Three more ways out of the dialog, each followed by a re-read that takes
  // away the button focus was handed back to. Each left focus on <body>.
  test("after a duplicate closes the form, focus lands on the receipt", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      open: "duplicate",
    });
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(stepRow(page, codeStep.agent_id)).toContainText(
      "raised from another tab",
    );
    await expect.poll(() => focused(page)).toEqual(ON_RECEIPT);
  });

  test("after Done is pressed before the re-read lands, focus lands on the receipt", async ({
    page,
  }) => {
    let submitted = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        routes: async (p) => {
          await p.route("**/api/disputes", async (route) => {
            if (route.request().method() === "POST") submitted = true;
            await route.fallback();
          });
          // The re-read after the submit is held until Done has been pressed.
          await p.route(
            (url) => DISPUTES_READ.test(url.pathname),
            async (route) => {
              if (submitted) await held;
              await route.fallback();
            },
          );
        },
      },
    );
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await form.getByRole("button", { name: "Done" }).click();
    await expect(dialog(page)).toHaveCount(0);

    release();
    await expect(
      stepRow(page, codeStep.agent_id).getByRole("button", {
        name: /dispute/i,
      }),
    ).toHaveCount(0);
    await expect.poll(() => focused(page)).toEqual(ON_RECEIPT);
  });

  test("after Back to the receipt on a closed window, focus lands on the receipt", async ({
    page,
  }) => {
    let serverAheadMs = 0;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      clock: () => Date.now() + serverAheadMs,
    });
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    serverAheadMs = DISPUTE_WINDOW_S * 1000;
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await form.getByRole("button", { name: "Back to the receipt" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(disputeButtons(page)).toHaveCount(0);
    await expect.poll(() => focused(page)).toEqual(ON_RECEIPT);
  });

  // The press that opens the wallet prompt used to disable the button under
  // the buyer's finger. A browser blurs a control the moment it is disabled,
  // so for the whole round trip — half a minute and more on a real wallet —
  // `activeElement` was <body>, with Escape correctly vetoed: no position in
  // the dialog and no way out of it.
  test("keeps focus on the submit button for the whole signing round trip", async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // Holds the sequence open where a real wallet prompt would hold it.
        routes: async (p) => {
          await p.route("**/api/disputes/challenge", async (route) => {
            await held;
            await route.fallback();
          });
        },
      },
    );
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();

    const signing = form.getByRole("button", { name: /signing/i });
    await expect(signing).toBeVisible();
    const parked = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? "",
      label: (document.activeElement?.textContent ?? "").trim(),
    }));
    expect(parked.tag).toBe("BUTTON");
    expect(parked.label).toContain("Signing");
    // Marked unavailable rather than disabled: that is what keeps it focused.
    await expect(signing).toHaveAttribute("aria-disabled", "true");

    // The veto still holds — which is precisely why the focus position is the
    // only bearing the buyer has while this runs.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(1);

    // And one press is still one request, whatever the button allows.
    const posts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/disputes"
      ) {
        posts.push(request.url());
      }
    });
    await signing.click({ force: true });
    await page.keyboard.press("Control+Enter");

    release();
    await expect(form).toContainText("dispute raised");
    expect(posts).toHaveLength(1);
  });

  test("a step disputed from another tab resolves to that dispute, not an error", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      open: "duplicate",
    });
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();

    // Not a failure: the form closes itself, and the receipt re-reads the
    // step, which now shows the dispute that was already there.
    await expect(dialog(page)).toHaveCount(0);
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row).toContainText("raised from another tab");
    await expect(row.getByRole("button", { name: /dispute/i })).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  // D-057: the step was shown as disputed only once a re-read said so. With
  // the re-read failing, it went on offering Dispute — and a second attempt
  // cost a second signature for a step that already had its dispute.
  test("a duplicate whose re-read fails still shows the step as disputed, and says why", async ({
    page,
  }) => {
    await page.addInitScript(countSignatures);
    let failing = false;
    await openTrace(
      page,
      {
        settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
        open: "duplicate",
      },
      {
        routes: async (p) => {
          await p.route(
            (url) => DISPUTES_READ.test(url.pathname),
            (route) =>
              failing
                ? route.fulfill({
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
                  })
                : route.fallback(),
          );
          await p.route("**/api/disputes", async (route) => {
            // Every read after the refused submit fails.
            if (route.request().method() === "POST") failing = true;
            await route.fallback();
          });
        },
      },
    );
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();

    await expect(dialog(page)).toHaveCount(0);
    // The re-read failed, and says so above the receipt…
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "this receipt may be out of date",
    );
    // …yet the step shows the dispute it already had, and no action.
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row).toContainText("raised from another tab");
    await expect(row.getByRole("button", { name: /dispute/i })).toHaveCount(0);
    await expect(
      page.locator("main").getByRole("status").filter({
        hasText: "already had a dispute",
      }),
    ).toHaveText(
      `Step ${codeStep.step_index + 1} (${codeStep.agent_id}) already had a dispute, raised earlier — perhaps from another tab — so no second one was raised. It is shown below.`,
    );
    expect(await signatures(page)).toBe(1);
  });

  // D-061: the platform refusing the reason itself — FastAPI's 422 on the
  // request's bounds — read as a generic failure with a retry that would send
  // the same words again.
  test("a reason the platform refuses is marked on the field, with the platform's words", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      open: "invalid",
    });
    const form = await openDialog(page, codeStep.agent_id);
    const reasonBox = form.getByRole("textbox", { name: /your reason/i });
    await reasonBox.fill("the calculator app does not compute anything");
    await form.getByRole("button", { name: /sign and submit/i }).click();

    const alert = form.getByRole("alert");
    await expect(alert).toHaveText(`${mockReasonTooLongMessage}.`);
    await expect(reasonBox).toHaveAttribute("aria-invalid", "true");
    await expect(reasonBox).toBeFocused();
    const describedBy =
      (await reasonBox.getAttribute("aria-describedby")) ?? "";
    expect(describedBy.split(" ")).toContain(await alert.getAttribute("id"));
    await expect(reasonBox).toHaveAccessibleDescription(
      new RegExp(mockReasonTooLongMessage),
    );
    // Editing the words is what clears it.
    await reasonBox.fill("the calculator app computes nothing");
    await expect(reasonBox).toHaveAttribute("aria-invalid", "false");
  });

  test("a refusal that dates the receipt re-reads it: the server says the window closed", async ({
    page,
  }) => {
    // The page opened with 23 hours left on the server's clock; by the time
    // the buyer submits, that clock is past the close — the case where the
    // page's picture, not the buyer, is wrong.
    let serverAheadMs = 0;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      clock: () => Date.now() + serverAheadMs,
    });
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    serverAheadMs = DISPUTE_WINDOW_S * 1000;
    await form.getByRole("button", { name: /sign and submit/i }).click();

    await expect(form.getByRole("alert")).toContainText(
      "The dispute window for this workflow has closed, so this step can no longer be disputed.",
    );
    // The footer's own way out — named apart from the header's ✕, which is
    // "Close". This used to click "Close" and so exercised only the ✕.
    const back = form.getByRole("button", { name: "Back to the receipt" });
    await expect(back).toBeFocused();
    await back.click();
    await expect(dialog(page)).toHaveCount(0);

    // Closed as stale, so the receipt re-read the server: it now says the
    // window closed, and no step offers an action the server would refuse.
    await expect(
      receipt(page).getByText("Dispute window closed", { exact: true }),
    ).toBeVisible();
    await expect(disputeButtons(page)).toHaveCount(0);
  });

  // Vercel ships this page on every merge; Render ships the backend by hand.
  // Until it does, the page meets one of two older answers, and both must
  // read as "no receipt here" — never an error across every trace.
  for (const [backend, missingRoute] of [
    ["answers without a settlement key", false],
    ["has no disputes route at all", true],
  ] as const) {
    test(`an older backend that ${backend} renders the trace and no receipt`, async ({
      page,
    }) => {
      const read = page.waitForResponse((response) =>
        DISPUTES_READ.test(new URL(response.url()).pathname),
      );
      await openTrace(
        page,
        {
          settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
          legacy: true,
        },
        missingRoute ? { routes: mockDisputesRouteMissing } : {},
      );
      expect((await read).status()).toBe(missingRoute ? 404 : 200);

      await expect(page.getByText("seo.brief → outline drafted")).toBeVisible();
      await expect(page.getByText("sealed", { exact: true })).toBeVisible();
      // Answered, not still loading: the skeleton is gone too.
      await expect(page.getByText("Loading the receipt…")).toHaveCount(0);
      await expect(receipt(page)).toHaveCount(0);
      await expect(disputeButtons(page)).toHaveCount(0);
      // Scoped to <main>: Next's route announcer is a permanent, empty
      // role="alert" outside it.
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    });
  }

  // A re-read that fails keeps the receipt on screen on purpose — the trace
  // is evidence and must not blank — so the banner sat above a fully drawn
  // receipt saying it was unavailable. The words have to follow what is
  // actually there.
  // A poll can be answered by a backend older than the one that served the
  // receipt — a rollback, or a proxy in front of two versions — and the panel
  // hides on an answer with no settlement. Taking the section away while the
  // form is open unmounts it mid-signature with no `onClose`, leaving the
  // wallet prompt standing over a page that has forgotten it asked.
  test("an older answer arriving mid-dispute does not take the form away", async ({
    page,
  }) => {
    const start = Date.now();
    await page.clock.install({ time: start });
    const settledAtS = Math.floor(start / 1000) - HOUR_S;
    let legacy = false;

    await openTrace(
      page,
      {
        settlement: mockSettlementView({ settledAtS }),
        // One dispute still open, so the receipt is polled at all.
        disputes: [
          mockDispute(briefStep, {
            openedAtS: settledAtS + 60,
            reason: "the outline misses half of the brief",
          }),
        ],
        clock: () => page.evaluate(() => Date.now()),
      },
      {
        routes: async (p) => {
          await p.route(
            (url) => DISPUTES_READ.test(url.pathname),
            async (route) =>
              legacy
                ? route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                      task_id: mockDisputeTaskId,
                      window_closes_at: settledAtS + DISPUTE_WINDOW_S,
                      disputes: [],
                    }),
                  })
                : route.fallback(),
          );
        },
      },
    );

    const form = await openDialog(page, codeStep.agent_id);
    const reason = "the calculator app does not compute anything";
    await form.getByRole("textbox", { name: /your reason/i }).fill(reason);

    // The backend goes back a version under the open form.
    legacy = true;
    await page.clock.runFor(ADJUDICATION_POLL_MS + 1_000);

    await expect(dialog(page)).toBeVisible();
    await expect(
      form.getByRole("textbox", { name: /your reason/i }),
    ).toHaveValue(reason);

    // And the buyer's own way out still works. The receipt stays: a
    // settlement never un-happens, so an answer without one is a lost
    // record, said so above the receipt last read — never "no receipt".
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(receipt(page)).toBeVisible();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("this receipt may be out of date");
    await expect(alert).toContainText("showing the receipt last read");
  });

  test("a failed re-read dates the receipt it is printed above, not denies it", async ({
    page,
  }) => {
    let failing = false;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        routes: async (p) => {
          await p.route(
            (url) => DISPUTES_READ.test(url.pathname),
            (route) =>
              failing
                ? route.fulfill({
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
                  })
                : route.fallback(),
          );
        },
      },
    );
    await expect(receipt(page)).toBeVisible();

    // Raising a dispute re-reads the receipt; that read is the one that fails.
    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    failing = true;
    await form.getByRole("button", { name: /sign and submit/i }).click();
    await expect(form).toContainText("dispute raised");
    await form.getByRole("button", { name: "Done" }).click();

    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("this receipt may be out of date");
    await expect(alert).not.toContainText("receipt unavailable");
    // And it is: the receipt below the banner is still drawn in full — with
    // the dispute just raised on its step, from the record the submit
    // returned, though the re-read that should have shown it failed. The
    // step's action does not come back to be pressed a second time.
    await expect(receipt(page)).toBeVisible();
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(row.getByRole("button", { name: /dispute/i })).toHaveCount(0);
    await expect(disputeButtons(page)).toHaveCount(1);
  });

  test("a failed receipt read says so with a retry, and never blocks the trace", async ({
    page,
  }) => {
    let failing = true;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        routes: async (p) => {
          await p.route(
            (url) => DISPUTES_READ.test(url.pathname),
            (route) =>
              failing
                ? route.fulfill({
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
                  })
                : route.fallback(),
          );
        },
      },
    );

    // Announced where it happened, and nowhere else: the trace below is the
    // stream's, and it rendered in full whatever this read did.
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("receipt unavailable");
    await expect(page.getByText("seo.brief → outline drafted")).toBeVisible();
    await expect(page.getByText("sealed", { exact: true })).toBeVisible();
    await expect(receipt(page)).toHaveCount(0);

    // The backend comes back; one press brings the receipt.
    failing = false;
    await alert.getByRole("button", { name: /retry/i }).click();
    await expect(receipt(page)).toBeVisible();
    await expect(disputeButtons(page)).toHaveCount(2);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  // While the receipt loads, the region says so to assistive technology:
  // busy, with a status line naming what is loading — and stops saying it
  // once the receipt is in.
  test("the loading receipt is marked busy, and says what is loading", async ({
    page,
  }) => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        routes: async (p) => {
          await p.route(
            (url) => DISPUTES_READ.test(url.pathname),
            async (route) => {
              await answered;
              await route.fallback();
            },
          );
        },
      },
    );
    const busy = page.locator("main [aria-busy='true']");
    await expect(busy).toHaveCount(1);
    await expect(busy.getByRole("status")).toHaveText("Loading the receipt…");

    answer();
    await expect(receipt(page)).toBeVisible();
    await expect(busy).toHaveCount(0);
  });

  // The skeleton is drawn in the panel's own line boxes, so the receipt
  // landing moves the trace below it by less than a line — the one step row
  // whose height the skeleton cannot know in advance (a failed step's
  // explanation) is all that is left. A one-line placeholder moved it by most
  // of a screen.
  const MAX_SHIFT_PX = 24;
  for (const width of [1280, 360]) {
    test(`at ${width}px the receipt lands in the skeleton's place without moving the trace`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      let answer!: () => void;
      const answered = new Promise<void>((resolve) => (answer = resolve));
      await openTrace(
        page,
        {
          // 22h 43m left. A countdown on a whole hour reads "23h left", short
          // enough to share a phone line with its label where the usual
          // "22h 43m left" wraps; the skeleton reserves the usual.
          settlement: mockSettlementView({
            settledAtS: nowS() - HOUR_S - 17 * 60,
          }),
        },
        {
          // Holds the read until the skeleton has been measured.
          routes: async (p) => {
            await p.route(
              (url) => DISPUTES_READ.test(url.pathname),
              async (route) => {
                await answered;
                await route.fallback();
              },
            );
          },
        },
      );
      await expect(page.getByText("Loading the receipt…")).toBeAttached();
      const logBar = page.locator("main").getByText("sealed", { exact: true });
      const before = await logBar.boundingBox();

      answer();
      await expect(disputeButtons(page)).toHaveCount(2);
      const after = await logBar.boundingBox();

      if (before === null || after === null) {
        throw new Error("expected the trace log's status bar to be laid out");
      }
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(MAX_SHIFT_PX);
    });
  }

  /** A settlement of `count` delivered, charged steps, cycling the fixtures. */
  function settlementOfSteps(
    settledAtS: number,
    count: number,
  ): ReturnType<typeof mockSettlementView> {
    const base = mockSettlementView({ settledAtS });
    return {
      ...base,
      steps: Array.from({ length: count }, (_, i) => ({
        ...mockSettlementSteps[i % 2],
        step_index: i,
      })),
    };
  }

  // The count of step rows was the one dimension of the skeleton written as a
  // literal, and the fixture the tests above use happens to have exactly
  // three of them, so the guard never fired. At 360px a one-step workflow
  // yanked the log 383px UP under the reader and a six-step one pushed it
  // 579px down.
  for (const count of [1, 6]) {
    test(`at 360px a ${count}-step receipt lands in the skeleton's place`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 900 });
      let hold = false;
      let answer!: () => void;
      const answered = new Promise<void>((resolve) => (answer = resolve));
      await openTrace(
        page,
        { settlement: settlementOfSteps(nowS() - HOUR_S - 17 * 60, count) },
        {
          routes: async (p) => {
            await p.route(
              (url) => DISPUTES_READ.test(url.pathname),
              async (route) => {
                if (hold) await answered;
                await route.fallback();
              },
            );
          },
        },
      );
      await expect(disputeButtons(page)).toHaveCount(count);

      // A second visit — a reload, a back-navigation, a shared link opened
      // again — is how a settled trace is usually seen loading at all, and
      // the last answer says exactly how tall the receipt will be.
      hold = true;
      await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
      await expect(page.getByText("Loading the receipt…")).toBeAttached();
      const logBar = page.locator("main").getByText("sealed", { exact: true });
      const before = await logBar.boundingBox();

      answer();
      await expect(disputeButtons(page)).toHaveCount(count);
      const after = await logBar.boundingBox();

      if (before === null || after === null) {
        throw new Error("expected the trace log's status bar to be laid out");
      }
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(MAX_SHIFT_PX);
    });
  }

  test("the window closing while the page is open takes the action away", async ({
    page,
  }) => {
    const start = Date.now();
    await page.clock.install({ time: start });
    const settledAtS = Math.floor(start / 1000) - DISPUTE_WINDOW_S + 90;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS }),
      // The server's clock is the page's: after the jump below, a re-read
      // must not report a time from before it.
      clock: () => page.evaluate(() => Date.now()),
    });
    await expect(disputeButtons(page)).toHaveCount(2);

    // Two minutes on, the window closed 30 seconds ago — with no reload.
    await page.clock.runFor(120_000);

    await expect(
      receipt(page).getByText("Dispute window closed", { exact: true }),
    ).toBeVisible();
    await expect(disputeButtons(page)).toHaveCount(0);
  });

  // The draft outlives an accidental close only because the section keeps
  // the dialog mounted while a step can be disputed — which nothing tested
  // through the section: the dialog's own test mounts it by hand.
  test("a half-typed reason survives an accidental close, and a different step starts clean", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });
    const draft = "the calculator app does not";
    const form = await openDialog(page, codeStep.agent_id);
    await form.getByRole("textbox", { name: /your reason/i }).fill(draft);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);

    const again = await openDialog(page, codeStep.agent_id);
    await expect(
      again.getByRole("textbox", { name: /your reason/i }),
    ).toHaveValue(draft);
    await again.getByRole("button", { name: "Cancel" }).click();

    const other = await openDialog(page, briefStep.agent_id);
    await expect(
      other.getByRole("textbox", { name: /your reason/i }),
    ).toHaveValue("");
  });

  // The status line is mounted empty so a screen reader is listening before
  // its first message. Emptied out of the layout with `display: none`, it is
  // out of the accessibility tree too, and that first message can be lost.
  test("the form's status line is in the accessibility tree before it says anything", async ({
    page,
  }) => {
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
    });
    const form = await openDialog(page, codeStep.agent_id);
    const status = form.getByRole("status");
    await expect(status).toHaveCount(1);
    await expect(status).toHaveText("");
    expect(
      await status.evaluate((el) => getComputedStyle(el).display),
    ).not.toBe("none");
  });

  // No fixture had a long name, so a label set `whitespace-nowrap` in the
  // row or the form ran off a phone's screen unseen.
  test("at 360px a long unbroken agent name and id wrap in the row and the form", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const base = mockSettlementView({ settledAtS: nowS() - HOUR_S });
    const longStep = {
      ...codeStep,
      agent_id: `agent.${"k".repeat(60)}`,
      agent_name: `Generator${"G".repeat(60)}`,
    };
    await openTrace(page, {
      settlement: {
        ...base,
        steps: base.steps.map((s) =>
          s.step_index === codeStep.step_index ? longStep : s,
        ),
      },
    });
    const row = stepRow(page, longStep.agent_id);
    await expect(row).toContainText(longStep.agent_name);
    expect(await horizontalOverflow(receipt(page))).toEqual([]);

    const form = await openDialog(page, longStep.agent_id);
    await expect(form).toContainText(longStep.agent_name);
    expect(await horizontalOverflow(form)).toEqual([]);
  });

  // D-060: the row's action went away at the close, but a dialog already
  // open kept its submit — and one press asked the wallet to sign a dispute
  // the server then refused.
  test("a form left open across the close says so, and never asks the wallet to sign", async ({
    page,
  }) => {
    await page.addInitScript(countSignatures);
    const start = Date.now();
    await page.clock.install({ time: start });
    const settledAtS = Math.floor(start / 1000) - DISPUTE_WINDOW_S + 90;
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS }),
      clock: () => page.evaluate(() => Date.now()),
    });
    const form = await openDialog(page, codeStep.agent_id);
    const reasonBox = form.getByRole("textbox", { name: /your reason/i });
    await reasonBox.fill("the calculator app does not compute anything");
    await expect(
      form.getByRole("button", { name: /sign and submit/i }),
    ).toBeEnabled();

    // Two minutes on, the window closed thirty seconds ago.
    await page.clock.runFor(120_000);

    await expect(form.getByRole("alert")).toHaveText(
      "The dispute window for this workflow has closed, so this step can no longer be disputed.",
    );
    await expect(
      form.getByRole("button", { name: /sign and submit/i }),
    ).toHaveCount(0);
    // Ctrl+Enter from the reason is the form's other way to submit.
    await reasonBox.press("Control+Enter");
    await networkBeat(page);
    expect(await signatures(page)).toBe(0);

    await form.getByRole("button", { name: "Back to the receipt" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(disputeButtons(page)).toHaveCount(0);
  });

  test("at 360px the receipt and the dispute form fit without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }),
      disputes: [
        mockDispute(briefStep, {
          openedAtS: nowS() - 600,
          reason: "the outline misses half of the brief",
        }),
      ],
    });

    await expect(receipt(page)).toBeVisible();
    expect(await horizontalOverflow(receipt(page))).toEqual([]);

    const form = await openDialog(page, codeStep.agent_id);
    await form
      .getByRole("textbox", { name: /your reason/i })
      .fill("the calculator app does not compute anything");
    expect(await horizontalOverflow(form)).toEqual([]);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/**
 * The deadline in a zone this spec chooses, so its words can be asserted
 * literally. The checks above compared the printed time with the page's own
 * formatter — or with the `<time>` element's own text — and so passed with
 * the zone dropped from the format altogether.
 */
test.describe("the dispute deadline, read in Manila", () => {
  test.use({ timezoneId: "Asia/Manila", locale: "en-US" });

  test("names its zone on the closing line and in the spoken summary", async ({
    page,
  }) => {
    // Settled 02:00 UTC on 30 September; the window closes a day later,
    // 10:00 on 1 October in Manila (UTC+8).
    const settledAtMs = Date.UTC(2026, 8, 30, 2, 0, 0);
    await page.clock.install({ time: settledAtMs + HOUR_S * 1000 });
    await openTrace(page, {
      settlement: mockSettlementView({ settledAtS: settledAtMs / 1000 }),
      clock: () => page.evaluate(() => Date.now()),
    });

    const closes = "Oct 1, 2026, 10:00 AM GMT+8";
    await expect(receipt(page).locator("time").last()).toHaveText(closes);
    await expect(
      receipt(page)
        .getByRole("status")
        .filter({ hasText: /dispute window/i }),
    ).toHaveText(`Dispute window open until ${closes}.`);
  });
});

/**
 * Counts, by component name, the commits that re-rendered each component —
 * read off the React DevTools global hook, the seam the React Profiler reads.
 * Installed before any page script so React injects into it on boot.
 *
 * A fiber rendered in a commit when it went through the work loop and did
 * work: its parent's child list was rebuilt (a subtree React skipped keeps
 * the very same child pointer) and the PerformedWork flag is set on it.
 */
function installRenderCounter(): void {
  type Fiber = {
    tag: number;
    flags: number;
    type: unknown;
    child: Fiber | null;
    sibling: Fiber | null;
    alternate: Fiber | null;
  };
  const PERFORMED_WORK = 1;
  // Function, class, forwardRef, memo and simple-memo components.
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
  const counts: Record<string, number> = {};

  const nameOf = (type: unknown): string | null => {
    if (typeof type === "function") {
      const fn = type as { displayName?: string; name?: string };
      return fn.displayName ?? fn.name ?? null;
    }
    if (typeof type === "object" && type !== null) {
      const wrapper = type as { type?: unknown; render?: unknown };
      return nameOf(wrapper.type ?? wrapper.render);
    }
    return null;
  };

  const visit = (next: Fiber, prev: Fiber | null): void => {
    if (COMPONENT_TAGS.has(next.tag)) {
      const rendered =
        prev === null || (next.flags & PERFORMED_WORK) === PERFORMED_WORK;
      const name = rendered ? nameOf(next.type) : null;
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
    if (prev !== null && next.child === prev.child) return;
    for (let child = next.child; child; child = child.sibling) {
      visit(child, child.alternate);
    }
  };

  const renderers = new Map<number, unknown>();
  Object.assign(window, {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: {
      renderers,
      supportsFiber: true,
      inject(renderer: unknown) {
        const id = renderers.size + 1;
        renderers.set(id, renderer);
        return id;
      },
      onScheduleFiberRoot() {},
      onCommitFiberRoot(_id: number, root: { current: Fiber }) {
        visit(root.current, root.current.alternate);
      },
      onPostCommitFiberRoot() {},
      onCommitFiberUnmount() {},
      checkDCE() {},
    },
    __renderCounts: {
      read: () => ({ ...counts }),
      reset: () => {
        for (const key of Object.keys(counts)) delete counts[key];
      },
    },
  });
}

type RenderCounts = {
  read: () => Record<string, number>;
  reset: () => void;
};

test.describe("the countdown's re-renders stay inside the receipt", () => {
  test("a window ticking every second re-renders the receipt and never the trace page", async ({
    page,
  }) => {
    await page.addInitScript(installRenderCounter);
    // Half an hour left: the final hour, where the window ticks every second.
    await openTrace(page, {
      settlement: mockSettlementView({
        settledAtS: nowS() - DISPUTE_WINDOW_S + 30 * 60,
      }),
    });
    await expect(disputeButtons(page)).toHaveCount(2);
    const countdown = receipt(page).getByText(/^\d+m( \d+s)? left$/);
    const before = await countdown.textContent();

    const counts = () =>
      page.evaluate(() =>
        (
          window as unknown as { __renderCounts: RenderCounts }
        ).__renderCounts.read(),
      );
    await page.evaluate(() =>
      (
        window as unknown as { __renderCounts: RenderCounts }
      ).__renderCounts.reset(),
    );

    // Three of the window's own ticks, in real time. They are the positive
    // control: the section demonstrably re-rendered, so the zeros below are
    // a measurement and not a counter that saw nothing.
    await expect
      .poll(async () => (await counts()).DisputeSection ?? 0, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(3);
    await expect(countdown).not.toHaveText(before ?? "");

    const seen = await counts();
    expect(seen.ReceiptPanel ?? 0).toBeGreaterThanOrEqual(3);
    // None of it reached the page, or the trace log it renders.
    expect(seen.TracePageInner ?? 0).toBe(0);
    expect(seen.TraceRow ?? 0).toBe(0);
  });
});

// ── D-067: the payer reads their own words again ────────────────────────
//
// The backend now withholds both reasons from anyone without the task's read
// token — the payer too, in any tab but the one that ran the task — and marks
// each dispute `reason_withheld`. The payer may sign a challenge for a read
// grant, sent on each read after. The backend routes are not merged yet, so
// they are stubbed here to the frozen contract.

const PAYER_REASON = "the calculator app does not compute anything";
const PLATFORM_REPLY =
  "the brief asked for a four-function calculator, and that is what shipped";
const GRANT = "grant_e2e_read";
const GRANTS_KEY = "orizon.dispute-read-grants";

type ReadGrantStub = {
  /** Every disputes read, with the grant it presented (or null). */
  reads: (string | null)[];
  challenges: () => number;
  grants: () => number;
};

/**
 * The disputes read, the read challenge and the read grant, as the backend
 * lane's contract states them. The read withholds the reason — `""` and
 * `reason_withheld: true` — unless it presents the grant this stub issued.
 */
async function stubReadGrant(
  page: Page,
  {
    payer = mockWalletAddress,
    challengeRoute = "present",
    sendsFlag = true,
    clock = Date.now,
    status = "open",
    grantRoute = "issue",
  }: {
    payer?: string;
    /** `missing` answers 404, as a backend without the route does. */
    challengeRoute?: "present" | "missing";
    /** False: a backend that predates `reason_withheld`. */
    sendsFlag?: boolean;
    clock?: () => number | Promise<number>;
    /** `rejected` carries the platform's reply, withheld like the reason. */
    status?: "open" | "rejected";
    /** `refuse` answers 403 `not_the_payer`, as for a wallet it doubts. */
    grantRoute?: "issue" | "refuse";
  } = {},
): Promise<ReadGrantStub> {
  const reads: (string | null)[] = [];
  let challenges = 0;
  let grants = 0;
  const settlement = mockSettlementView({ settledAtS: nowS() - HOUR_S, payer });
  const fulfil = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route(
    (url) => DISPUTES_READ.test(url.pathname),
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const grant =
        (await route.request().headerValue("x-dispute-read-grant")) ?? null;
      reads.push(grant);
      const granted = grant === GRANT;
      const dispute = {
        ...mockDispute(codeStep, {
          openedAtS: nowS() - 30 * 60,
          reason: granted ? PAYER_REASON : "",
          payer,
          status,
        }),
        ...(status === "rejected"
          ? {
              resolved_at: nowS() - 10 * 60,
              rejection_reason: granted ? PLATFORM_REPLY : "",
            }
          : {}),
        ...(sendsFlag ? { reason_withheld: !granted } : {}),
      };
      return fulfil(route, 200, {
        task_id: mockDisputeTaskId,
        window_closes_at: settlement.window_closes_at,
        now: Math.floor((await clock()) / 1000),
        settlement,
        disputes: [dispute],
      });
    },
  );
  await page.route("**/api/disputes/read-challenge", async (route) => {
    challenges += 1;
    if (challengeRoute === "missing") {
      return fulfil(route, 404, { detail: "Not Found" });
    }
    const { task_id } = route.request().postDataJSON() as { task_id: string };
    return fulfil(route, 200, {
      nonce: "e2ereadnonce",
      message: `orizon-dispute-read:v1:${task_id}:e2ereadnonce`,
      expires_at: nowS() + 300,
    });
  });
  await page.route("**/api/disputes/read-grant", async (route) => {
    grants += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body).toEqual({
      task_id: mockDisputeTaskId,
      nonce: "e2ereadnonce",
      signature_b64: mockSignature,
    });
    if (grantRoute === "refuse") {
      return fulfil(route, 403, {
        detail: "not_the_payer",
        error: {
          code: "not_the_payer",
          message: "not the payer",
          request_id: "req_e2e",
        },
      });
    }
    return fulfil(route, 200, { grant: GRANT, expires_at: nowS() + 3_600 });
  });
  return { reads, challenges: () => challenges, grants: () => grants };
}

/**
 * Runs the page's clock on to the receipt's next read, and stops there.
 *
 * Not one `runFor` of a whole poll interval: the page arms its next read only
 * once the last one's answer has been processed, so a second jump straight
 * after a read was COUNTED can run the clock past a timer that is not armed
 * yet — which then sits a whole interval beyond the time handed out, and the
 * read never comes (8 runs in 12, at ten workers). Stepped a few seconds at a
 * time, the clock only ever moves while the page is waiting on it.
 */
async function runToNextRead(page: Page, reads: () => number): Promise<void> {
  const next = reads() + 1;
  await expect
    .poll(
      async () => {
        if (reads() < next) await page.clock.runFor(5_000);
        return reads();
      },
      { timeout: 30_000 },
    )
    .toBe(next);
}

/**
 * A second of real time, for a count of zero to mean something: a request
 * leaves the page at once but reaches the route over another channel.
 */
const networkBeat = (page: Page) => page.waitForTimeout(1_000);

/** Counts every signature the page asks the wallet for. */
function countSignatures(): void {
  Object.assign(window, { __signs: 0 });
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { source?: string; type?: string } | null;
    if (
      data?.source === "FREIGHTER_EXTERNAL_MSG_REQUEST" &&
      data.type === "SUBMIT_BLOB"
    ) {
      const w = window as unknown as { __signs: number };
      w.__signs += 1;
    }
  });
}

/**
 * A wallet whose owner closes the signing prompt: answers every signature
 * with Freighter's own refusal, ahead of `mockWallet`'s stand-in. Installed
 * BEFORE it, so this listener runs first and stops the other replying.
 */
function declineSignatures(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as {
      source?: string;
      type?: string;
      messageId?: unknown;
    } | null;
    if (
      data?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST" ||
      data.type !== "SUBMIT_BLOB"
    ) {
      return;
    }
    event.stopImmediatePropagation();
    window.postMessage(
      {
        source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
        messagedId: data.messageId,
        apiError: { code: -4, message: "The user rejected this request." },
      },
      window.location.origin,
    );
  });
}

const signatures = (page: Page) =>
  page.evaluate(() => (window as unknown as { __signs: number }).__signs);

const offer = (page: Page): Locator =>
  receipt(page).getByRole("button", { name: /show my reason/i });

test.describe("the payer's own reason, in a tab without the task's token", () => {
  test("is offered, signed for once on a press, and then read with the grant on every poll", async ({
    page,
  }) => {
    await page.addInitScript(countSignatures);
    const start = Date.now();
    await page.clock.install({ time: start });
    const clock = () => page.evaluate(() => Date.now());
    let stub: ReadGrantStub | undefined;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          stub = await stubReadGrant(p, { clock });
        },
      },
    );
    if (!stub) throw new Error("stub not installed");
    const reads = stub;
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    await expect(offer(page)).toBeVisible();
    await expect(receipt(page)).toContainText(
      "it costs nothing and sends no transaction",
    );
    await expect(row.getByText("Your reason")).toHaveCount(0);

    // Never on its own: a poll passes, and nothing is asked of the wallet.
    await runToNextRead(page, () => reads.reads.length);
    expect(reads.reads.length).toBe(2);
    expect(await signatures(page)).toBe(0);
    expect(reads.challenges()).toBe(0);

    await offer(page).click();
    await expect(row).toContainText(PAYER_REASON);
    await expect(offer(page)).toHaveCount(0);
    expect(await signatures(page)).toBe(1);
    expect(reads.challenges()).toBe(1);
    expect(reads.grants()).toBe(1);
    expect(reads.reads.at(-1)).toBe(GRANT);
    const held = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      GRANTS_KEY,
    );
    expect(held).toContain(GRANT);

    // Every later read presents the grant, and none signs again.
    const before = reads.reads.length;
    await runToNextRead(page, () => reads.reads.length);
    await runToNextRead(page, () => reads.reads.length);
    expect(reads.reads.slice(before)).toEqual([GRANT, GRANT]);
    expect(await signatures(page)).toBe(1);
    expect(reads.challenges()).toBe(1);
    await expect(row).toContainText(PAYER_REASON);

    // A reload in the same tab keeps the grant: the reason comes back with
    // no offer and no signature, once the wallet has restored.
    await page.reload();
    await expect(row).toContainText(PAYER_REASON);
    await expect(offer(page)).toHaveCount(0);
    expect(await signatures(page)).toBe(0);
    expect(reads.challenges()).toBe(1);
  });

  test("drops a grant the server stopped honouring and offers the signature again, without looping", async ({
    page,
  }) => {
    await page.addInitScript(countSignatures);
    await page.addInitScript(
      ({ key, taskId, payer }) => {
        window.sessionStorage.setItem(
          key,
          JSON.stringify([
            {
              taskId,
              payer,
              grant: "grant_from_before_the_restart",
              expiresAtMs: Date.now() + 3_600_000,
            },
          ]),
        );
      },
      { key: GRANTS_KEY, taskId: mockDisputeTaskId, payer: mockWalletAddress },
    );
    const start = Date.now();
    await page.clock.install({ time: start });
    let stub: ReadGrantStub | undefined;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          stub = await stubReadGrant(p, {
            clock: () => p.evaluate(() => Date.now()),
          });
        },
      },
    );
    if (!stub) throw new Error("stub not installed");
    const reads = stub;
    await expect(offer(page)).toBeVisible();
    // Presented once the wallet restored, refused, and dropped.
    await expect
      .poll(() => reads.reads.includes("grant_from_before_the_restart"))
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate((key) => window.sessionStorage.getItem(key), GRANTS_KEY),
      )
      .toBeNull();
    await expect(offer(page)).toBeVisible();

    // The next poll goes without, and nothing is signed or asked for.
    const settled = reads.reads.length;
    await runToNextRead(page, () => reads.reads.length);
    expect(reads.reads.length).toBe(settled + 1);
    expect(reads.reads.at(-1)).toBeNull();
    expect(await signatures(page)).toBe(0);
    expect(reads.challenges()).toBe(0);
    await expect(offer(page)).toBeVisible();
  });

  test("a backend without the challenge route: the offer goes away, and nothing is signed", async ({
    page,
  }) => {
    await page.addInitScript(countSignatures);
    let stub: ReadGrantStub | undefined;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          stub = await stubReadGrant(p, { challengeRoute: "missing" });
        },
      },
    );
    await offer(page).click();
    await expect(offer(page)).toHaveCount(0);
    expect(stub?.challenges()).toBe(1);
    expect(stub?.grants()).toBe(0);
    expect(await signatures(page)).toBe(0);
    await expect(receipt(page)).not.toContainText("sends no transaction");
    await expect(page.getByText(/⚠/)).toHaveCount(0);
  });

  test("a backend that cannot say whether it withheld anything offers nothing", async ({
    page,
  }) => {
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          await stubReadGrant(p, { sendsFlag: false });
        },
      },
    );
    await expect(stepRow(page, codeStep.agent_id)).toContainText(
      "Under review",
    );
    await expect(offer(page)).toHaveCount(0);
  });

  test("a declined prompt is a choice, not an error: the offer stays and no grant is kept", async ({
    page,
  }) => {
    await page.addInitScript(declineSignatures);
    let stub: ReadGrantStub | undefined;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          stub = await stubReadGrant(p);
        },
      },
    );
    await offer(page).click();
    await expect(receipt(page)).toContainText(
      "Not signed. Your reason stays hidden until you choose to show it.",
    );
    await expect(offer(page)).toBeVisible();
    expect(stub?.grants()).toBe(0);
    // Next's route announcer is an empty alert on every page; no alert may
    // SAY anything.
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(
      0,
    );
    await expect(page.getByText(/⚠/)).toHaveCount(0);
    expect(
      await page.evaluate(
        (key) => window.sessionStorage.getItem(key),
        GRANTS_KEY,
      ),
    ).toBeNull();
  });

  test("a wallet that did not pay is never offered it, and never receives the reason", async ({
    page,
  }) => {
    await page.addInitScript(countSignatures);
    let stub: ReadGrantStub | undefined;
    await openTrace(
      page,
      {
        settlement: mockSettlementView({
          settledAtS: nowS() - HOUR_S,
          payer: mockOtherOwnerAddress,
        }),
      },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          stub = await stubReadGrant(p, { payer: mockOtherOwnerAddress });
        },
      },
    );
    await expect(stepRow(page, codeStep.agent_id)).toContainText(
      "Under review",
    );
    // Placed as the stranger it is before the offer is counted absent.
    await walletPlaced(page);
    await expect(offer(page)).toHaveCount(0);
    expect(stub?.challenges()).toBe(0);
    expect(await signatures(page)).toBe(0);
    expect(await page.content()).not.toContain(PAYER_REASON);
  });
});

/**
 * A wallet whose prompt is left open: every signature request is swallowed,
 * ahead of `mockWallet`'s stand-in, and never answered — so the page holds
 * its signing state for as long as a test needs to look at it.
 */
function holdSignatures(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { source?: string; type?: string } | null;
    if (
      data?.source === "FREIGHTER_EXTERNAL_MSG_REQUEST" &&
      data.type === "SUBMIT_BLOB"
    ) {
      event.stopImmediatePropagation();
    }
  });
}

/**
 * The show-my-reason control under axe, in every state it can be drawn in.
 * The scan is `e2e/a11y.spec.ts`'s exactly — `disputeScan`, which judges the
 * contrast a bare scan cannot see under the card's gradient — so the two
 * gates cannot disagree about what a violation is.
 */
test.describe("accessibility — the show-my-reason control", () => {
  /** The control's own live region: the panel has others (the window's).
   * Found by attribute, not role: empty, it is not drawn, and the role query
   * skips what is not drawn — but the region is mounted all the same. */
  const outcome = (page: Page): Locator =>
    receipt(page)
      .locator(".clip-cyber-sm")
      .filter({
        has: page.getByRole("button", { name: /show my reason|signing/i }),
      })
      .locator('[role="status"]');

  async function openWithheld(
    page: Page,
    stub: Parameters<typeof stubReadGrant>[1] = {},
  ): Promise<void> {
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          await stubReadGrant(p, stub);
        },
      },
    );
    await expect(offer(page)).toBeVisible();
  }

  test("offered: no WCAG A/AA violations", async ({ page }) => {
    await openWithheld(page);
    expect(await disputeScan(page)).toEqual([]);
  });

  test("while the wallet is open: no WCAG A/AA violations", async ({
    page,
  }) => {
    await page.addInitScript(holdSignatures);
    await openWithheld(page);
    await offer(page).click();
    const signing = receipt(page).getByRole("button", { name: /signing/i });
    await expect(signing).toHaveAttribute("aria-disabled", "true");
    await expect(outcome(page)).toHaveText("Waiting for your wallet to sign…");
    expect(await disputeScan(page)).toEqual([]);
  });

  test("after a declined prompt: no WCAG A/AA violations", async ({ page }) => {
    await page.addInitScript(declineSignatures);
    await openWithheld(page);
    await offer(page).click();
    await expect(outcome(page)).toHaveText(
      "Not signed. Your reason stays hidden until you choose to show it.",
    );
    await expect(outcome(page)).toHaveAttribute("aria-live", "polite");
    expect(await disputeScan(page)).toEqual([]);
  });

  test("after a refusal, the longest line it can say: no WCAG A/AA violations", async ({
    page,
  }) => {
    await openWithheld(page, { grantRoute: "refuse" });
    await offer(page).click();
    await expect(outcome(page)).toHaveText(
      "The platform did not recognise this wallet as the one that paid, so your reason stays hidden.",
    );
    expect(await disputeScan(page)).toEqual([]);
  });

  test("revealed, with the reason and the platform's reply: no WCAG A/AA violations", async ({
    page,
  }) => {
    await openWithheld(page, { status: "rejected" });
    await offer(page).click();
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText(PAYER_REASON);
    await expect(row).toContainText(PLATFORM_REPLY);
    await expect(row).toContainText("Why it was rejected");
    await expect(offer(page)).toHaveCount(0);
    expect(await disputeScan(page)).toEqual([]);
  });

  test("announces each outcome once, and nothing again on the polls that follow", async ({
    page,
  }) => {
    await page.addInitScript(declineSignatures);
    await page.clock.install({ time: Date.now() });
    let stub: ReadGrantStub | undefined;
    await openTrace(
      page,
      { settlement: mockSettlementView({ settledAtS: nowS() - HOUR_S }) },
      {
        // A tab without the task's token: the reason is withheld.
        token: false,
        routes: async (p) => {
          stub = await stubReadGrant(p, {
            clock: () => p.evaluate(() => Date.now()),
          });
        },
      },
    );
    if (!stub) throw new Error("stub not installed");
    const reads = stub;
    await expect(offer(page)).toBeVisible();
    // Every text the region is given, in order: what a screen reader hears.
    await outcome(page).evaluate((region) => {
      const heard: string[] = [];
      Object.assign(window, { __heard: heard });
      new MutationObserver(() => {
        const text = region.textContent ?? "";
        if (text) heard.push(text);
      }).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    const heard = () =>
      page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);

    await offer(page).click();
    await expect(outcome(page)).toHaveText(/^Not signed\./);
    const declined = [
      "Waiting for your wallet to sign…",
      "Not signed. Your reason stays hidden until you choose to show it.",
    ];
    expect(await heard()).toEqual(declined);

    // Two poll cycles re-render the panel; the region must say nothing more.
    const before = reads.reads.length;
    await runToNextRead(page, () => reads.reads.length);
    await runToNextRead(page, () => reads.reads.length);
    expect(reads.reads.length).toBe(before + 2);
    await page.waitForTimeout(500);
    expect(await heard()).toEqual(declined);
  });
});
