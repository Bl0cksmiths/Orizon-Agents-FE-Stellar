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
import {
  mockApi,
  mockPlanDegraded,
  mockPlanExcluded,
  mockWallet,
} from "./mocks";
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

/** Fails naming the element and the edge it crossed, not just `false`. */
function expectInFrame(box: Box, frame: Viewport, what: string) {
  expect(box.y, `${what} is cut off above the frame`).toBeGreaterThanOrEqual(0);
  expect(
    box.y + box.height,
    `${what} falls below the ${frame.height}px frame`,
  ).toBeLessThanOrEqual(frame.height);
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
  options: { wallet?: boolean } = {},
): Promise<void> {
  if (options.wallet) await mockWallet(page);
  await mockApi(page, { plan });
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

    // The measurement the SOW sentence turns on. Boxes, not toBeVisible():
    // Playwright calls an element visible when it has a box anywhere in the
    // document, including 400px below the fold, which is exactly the state
    // that would make the evidence sentence false.
    for (const [index, step] of mockPlanExcluded.steps.entries()) {
      expectInFrame(
        await stableBox(reputationChip(steps(page).nth(index))),
        EVIDENCE_FRAME,
        `${step.agent_id}'s reputation`,
      );
    }
    for (const notice of mockPlanExcluded.notices) {
      expectInFrame(
        await stableBox(
          exclusionRows(page).filter({ hasText: notice.agent_name }),
        ),
        EVIDENCE_FRAME,
        `the ${notice.agent_id} exclusion`,
      );
    }
    expect(
      await page.evaluate(() => window.scrollY),
      "the evidence frame must not depend on the page being scrolled",
    ).toBe(0);
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
});
