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
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  DISPUTE_WINDOW_S,
  mockApi,
  mockDispute,
  mockDisputeApi,
  mockDisputeJobIdHex,
  mockDisputeTaskId,
  mockDisputesRouteMissing,
  mockOtherOwnerAddress,
  mockSettlementSteps,
  mockSettlementView,
  mockSignature,
  mockTraceStream,
  mockWallet,
  mockWalletAddress,
  type MockDisputeApiOptions,
} from "./mocks";

const HOUR_S = 60 * 60;

const [briefStep, codeStep, failedStep] = mockSettlementSteps;

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
    routes,
  }: {
    wallet?: boolean;
    /** Routes registered last, so they win over the dispute mock. */
    routes?: (page: Page) => Promise<void>;
  } = {},
): Promise<void> {
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

/** Opens the dispute form for one step. */
async function openDialog(page: Page, agent: string): Promise<Locator> {
  await stepRow(page, agent)
    .getByRole("button", { name: /dispute/i })
    .click();
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

/**
 * Sideways overflow inside `root`, as the offending elements' own
 * descriptions. Width is the direction a phone cannot recover: the console
 * hides horizontal overflow on html and body, so content past the right edge
 * is not scrolled to — it is cut off.
 */
async function horizontalOverflow(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const limit = document.documentElement.clientWidth + 1;
    const offenders: string[] = [];
    for (const node of [el, ...Array.from(el.querySelectorAll("*"))]) {
      const box = node.getBoundingClientRect();
      if (box.width === 0) continue;
      const scrolls = node.scrollWidth > node.clientWidth + 1;
      const style = getComputedStyle(node);
      const scrollable =
        scrolls && (style.overflowX === "auto" || style.overflowX === "scroll");
      if (box.left < -1 || box.right > limit || scrollable) {
        const text = (node.textContent ?? "").trim().slice(0, 40);
        offenders.push(
          `<${node.tagName.toLowerCase()}> ${Math.round(box.left)}–${Math.round(box.right)}px "${text}"`,
        );
      }
    }
    return offenders;
  });
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

  // The fraction is printed as the dialog prints it — to at most two decimal
  // places — so a third is "33.33%", never a recomputed "33%" or a raw
  // 33.333…: the half-credit case alone would pass either way.
  for (const { fraction, percent, credit } of [
    { fraction: 0.5, percent: "50%", credit: "0.027 USDC" },
    { fraction: 1 / 3, percent: "33.33%", credit: "0.018 USDC" },
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
      // And what that comes to for this step, as the backend computed it.
      await expect(form).toContainText(credit);
      await expect(
        form.getByRole("button", { name: /sign and submit/i }),
      ).toBeDisabled();
      expect(opened).toEqual([]);
    });
  }

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
    expect(closedAtText).not.toBe("");
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

    // Pending, then the dispute with its status, in the form itself…
    await expect(form).toContainText("dispute raised");
    await expect(form).toContainText(/under review/i);
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
    // The footer's Close — the header's ✕ shares the name and the path out.
    await form
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
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
        /\/api\/tasks\/[^/]+\/disputes$/.test(new URL(response.url()).pathname),
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
