/**
 * Payloads the backend could send that this build only partly understands:
 * an agent with a status it has no tone for, an agent missing a field every
 * row needs, a reputation entry with a source it does not know, and one with
 * a field of the wrong type.
 *
 * Kept out of `mocks.ts` on purpose. These are not the registry any spec
 * counts against; they are single, deliberate defects laid over it, and each
 * spec that uses one says which.
 *
 * The raw helpers answer ONE route with an arbitrary body, typed `unknown`
 * because a malformed payload is the point. Register them AFTER `mockApi`:
 * Playwright tries the most recently added matching route first.
 */
import type { Page } from "@playwright/test";
import type { Agent, ReputationBatch } from "../lib/types";
import { mockAgents, mockReputationBatch } from "./mocks";

/** A status a newer backend might add. Well-formed in every other way. */
export const unknownStatusAgent: Agent = {
  id: "suspended_bot",
  name: "Suspended Bot",
  skills: ["translation"],
  price: 0.04,
  rep: 4.1,
  status: "suspended",
  runs: 12,
  real: false,
  owner: null,
  source: "seeded",
  bound: null,
};

/** An agent with a null price, which every row formats with `toFixed`. It
 *  cannot be rendered, so it is dropped — and must be counted. */
export const malformedAgent: unknown = {
  ...mockAgents[0],
  id: "no_price_bot",
  name: "No Price Bot",
  price: null,
};

/**
 * The registry with both defects laid over the healthy fixtures. Before
 * per-item screening, either one alone replaced every row with "couldn't load
 * agents".
 */
export const agentsWithDefects: unknown[] = [
  ...mockAgents,
  unknownStatusAgent,
  malformedAgent,
];

/**
 * The healthy batch with `weather_bot`'s entry corrupted (a string where a
 * number belongs) and an extra entry carrying a source this build does not
 * know. The corrupt entry is dropped, so `weather_bot` reads "no score"; the
 * unknown source is not a defect and must not cost any row its score.
 */
export const batchWithDefects: unknown = {
  ...mockReputationBatch,
  reputations: {
    ...mockReputationBatch.reputations,
    weather_bot: {
      ...mockReputationBatch.reputations.weather_bot,
      smoothed_bps: "7420",
    },
    cached_bot: {
      ...mockReputationBatch.reputations.agt_11c0,
      agent_id: "cached_bot",
      source: "cached",
    },
  },
} satisfies Record<keyof ReputationBatch, unknown>;

async function answerWith(
  page: Page,
  match: string | ((url: URL) => boolean),
  body: unknown,
) {
  await page.route(match, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

/** `GET /api/agents` answers with `body`, verbatim. */
export async function mockRawAgents(page: Page, body: unknown): Promise<void> {
  // By path, so the registry's paged read (`/api/agents?limit=50`) is
  // answered too — verbatim, as a server that does not page.
  await answerWith(page, (url) => url.pathname === "/api/agents", body);
}

/** `GET /api/stellar/reputation` answers with `body`, verbatim. */
export async function mockRawReputation(
  page: Page,
  body: unknown,
): Promise<void> {
  await answerWith(page, "**/api/stellar/reputation", body);
}
