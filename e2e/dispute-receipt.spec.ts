/**
 * A dispute's status and refund receipt on the trace / receipt view
 * (story 4.06, BLO-34).
 *
 * EVIDENCE NOTE. Every test here runs against a MOCKED backend: the disputes
 * read is answered from a script in `e2e/mocks.ts`, and the refund and rating
 * hashes are fixtures that exist on no ledger. The screenshots this spec
 * attaches to the Playwright report are test evidence of how the receipt draws
 * each state — they are NOT the SOW §6.1 recording and must never be presented
 * as it. That recording is made against the deployed backend, with a refund
 * and a dispute rating that really landed on testnet.
 *
 * Each test drives the real trace page at `?task=` exactly as the story 4.05
 * spec does: the trace stream replays a finished run, the connected wallet is
 * `mockWallet`'s, and the one read the receipt is drawn from is answered by
 * `mockDisputeReads`, which a test can move on — the platform adjudicating and
 * paying while the buyer watches — and which counts every read the page makes.
 */
import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import type { Dispute } from "../lib/types";
import {
  mockApi,
  mockDispute,
  mockDisputeReads,
  mockDisputeTaskId,
  mockOtherOwnerAddress,
  mockReceiptDispute,
  mockRatingTx,
  mockRefundTx,
  mockRejectionReason,
  mockSettlementSteps,
  mockSettlementView,
  mockTraceStream,
  mockWallet,
  type MockDisputeReads,
} from "./mocks";

const HOUR_S = 60 * 60;

const [briefStep, codeStep] = mockSettlementSteps;

/** Now, in epoch seconds, on the clock the mock server shares with the page. */
const nowS = () => Math.floor(Date.now() / 1000);

/**
 * Stellar Expert's TESTNET page for one transaction: what "a transaction that
 * resolves on Stellar Expert (testnet)" means for a link, spelled out here
 * rather than borrowed from the component under test.
 */
const testnetTx = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

/** How an epoch-seconds instant is written on a `<time datetime>`. */
const isoOf = (epochS: number) => new Date(epochS * 1000).toISOString();

type ReceiptSetup = {
  /** What the disputes read answers with when the page loads. */
  disputes: readonly Dispute[];
  /** The workflow's settlement instant; an hour ago unless given. */
  settledAtS?: number;
  /** Who paid. The connected wallet is always `mockWalletAddress`. */
  payer?: string;
  /** The server's clock; see `MockDisputeApiOptions.clock`. */
  clock?: () => number | Promise<number>;
};

/**
 * Opens the trace page on the settled workflow with a wallet connected, and
 * waits for the receipt — which is only asked for once the stream seals.
 * Returns the scripted read, so a test can move the answer on and count.
 */
async function openReceipt(
  page: Page,
  { disputes, settledAtS = nowS() - HOUR_S, payer, clock }: ReceiptSetup,
): Promise<MockDisputeReads> {
  await mockWallet(page);
  await mockApi(page);
  await mockTraceStream(page, mockDisputeTaskId);
  const reads = await mockDisputeReads(page, {
    settlement: mockSettlementView({ settledAtS, payer }),
    disputes,
    clock,
  });
  await page.goto(`/app/trace?task=${mockDisputeTaskId}`);
  await expect(page.getByText("workflow settled")).toBeVisible();
  await expect(receipt(page)).toBeVisible();
  return reads;
}

const receipt = (page: Page): Locator =>
  page.getByRole("region", { name: "Receipt" });

/** The receipt's row for one step, found by the agent it paid. */
const stepRow = (page: Page, agent: string): Locator =>
  receipt(page).getByRole("listitem").filter({ hasText: agent });

/**
 * One on-chain artifact in a step's dispute receipt — the refund transfer or
 * the dispute rating — found by the title it is listed under, so a state
 * asserted of one can never be satisfied by the other beside it.
 */
const artifact = (row: Locator, title: string): Locator =>
  row.locator("dl > div").filter({ hasText: title });

