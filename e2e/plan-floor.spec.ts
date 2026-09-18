/**
 * Story 3.04 — the plan card a buyer reads before authorizing payment, and the
 * SOW §6.1 evidence artifact for Deliverable 2: "a short recording/screenshots
 * of the decompose plan card showing on-chain reputation per agent, plus a
 * routing example where a sub-floor agent is excluded."
 *
 * These specs are what makes that sentence checkable. They assert structure and
 * behaviour — where a thing sits, what opens, which numbers appear — and never
 * the components' wording, which is still being written: a spec pinned to a
 * sentence gets weakened the first time the copy improves, and a weakened spec
 * is how the evidence quietly stops being true.
 *
 * Run isolated, always:  E2E_PORT=3181 npx playwright test e2e/plan-floor.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockApi,
  mockPlan,
  mockPlanDegraded,
  mockPlanExcluded,
  mockPlanFloorRelaxed,
  mockPlanLegacy,
  mockWallet,
} from "./mocks";
import { mockNetwork } from "./plan-fixtures";
import { scoreOutOfFive } from "../lib/reputation-math";
import type { DecomposeResponse } from "../lib/types";

type Viewport = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

/**
 * The frame Deliverable 2 is captured in: the content box of a laptop browser
 * window. The SOW promises one frame, so the height is part of the claim — if
 * the card outgrows it, the recording needs a scroll and the sentence stops
 * being literally true.
 */
const EVIDENCE_FRAME: Viewport = { width: 1440, height: 900 };

/** The narrow end of the phones that reach this console. */
const PHONE: Viewport = { width: 390, height: 844 };

/**
 * The exclusions disclosure. `<details>` is the contract rather than an
 * implementation detail: AC-3 asks for a panel that is shut on arrival and
 * opens on demand, and a real disclosure element is the only version of that
 * which a keyboard, a screen reader and a printed page all get for free.
 * Every test that touches it also pins the count at one, so this cannot
 * silently start matching some other collapsible.
 */
const exclusions = (page: Page) => page.locator("details");

/**
 * One refused agent. A list of them has to be marked up as a list or a table:
 * a screen-reader buyer needs to hear how many agents were refused and where
 * each entry begins, and the geometry checks below need a row box to measure
 * rather than a loose run of text.
 */
const exclusionRows = (page: Page) => exclusions(page).locator("li, tr");

/**
 * The warning that the scores on this plan were estimated rather than read
 * from the ledger.
 *
 * Located by live-region role plus the one word the warning cannot mean
 * anything without — never by its sentence, which is under review and
 * deliberately avoids "degraded". The role is not a wording constraint either:
 * a warning painted into the page without one is never announced, so a
 * screen-reader buyer authorizes the payment without ever hearing it.
 */
const estimateBanner = (page: Page) =>
  page
    .locator('[role="status"], [role="alert"]')
    .filter({ hasText: /estimat/i });

/** The plan's step rows — the first ordered list in the card. */
const steps = (page: Page) => page.locator("ol").first().getByRole("listitem");

/**
 * Per-agent reputation, found by its accessible label rather than its glyph or
 * its colour. The chip is what the SOW sentence means by "on-chain reputation
 * per agent", and a buyer using a screen reader has only this label to go on.
 */
const reputationChip = (step: Locator) => step.getByLabel(/reputation/i);

/**
 * The deciding number, in bps or as the 0–5 score the UI may print it as.
 * Which of the two the card shows is a presentation choice still under review;
 * that it shows the number at all is what the AC is about. The lookarounds
 * keep "5500" from matching inside "55000".
 */
const numberPattern = (bps: number) =>
  new RegExp(
    `(?<![\\d.])(${bps}|${scoreOutOfFive(bps).replace(".", "\\.")})(?![\\d.])`,
  );

/**
 * A bounding box read only once it has stopped moving. The card and its step
 * rows slide in under framer-motion (0.4s, plus a per-step delay), so a box
 * read on arrival measures the animation and not the layout — which is how a
 * geometry assertion turns into a coin flip.
 */
async function stableBox(target: Locator): Promise<Box> {
  let previous = "";
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox();
        const current = box === null ? "" : JSON.stringify(box);
        const settled = current !== "" && current === previous;
        previous = current;
        return settled;
      },
      { timeout: 15_000, message: "element never settled into a stable box" },
    )
    .toBe(true);
  const box = await target.boundingBox();
  if (box === null) throw new Error("expected a laid-out element");
  return box;
}

/**
 * Horizontal containment, which is the one that cannot be recovered by
 * scrolling: the console hides sideways overflow. Fails naming the element and
 * the edge it crossed, not just `false`.
 */