/**
 * Attaches a picture of one receipt state to this test's report. An
 * attachment and never a committed file: it shows a MOCKED backend, and a PNG
 * in the tree is one careless upload away from passing as the live recording.
 */
async function attachShot(
  testInfo: TestInfo,
  name: string,
  target: Locator,
): Promise<void> {
  await testInfo.attach(name, {
    body: await target.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
}

/**
 * Sideways overflow inside `root`, as the offending elements' own
 * descriptions — the measure the story 4.05 spec takes of the receipt, for
 * the same reason: the console hides horizontal overflow on html and body,
 * so on a phone anything past the right edge is not scrolled to, it is cut
 * off. A 64-character hash that does not wrap is the classic offender.
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

test.describe("dispute status and refund receipt", () => {
  test("an open dispute says it is under review, when it was raised, and what happens next", async ({
    page,
  }, testInfo) => {
    const openedAtS = nowS() - 40 * 60;
    await openReceipt(page, {
      disputes: [mockReceiptDispute(codeStep, { status: "open", openedAtS })],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    // When it was raised, machine-readable on the <time> the buyer reads.
    await expect(row).toContainText(/raised/i);
    await expect(
      row.locator(`time[datetime="${isoOf(openedAtS)}"]`),
    ).toBeVisible();
    // Not silence: who acts next, and what an uphold would mean on both sides.
    await expect(row).toContainText(
      `The platform is reviewing this dispute; if it is upheld, the step's credit is paid to your wallet and ${codeStep.agent_id}'s reputation records the dispute.`,
    );
    await attachShot(testInfo, "receipt — open", row);
  });

  test("a credited dispute shows the amount actually paid and links its refund on Stellar Expert testnet", async ({
    page,
  }, testInfo) => {
    // Deliberately NOT the step's `creditable_usdc` (0.027): were the two
    // equal, a receipt printing the promise would pass as one printing what
    // the refund moved.
    const paidUsdc = 0.0265;
    expect(paidUsdc).not.toBe(codeStep.creditable_usdc);
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
          credited_usdc: paidUsdc,
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Refunded");
    await expect(row).toContainText("0.0265 USDC");
    // The link resolves on the testnet explorer, to exactly this refund.
    const refund = row.getByRole("link", { name: /refund/i });
    await expect(refund).toHaveAttribute("href", testnetTx(mockRefundTx));
    await attachShot(testInfo, "receipt — credited", row);
  });

  test("a credited dispute also links the dispute rating written against the agent", async ({
    page,
  }) => {
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
        }),
      ],
    });

    // The consequence to the agent, as its own artifact beside the credit:
    // a second link, to a second transaction, on the same testnet explorer.
    const row = stepRow(page, codeStep.agent_id);
    const rating = row.getByRole("link", { name: /rating/i });
    await expect(rating).toHaveAttribute("href", testnetTx(mockRatingTx));
    await expect(row.getByRole("link", { name: /refund/i })).toHaveAttribute(
      "href",
      testnetTx(mockRefundTx),
    );
  });

  test("a rejected dispute says so and gives the platform's reason", async ({
    page,
  }, testInfo) => {
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "rejected",
          openedAtS: nowS() - 40 * 60,
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Rejected");
    // A rejection with no explanation is worse than no dispute system.
    await expect(row).toContainText(mockRejectionReason);
    // Nothing was paid, so nothing may be linked as if it had been.
    await expect(row.getByRole("link")).toHaveCount(0);
    await attachShot(testInfo, "receipt — rejected", row);
  });

  test("a refund or a rating still in flight reads as pending, never as done", async ({
    page,
  }, testInfo) => {
    // Submitted, not confirmed: the settler recorded the hash on its way out.
    const inFlightTx =
      "28dd7753821ea76879f0c8d3899255a06905a39bfc1fc2f3a833f353015d15a1";
    const openedAtS = nowS() - 40 * 60;
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(briefStep, {
          status: "crediting",
          openedAtS,
          refund_tx: inFlightTx,
        }),
        // Refunded, but the rating's hash was recorded on a timeout: the
        // ledger has not vouched for it, so it has not cost the agent yet.
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS,
          rating_confirmed: false,
        }),
      ],
    });

    // The refund in flight: its own words, its hash to watch — and nothing
    // that could pass for success, not the badge and not the mark.
    const crediting = stepRow(page, briefStep.agent_id);
    await expect(crediting).toContainText("Refund in progress");
    await expect(crediting).not.toContainText("Refunded");
    const inFlight = artifact(crediting, "Refund transfer");
    await expect(inFlight).toContainText("Submitted, waiting for confirmation");
    await expect(inFlight).toContainText(inFlightTx);
    await expect(crediting).not.toContainText("Confirmed on Stellar");
    // The figure is still the promise: nothing has been paid yet.
    await expect(crediting).toContainText("Up to 0.0045 USDC to be credited");

    // The refund landed; the rating did not, and the receipt says which.
    const credited = stepRow(page, codeStep.agent_id);
    await expect(artifact(credited, "Refund transfer")).toContainText(
      "Confirmed on Stellar",
    );
    const rating = artifact(credited, "Dispute rating against");
    await expect(rating).toContainText("Submitted, waiting for confirmation");
    await expect(rating).not.toContainText("Confirmed on Stellar");
    await expect(credited).toContainText(
      `the dispute rating it costs ${codeStep.agent_id} is not confirmed yet`,
    );
    await attachShot(testInfo, "receipt — crediting", crediting);
    await attachShot(testInfo, "receipt — rating pending", credited);
  });

  test("a credit recorded without a refund transaction wears 'Refund in progress', never 'Refunded'", async ({
    page,
  }, testInfo) => {
    // `credited` with no transfer on record: the backend's own tooling holds
    // this as unreconciled, so the status alone proves no money moved.
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
          refund_tx: null,
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Refund in progress");
    await expect(row).not.toContainText("Refunded");
    const refund = artifact(row, "Refund transfer");
    await expect(refund).toContainText("Being sent");
    await expect(refund).not.toContainText("Confirmed on Stellar");
    // Nothing to link: there is no transaction to prove it.
    await expect(row.getByRole("link", { name: /refund/i })).toHaveCount(0);
    await expect(row).toContainText(
      "the refund transfer is not confirmed on Stellar yet",
    );
    // And the figure stays a promise.
    await expect(row).toContainText("Up to 0.027 USDC to be credited");
    await attachShot(testInfo, "receipt — credited, refund unconfirmed", row);
  });

  test("the credited amount and who funded it are one line", async ({
    page,
  }, testInfo) => {
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
          credited_usdc: 0.0265,
        }),
      ],
    });

    // One element, one sentence: a figure seen without its funder reads as
    // money clawed back from the agent, so the two are never split apart.
    const creditLine = stepRow(page, codeStep.agent_id)
      .locator("p")
      .filter({ hasText: /^credit · / });
    await expect(creditLine).toHaveText(
      "credit · 0.0265 USDC credited to your wallet — funded by the platform, not clawed back from the agent.",
    );
    await attachShot(testInfo, "receipt — credit line", creditLine);
  });

  test("an older backend's dispute, with none of the new fields, renders its amount as a promise and its rating as pending", async ({
    page,
  }) => {
    const openedAtS = nowS() - 40 * 60;
    // What the backend live today sends for a credited dispute: both hashes,
    // and none of story 4.06's four fields.
    const legacy: Dispute = {
      ...mockDispute(codeStep, {
        status: "credited",
        openedAtS,
        reason: "the calculator app does not compute anything",
      }),
      resolved_at: openedAtS + 600,
      refund_tx: mockRefundTx,
      rating_tx: mockRatingTx,
    };
    for (const key of [
      "credited_usdc",
      "updated_at",
      "rating_confirmed",
      "rejection_reason",
    ]) {
      expect(legacy).not.toHaveProperty(key);
    }
    await openReceipt(page, { disputes: [legacy] });

    // Drawn, not refused: no error anywhere on the page.
    const row = stepRow(page, codeStep.agent_id);
    await expect(
      row.getByRole("group", { name: /dispute receipt/i }),
    ).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

    // The only figure this backend knows is the promise made at opening, and
    // it is printed as one — "up to" — never as the amount a refund moved.
    const creditLine = row.locator("p").filter({ hasText: /^credit · / });
    await expect(creditLine).toHaveText(/^credit · Up to 0\.027 USDC /);
    await expect(creditLine).not.toHaveText(/^credit · [\d.]+ USDC credited/);
    await expect(row).not.toContainText("received 0.027");

    // A rating hash with no word that it landed is pending, not confirmed.
    const rating = artifact(row, "Dispute rating against");
    await expect(rating).toContainText("Submitted, waiting for confirmation");
    await expect(rating).not.toContainText("Confirmed on Stellar");
  });

  test("a wallet that did not pay sees the statuses and the links, but neither the buyer's reason nor the rejection's", async ({
    page,
  }) => {
    const openedAtS = nowS() - 40 * 60;
    const buyerReasons = [
      "the outline misses half of the brief",
      "the calculator app does not compute anything",
    ];
    // Paid for, and disputed, by someone else: the connected wallet is
    // `mockWalletAddress` — a stranger holding a shared trace link.
    await openReceipt(page, {
      payer: mockOtherOwnerAddress,
      disputes: [
        mockReceiptDispute(briefStep, {
          status: "rejected",
          openedAtS,
          reason: buyerReasons[0],
          payer: mockOtherOwnerAddress,
        }),
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS,
          reason: buyerReasons[1],
          payer: mockOtherOwnerAddress,
        }),
      ],
    });

    // THAT the steps were disputed, and how it went, is public — and so are
    // the refund and the rating: they are transactions on a public ledger.
    await expect(stepRow(page, briefStep.agent_id)).toContainText("Rejected");
    const credited = stepRow(page, codeStep.agent_id);
    await expect(credited).toContainText("Refunded");
    await expect(
      credited.getByRole("link", { name: /refund/i }),
    ).toHaveAttribute("href", testnetTx(mockRefundTx));
    await expect(
      credited.getByRole("link", { name: /rating/i }),
    ).toHaveAttribute("href", testnetTx(mockRatingTx));

    // The words on both sides were written for the buyer. Checked against
    // the serialised DOM, not the visible text: a reason tucked into an
    // attribute or an sr-only span is leaked all the same.
    const dom = await page.content();
    for (const reason of [...buyerReasons, mockRejectionReason]) {
      expect(dom).not.toContain(reason);
    }
  });

  test("at 360px a credited receipt with both full hashes fits without sideways scroll", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await openReceipt(page, {
      disputes: [
        mockReceiptDispute(codeStep, {
          status: "credited",
          openedAtS: nowS() - 40 * 60,
        }),
      ],
    });

    const row = stepRow(page, codeStep.agent_id);
    await expect(row.getByRole("link", { name: /refund/i })).toBeVisible();
    await expect(row.getByRole("link", { name: /rating/i })).toBeVisible();
    expect(await horizontalOverflow(receipt(page))).toEqual([]);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await attachShot(testInfo, "receipt — credited at 360px", row);
  });
});

/**
 * The receipt keeping up while the buyer watches (story 4.06's polling).
 *
 * The page's clock is Playwright's: installed before load so every timer the
 * page arms is fake, and frozen once the receipt is up so that no time passes
 * except what a test hands out with `runFor`. From then on a read can only
 * come from a timer `runFor` fired — or from something that is not a timer at
 * all, which is exactly what the hidden-tab test needs to tell apart.
 */
test.describe("dispute receipt while the page stays open", () => {
  /** The story's cadence while every unresolved dispute is still open. */
  const OPEN_POLL_MS = 30_000;
  /** …and while any is upheld or crediting: money is about to move. */
  const ACTIVE_POLL_MS = 5_000;

  /**
   * Installs the fake clock and opens the receipt on it, with the mock
   * server's `now` read off the page's clock: after a `runFor`, a read that
   * reported Node's time would wind the page's window countdown back.
   */
  async function openOnFakeClock(
    page: Page,
    disputes: (openedAtS: number) => readonly Dispute[],
  ): Promise<{ reads: MockDisputeReads; openedAtS: number }> {
    const start = Date.now();
    await page.clock.install({ time: start });
    const settledAtS = Math.floor(start / 1000) - HOUR_S;
    const openedAtS = settledAtS + 10 * 60;
    const reads = await openReceipt(page, {
      settledAtS,
      disputes: disputes(openedAtS),
      clock: () => page.evaluate(() => Date.now()),
    });
    return { reads, openedAtS };
  }

  /**
   * Stops the page's clock a second past where it stands. Not exactly where
   * it stands: the clock keeps flowing while this call travels, and pausing
   * at an instant it has already passed throws. A second is far inside the
   * margins the tests below leave around each cadence.
   */
  async function freezeClock(page: Page): Promise<void> {
    const pageNowMs = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(pageNowMs + 1_000);
  }

  /**
   * Lets any read a fired timer started reach the mock before a test counts
   * none. A request leaves the page the moment `fetch` is called, but it
   * reaches the route handler over another process's channel, so "nothing
   * arrived" is only worth asserting after a beat — and a second of real time
   * is orders of magnitude longer than that hop.
   */
  const networkBeat = (page: Page) => page.waitForTimeout(1_000);

  /**
   * Lets a test hide and show the tab. Headless Chromium reports a page
   * visible whatever is in front of it — there is no window to minimise and
   * no tab to cover it with on demand — so the two properties a page reads to
   * know, `document.hidden` and `document.visibilityState`, are overridden on
   * the document, and the event it listens for is fired by hand, bubbling as
   * the browser's own does. Installed before any page script runs, so the
   * page never reads the real properties at all.
   */
  function installVisibilityControl(): void {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    Object.assign(window, {
      __setTabHidden(next: boolean) {
        hidden = next;
        document.dispatchEvent(
          new Event("visibilitychange", { bubbles: true }),
        );
      },
    });
  }

  const setTabHidden = (page: Page, hidden: boolean) =>
    page.evaluate(
      (next) =>
        (
          window as unknown as { __setTabHidden: (h: boolean) => void }
        ).__setTabHidden(next),
      hidden,
    );

  test("an open dispute flips to credited with both links while the buyer watches, with no reload, and is announced", async ({
    page,
  }, testInfo) => {
    const { reads, openedAtS } = await openOnFakeClock(page, (openedAtS) => [
      mockReceiptDispute(codeStep, { status: "open", openedAtS }),
    ]);
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Under review");
    // Mounted, and silent: the status a receipt opens on is not a change,
    // and announcing it would talk over the page a reader just arrived on.
    const announcer = row.getByRole("status");
    await expect(announcer).toHaveAttribute("aria-live", "polite");
    await expect(announcer).toHaveText("");
    await freezeClock(page);
    // Survives anything but a reload: proof the flip happened in place.
    await page.evaluate(() => Object.assign(window, { __sameDocument: true }));
    const loaded = reads.count();

    // The platform upholds it. Short of the open cadence nothing is read…
    reads.answer([
      mockReceiptDispute(codeStep, {
        status: "upheld",
        openedAtS,
        updatedAtS: openedAtS + 20 * 60,
      }),
    ]);
    await page.clock.runFor(OPEN_POLL_MS - ACTIVE_POLL_MS);
    await networkBeat(page);
    expect(reads.count()).toBe(loaded);
    // …and at it, the receipt reads again and shows the decision.
    await page.clock.runFor(ACTIVE_POLL_MS);
    await expect(row).toContainText("Upheld");
    expect(reads.count()).toBe(loaded + 1);
    await attachShot(testInfo, "receipt — upheld", row);

    // Then the refund and the rating land, and five seconds is all it takes
    // for the receipt to say so: upheld is the fast cadence.
    reads.answer([
      mockReceiptDispute(codeStep, {
        status: "credited",
        openedAtS,
        updatedAtS: openedAtS + 21 * 60,
      }),
    ]);
    await page.clock.runFor(ACTIVE_POLL_MS);
    await expect(row).toContainText("Refunded");
    await expect(row.getByRole("link", { name: /refund/i })).toHaveAttribute(
      "href",
      testnetTx(mockRefundTx),
    );
    await expect(row.getByRole("link", { name: /rating/i })).toHaveAttribute(
      "href",
      testnetTx(mockRatingTx),
    );
    expect(reads.count()).toBe(loaded + 2);
    expect(
      await page.evaluate(
        () => (window as { __sameDocument?: boolean }).__sameDocument,
      ),
    ).toBe(true);

    // Heard as well as seen: one sentence in the polite live region, in the
    // badge's words rather than the backend's, and only the latest one — a
    // region holding both changes would read the whole history out again.
    await expect(announcer).toHaveText(
      `Your dispute against ${codeStep.agent_id} was refunded.`,
    );
    await attachShot(testInfo, "receipt — credited live", row);
  });

  test("once every dispute is credited or rejected, the receipt stops reading", async ({
    page,
  }) => {
    const { reads, openedAtS } = await openOnFakeClock(page, (openedAtS) => [
      mockReceiptDispute(briefStep, { status: "rejected", openedAtS }),
      mockReceiptDispute(codeStep, {
        status: "crediting",
        openedAtS,
        refund_tx: mockRefundTx,
      }),
    ]);
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Refund in progress");
    await freezeClock(page);
    const loaded = reads.count();

    // The positive control: while a refund is in flight the receipt reads on
    // the fast cadence, through this very mock — so the silence below is a
    // measurement, not a counter that could never have moved.
    reads.answer([
      mockReceiptDispute(briefStep, { status: "rejected", openedAtS }),
      mockReceiptDispute(codeStep, { status: "credited", openedAtS }),
    ]);
    await page.clock.runFor(ACTIVE_POLL_MS);
    await expect(row).toContainText("Refunded");
    expect(reads.count()).toBe(loaded + 1);

    // Both terminal now: a whole minute on the clock — twice the slow
    // cadence, twelve times the fast one — and not one more read.
    await page.clock.runFor(60_000);
    await networkBeat(page);
    expect(reads.count()).toBe(loaded + 1);
  });

  test("a hidden tab reads nothing, and reads at once when it is shown again", async ({
    page,
  }) => {
    await page.addInitScript(installVisibilityControl);
    const { reads, openedAtS } = await openOnFakeClock(page, (openedAtS) => [
      mockReceiptDispute(codeStep, { status: "upheld", openedAtS }),
    ]);
    const row = stepRow(page, codeStep.agent_id);
    await expect(row).toContainText("Upheld");
    await freezeClock(page);
    const loaded = reads.count();

    // Upheld is the fast cadence: two minutes would be 24 reads for a tab
    // anyone was looking at. Hidden, it is none.
    await setTabHidden(page, true);
    // The override took: the page itself believes it is in the background.
    expect(await page.evaluate(() => document.visibilityState)).toBe("hidden");
    await page.clock.runFor(120_000);
    await networkBeat(page);
    expect(reads.count()).toBe(loaded);

    // The refund landed meanwhile. Shown again, the receipt reads AT ONCE:
    // the clock is still frozen, so no timer can be what asked.
    reads.answer([
      mockReceiptDispute(codeStep, { status: "credited", openedAtS }),
    ]);
    await setTabHidden(page, false);
    await expect.poll(reads.count).toBe(loaded + 1);
    await expect(row).toContainText("Refunded");
  });
});