function expectWithinWidth(box: Box, frame: Viewport, what: string) {
  expect(box.x, `${what} is cut off at the left edge`).toBeGreaterThanOrEqual(
    0,
  );
  expect(
    box.x + box.width,
    `${what} runs past the ${frame.width}px frame`,
  ).toBeLessThanOrEqual(frame.width);
}

/**
 * Drives a real decompose against a chosen plan variant. The viewport is the
 * caller's business — half of these tests measure layout, and layout set after
 * the render is a different layout.
 */
async function decomposeWith(
  page: Page,
  plan: DecomposeResponse,
  options: { wallet?: boolean; network?: boolean } = {},
): Promise<void> {
  if (options.wallet) await mockWallet(page);
  await mockApi(page, { plan });
  // After `mockApi`, so it answers ahead of the catch-all. Without it the card
  // has no asset to name its amounts in and prints them bare.
  if (options.network) await mockNetwork(page);
  await page.goto("/app/orchestrator");
  await page.getByRole("textbox", { name: /intent/i }).fill(plan.intent);
  await page.getByRole("button", { name: /decompos/i }).click();
  await expect(
    page.getByRole("heading", { name: /execution plan/i }),
  ).toBeVisible();
}

test.describe("plan card — reputation, source and exclusions", () => {
  test("AC-7 — one frame carries per-agent reputation and the excluded sub-floor agent", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlanExcluded);

    // Every routed agent states its score, and states the fixture's own number:
    // the failure this guards against is a seeded or rounded placeholder, which
    // looks exactly like working software in a recording.
    for (const [index, step] of mockPlanExcluded.steps.entries()) {
      const chip = reputationChip(steps(page).nth(index));
      await expect(chip).toHaveCount(1);
      await expect(chip).toContainText(scoreOutOfFive(step.rep_bps));
    }

    // The exclusions arrive shut (AC-3). The evidence frame is therefore what a
    // buyer sees after one click on the disclosure — never after a scroll.
    await exclusions(page).locator("summary").click();
    await expect(exclusions(page)).toHaveJSProperty("open", true);
    await page.evaluate(() => window.scrollTo(0, 0));

    for (const notice of mockPlanExcluded.notices) {
      const row = exclusionRows(page).filter({ hasText: notice.agent_name });
      await expect(row).toHaveCount(1);
      // Its lower bound against the floor, as numbers. "below the floor" with
      // no figures is an assertion the buyer cannot check.
      await expect(row).toContainText(numberPattern(notice.lower_bound_bps));
      await expect(row).toContainText(numberPattern(notice.floor_bps));
      // …and why. An exclusion that never names the floor is not an
      // explanation, whatever sentence the panel settles on.
      await expect(row).toContainText(/floor/i);
    }

    // The measurement the SOW sentence turns on, and it is measured as a SPAN
    // rather than against the top of the document.
    //
    // The first draft required every one of these boxes to sit inside the
    // viewport with the page at scrollY 0 — so the page header, the intent
    // form and the card header all had to fit alongside them, and the
    // exclusion rows landed at 1174 of a 900px frame. That failure was real
    // but it was not the product's: nobody capturing this artifact
    // photographs the top of the document. They scroll to the plan and
    // capture the plan.
    //
    // What the SOW sentence actually requires is that reputation-per-agent
    // and the excluded agent with its reason can occupy ONE frame together.
    // That is a claim about how tall this content is, not about where it
    // happens to sit, so the assertion is the distance from the first
    // reputation chip to the last exclusion row. It still fails the day the
    // card grows past a frame — which is the protection worth keeping — and
    // it stops failing for a scroll position no evidence capture would use.
    //
    // Boxes, not toBeVisible(): Playwright calls an element visible when it
    // has a box anywhere in the document, including far below the fold, which
    // is exactly the state that would make the evidence sentence false.
    const evidenceBoxes: { label: string; box: Box }[] = [];
    for (const [index, step] of mockPlanExcluded.steps.entries()) {
      evidenceBoxes.push({
        label: `${step.agent_id}'s reputation`,
        box: await stableBox(reputationChip(steps(page).nth(index))),
      });
    }
    for (const notice of mockPlanExcluded.notices) {
      evidenceBoxes.push({
        label: `the ${notice.agent_id} exclusion`,
        box: await stableBox(
          exclusionRows(page).filter({ hasText: notice.agent_name }),
        ),
      });
    }

    const top = Math.min(...evidenceBoxes.map((e) => e.box.y));
    const bottom = Math.max(
      ...evidenceBoxes.map((e) => e.box.y + e.box.height),
    );
    const tallest = evidenceBoxes.reduce((a, b) =>
      a.box.y + a.box.height > b.box.y + b.box.height ? a : b,
    );
    expect(
      Math.ceil(bottom - top),
      `Deliverable 2's evidence must fit one ${EVIDENCE_FRAME.height}px frame; ` +
        `${tallest.label} pushes the span past it`,
    ).toBeLessThanOrEqual(EVIDENCE_FRAME.height);
  });

  test("AC-4 — the estimate warning is painted above the authorize button", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    // The wallet has to be connected for the authorize control to exist at all:
    // the AC is about the moment money is committed, not about a disabled
    // button on a page nobody can pay from.
    await decomposeWith(page, mockPlanDegraded, { wallet: true });

    const banner = estimateBanner(page);
    await expect(banner).toHaveCount(1);
    const authorize = page.getByRole("button", { name: /authorize/i });
    await expect(authorize).toBeVisible();

    const bannerBox = await stableBox(banner);
    const authorizeBox = await stableBox(authorize);
    // Geometry, not DOM order. A warning that comes first in the markup but
    // paints below the button — a flex `order`, a grid area, an absolutely
    // positioned footer — is a warning the buyer reads after paying. The boxes
    // must not even overlap.
    expect(
      bannerBox.y + bannerBox.height,
      "the warning must clear the top edge of the authorize button",
    ).toBeLessThanOrEqual(authorizeBox.y);
  });

  test("AC-4 — says nothing about estimates when every score was read from chain", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlanExcluded, { wallet: true });
    await expect(
      page.getByRole("button", { name: /authorize/i }),
    ).toBeVisible();

    // `reputation_degraded` is false here and the bounds beside the exclusions
    // are measurements. A banner that shows on every plan is one buyers learn
    // to scroll past, which costs nothing until the day the ledger really is
    // unreadable. (Vacuously true until the banner exists — it keeps its value
    // the moment it does.)
    await expect(estimateBanner(page)).toHaveCount(0);
  });

  test("AC-3 — the exclusions start shut, carry their count, and open to numbers", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlanExcluded);

    const panel = exclusions(page);
    // One disclosure on the page, so every `details` assertion here is about
    // this panel and not about some collapsible that arrives later.
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveJSProperty("open", false);

    const summary = panel.locator("summary");
    await expect(summary).toBeVisible();

    // The count is the half that has to survive being shut. A buyer who never
    // opens the panel still has to learn that agents were refused at all —
    // silence reads as "nothing was refused", which is a different plan.
    const excluded = mockPlanExcluded.notices.length;
    expect(
      (await summary.innerText()).trim(),
      "the shut summary must say how many agents were excluded",
    ).toMatch(new RegExp(`(?<![\\d.])${excluded}(?![\\d.])`));

    // Shut means shut: the reasons are not readable until asked for, which is
    // the whole point of spending a disclosure on them rather than an
    // always-open block that pushes the authorize control off the screen.
    await expect(
      panel.getByText(mockPlanExcluded.notices[0].agent_name),
    ).toBeHidden();

    await summary.click();
    await expect(panel).toHaveJSProperty("open", true);

    const rows = exclusionRows(page);
    await expect(rows).toHaveCount(excluded);
    for (const notice of mockPlanExcluded.notices) {
      const row = rows.filter({ hasText: notice.agent_name });
      await expect(row).toHaveCount(1);
      // Both deciding numbers, per row. `scrape.fast` is why: its smoothed
      // score (5750) is above the floor and it was still refused, because
      // routing decides on the lower bound (5283). A row that prints only one
      // of the two numbers cannot be checked by the person reading it.
      await expect(row).toContainText(numberPattern(notice.lower_bound_bps));
      await expect(row).toContainText(numberPattern(notice.floor_bps));
    }
  });

  test("AC-6 — the expanded exclusions fit a 390px viewport without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await decomposeWith(page, mockPlanExcluded);

    const summary = exclusions(page).locator("summary");
    await summary.click();
    await expect(exclusions(page)).toHaveJSProperty("open", true);

    const rows = exclusionRows(page);
    await expect(rows).toHaveCount(mockPlanExcluded.notices.length);

    // Width only — a phone scrolls down, that is what phones do. Sideways is
    // the direction that cannot be recovered: the console sets
    // `overflow-x: hidden` and the card clips its own overflow, so a row past
    // the right edge is not scrolled to, it is gone. A refused agent whose
    // numbers are cut in half is worse than one the buyer was never told
    // about, because it still looks like an answer.
    expectWithinWidth(
      await stableBox(summary),
      PHONE,
      "the exclusions summary",
    );
    for (const [index, notice] of mockPlanExcluded.notices.entries()) {
      expectWithinWidth(
        await stableBox(rows.nth(index)),
        PHONE,
        `the ${notice.agent_id} row`,
      );
    }

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      overflow,
      "expanding the exclusions must not make the page scroll sideways",
    ).toBeLessThanOrEqual(1);
  });

  test("the expanded card, warning and all, has no WCAG A/AA violations", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlanDegraded, { wallet: true });

    await exclusions(page).locator("summary").click();
    await expect(exclusions(page)).toHaveJSProperty("open", true);
    await expect(estimateBanner(page)).toHaveCount(1);

    // e2e/a11y.spec.ts sweeps /app/orchestrator with an empty intent box, so
    // none of this state — a plan, an expanded disclosure, a live-region
    // warning — has ever reached axe. It is also the state that most wants
    // checking: three components composed by a fourth, each carrying meaning
    // in colour, and a decision about money at the end of it.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      violations.map(
        (v) => `${v.id} [${v.impact}] ${v.nodes.length} node(s) — ${v.help}`,
      ),
    ).toEqual([]);
  });

  test("renders a plan from a backend that predates the floor fields", async ({
    page,
  }) => {
    // A thrown render is the failure mode that matters here: React unmounts the
    // tree and the buyer gets the error boundary instead of their plan.
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(e.message));

    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlanLegacy);

    // Frontend and backend deploy separately, so this is not a hypothetical
    // payload — it is what the console renders against during a rollback or a
    // lagging deploy. No `floor_bps`, no `reputation_degraded`, and notices
    // with prose only.
    await expect(steps(page)).toHaveCount(mockPlanLegacy.steps.length);
    for (const step of mockPlanLegacy.steps) {
      await expect(steps(page).filter({ hasText: step.agent_id })).toHaveCount(
        1,
      );
    }
    // Bare, because this mock serves no network metadata to name the escrow's
    // asset with — the card prints no unit rather than guess one.
    await expect(
      page
        .getByText(mockPlanLegacy.total_usdc.toFixed(3), { exact: true })
        .first(),
    ).toBeVisible();

    // An old backend's prose is the only explanation it can give for the shape
    // of the plan. Dropping it because the structured fields are missing would
    // leave a substitution the buyer can see but nothing that accounts for it.
    for (const notice of mockPlanLegacy.notices) {
      expect(
        await page.getByText(notice.reason).count(),
        "the pre-3.02 notice prose must still reach the card",
      ).toBeGreaterThan(0);
    }

    // No error state anywhere in the console's own content. Scoped to `main`
    // because `next dev` mounts its error-overlay portal as an empty
    // `role="alert"` outside the app shell on every page — unscoped, this
    // assertion measures the dev server rather than the card.
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(crashes, "a pre-3.02 payload must not throw in the card").toEqual(
      [],
    );
  });

  test("says in words whether a score was read from chain or assumed", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlan);

    // 3.50 read from the ledger and 3.50 taken from the prior are the same
    // digits and two different claims — one is evidence, the other is where
    // every unrated agent starts. The card separates them with a tint and a
    // `≈`, and neither reaches a buyer who is listening rather than looking, so
    // the accessible label is where the distinction has to survive.
    for (const [index, step] of mockPlan.steps.entries()) {
      const chip = steps(page)
        .nth(index)
        .getByLabel(/reputation|estimat/i);
      await expect(chip).toHaveCount(1);
      await expect(chip).toContainText(scoreOutOfFive(step.rep_bps));

      const label = (await chip.getAttribute("aria-label")) ?? "";
      // "no on-chain ratings yet" also contains "on-chain", so the prior is the
      // case that must name itself; an on-chain score is then whatever does not
      // describe itself as one.
      if (step.rep_source === "prior") {
        expect(
          label,
          `${step.agent_id} carries the prior and has to say so`,
        ).toMatch(/prior|estimat/i);
      } else {
        expect(
          label,
          `${step.agent_id} was read from chain and must not read as an estimate`,
        ).not.toMatch(/prior|estimat/i);
      }
    }
  });
});

/** The routing-floor summary above the steps, by its accessible name. */
const floorSummary = (page: Page) =>
  page.getByRole("region", { name: /routing floor/i });

test.describe("plan card — what each claim rests on", () => {
  test("a floor-relaxed plan marks the re-admitted step and says the floor moved", async ({
    page,
  }) => {
    await page.setViewportSize(EVIDENCE_FRAME);
    await decomposeWith(page, mockPlanFloorRelaxed);

    // The compromise is marked on the step itself, where the buyer is looking,
    // and on no other: a below-floor mark on a clean pick would be as false as
    // a missing one on the re-admitted agent.
    await expect(steps(page)).toHaveCount(mockPlanFloorRelaxed.steps.length);
    for (const [index, step] of mockPlanFloorRelaxed.steps.entries()) {
      await expect(
        steps(page)
          .nth(index)
          .getByText(/below floor/i),
        `${step.agent_id}'s below-floor mark`,
      ).toHaveCount("degraded" in step && step.degraded ? 1 : 0);
    }

    // …and the plan-level frame says the floor it states was not, in the
    // end, the floor enforced.
    const summary = floorSummary(page);
    await expect(summary).toContainText(
      numberPattern(mockPlanFloorRelaxed.floor_bps),
    );
    await expect(summary).toContainText(/relaxed/i);
  });
});
