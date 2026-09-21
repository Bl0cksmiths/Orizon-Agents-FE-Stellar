import type { Page, Route } from "@playwright/test";
import type {
  CreditPolicy,
  DecomposeResponse,
  Dispute,
  DisputeStatus,
  OpenDisputeReq,
  ReputationBatch,
  SettlementStepView,
  SettlementView,
  TaskDisputes,
  TraceLine,
} from "../lib/types";

/**
 * Mock payloads shaped to satisfy lib/guards.ts (isOverview, isTaskList,
 * isDecomposeResponse) so lib/api.ts accepts them exactly like real backend
 * responses. Values are chosen to be distinctive so specs can assert them.
 */

export const mockOverview = {
  agents_online: 2481,
  tasks_per_sec: 1.234,
  avg_completion: 0.984,
  avg_trust: 4.87,
  throughput: [12, 18, 9, 22, 30, 25, 14, 19, 27, 31, 24, 16],
  skills: [
    { name: "code", pct: 42, tone: "violet" },
    { name: "design", pct: 31, tone: "cyan" },
    { name: "research", pct: 27, tone: "magenta" },
  ],
};

export const mockTasks = [
  {
    id: "task_e2e_001",
    intent: "build a landing page for pulse ai",
    agents: 3,
    spent: 0.166,
    status: "complete",
    started: "2026-07-27 10:00",
  },
  {
    id: "task_e2e_002",
    intent: "audit the escrow contract",
    agents: 2,
    spent: 0.045,
    status: "running",
    started: "2026-07-27 10:05",
  },
];

export const mockPlan = {
  plan_id: "plan_e2e_1",
  intent: "code a calculator web app",
  steps: [
    // Every step carries the score the backend stamps on it (`_rep_fields` in
    // orchestrator_svc.py). Without these the card renders no reputation at
    // all, and the SOW §6.1 evidence sentence — "the decompose plan card
    // showing on-chain reputation per agent" — has no first half.
    {
      agent_id: "seo.brief",
      agent_name: "seo.brief",
      rationale: "outline requirements and keywords",
      est_price_usdc: 0.009,
      est_eta_seconds: 1.2,
      // Never rated, so it carries the prior itself — and is routed anyway,
      // because `lowerBoundBps(7000, 0)` is 5677 and that clears the 5500
      // floor. A cold-start agent is not a sub-floor agent.
      rep_bps: 7000,
      rep_source: "prior",
    },
    {
      agent_id: "design.figma",
      agent_name: "design.figma",
      rationale: "produce the interface layout",
      est_price_usdc: 0.048,
      est_eta_seconds: 2.4,
      // story 3.02 — this step replaced a sub-floor designated agent.
      substituted_for: "vision.ocr",
      // Rated 8600 over 18 USDC → smoothed 7960, lower bound 7224: the kind of
      // standing that earns a substitution in.
      rep_bps: 7960,
      rep_source: "onchain",
    },
    {
      agent_id: "code.next",
      agent_name: "code.next",
      rationale: "implement and wire up the app",
      est_price_usdc: 0.066,
      est_eta_seconds: 3.1,
      // story 3.02 — re-admitted below the floor by the starvation backstop.
      degraded: true,
      // Rated 5060 over 117 USDC → smoothed 5240, whose lower bound is exactly
      // the 4800 the notice below quotes. The step's headline score therefore
      // reads 2.62 while it sits below a 2.75 floor, which is the honest shape
      // of a backstop re-admission rather than a contradiction.
      rep_bps: 5240,
      rep_source: "onchain",
    },
  ],
  total_usdc: 0.123,
  total_eta: 6.7,
  // story 3.02 — the floor this plan was actually built against. Sent by the
  // backend rather than assumed here, because it is deployment configuration:
  // a hardcoded copy would narrate the wrong threshold the day it changes.
  floor_bps: 5500,
  // No reputation read fell back to the prior while planning this. It matters
  // that it is false and not merely absent: the two notices below quote
  // measured on-chain bounds, and a degraded read would make those numbers
  // estimates, which is a different sentence on the card.
  reputation_degraded: false,
  // story 3.02 — the floor actions behind the step marks above.
  //
  // Both excluded agents sit below the floor because they were RATED DOWN, and
  // that is the only way a fixture may put an agent below it. A never-rated
  // agent is not a low-scoring one: with no entry at all its Wilson lower
  // bound comes off the Bayesian prior at 5677 bps, which CLEARS the 5500
  // floor. A fixture that gave a cold-start agent a sub-floor bound would have
  // every assertion built on it measuring the inverse of the guarantee.
  notices: [
    {
      kind: "substituted",
      agent_id: "vision.ocr",
      agent_name: "vision.ocr",
      replacement_id: "design.figma",
      replacement_name: "design.figma",
      reason: "below routing floor (4200 < 5500 bps)",
      reason_code: "below_floor",
      // The same two numbers as the prose beside them, as data: rendering
      // "4200 against a 5500 floor" must not require parsing English.
      lower_bound_bps: 4200,
      floor_bps: 5500,
    },
    {
      kind: "degraded",
      agent_id: "code.next",
      agent_name: "code.next",
      reason: "re-admitted by starvation backstop (4800 < 5500 bps)",
      // Not "below_floor": this agent IS below the floor, but the notice is
      // about the backstop relaxing the floor to keep the plan workable. The
      // step still carries `degraded: true` — the buyer is told it was a
      // compromise, not sold it as a clean pick.
      reason_code: "floor_relaxed",
      lower_bound_bps: 4800,
      floor_bps: 5500,
    },
  ],
  // Checked against the response contract rather than merely resembling it: a
  // `rep_source` of "onchian" or a `reason_code` the union does not name would
  // otherwise sail through here and fail in a browser, as a missing badge that
  // reads like a product bug.
} satisfies DecomposeResponse;

// ── Plan-card floor variants (story 3.04) ───────────────────

/**
 * THE RULE every fixture below obeys, written down because breaking it
 * inverts the guarantee this sprint is evidence for:
 *
 *   an agent may sit BELOW the routing floor only if it was RATED DOWN.
 *
 * A never-rated agent is not a low-scoring agent. With no entry at all it
 * carries the Bayesian prior — 7000 bps over 12 USDC of prior mass — and
 * `lowerBoundBps(7000, 0)` returns 5677, which CLEARS the 5500 floor
 * (lib/reputation-math.test.ts pins that exact number). A fixture that parked
 * a cold-start agent below the floor would make every assertion built on it
 * measure the opposite of what the card is supposed to prove.
 *
 * So each figure here is what lib/reputation-math.ts actually returns for the
 * stated evidence, and the card's numbers can be reasoned about end to end:
 *
 *   agent          mean / weight   smoothed   lower bound   vs 5500 floor
 *   seo.brief       9400 /  30      8714       8197          clears
 *   design.figma    8600 /  18      7960       7224          clears
 *   code.next       6500 /  60      6583       6024          clears
 *   vision.ocr      4000 /  24      5000       4167          BELOW, rated down
 *   scrape.fast     5600 / 100      5750       5283          BELOW, rated down
 *   audio.whisper   5000 /  40      5461       4771          BELOW, rated down
 *   never rated        — /   0      7000       5677          clears
 */

/**
 * The SOW §6.1 evidence case: a plan whose routed agents all carry on-chain
 * reputation, and which names the sub-floor agents it refused to route.
 *
 * `scrape.fast` is the fixture that earns its keep. Its smoothed score is 5750
 * — above the 5500 floor — and it is still excluded, because routing decides
 * on the Wilson lower bound (5283) and not on the headline number. A card that
 * printed the smoothed score next to the floor would look self-contradictory
 * here, which is precisely the bug worth catching before a buyer sees it.
 */
export const mockPlanExcluded = {
  plan_id: "plan_e2e_excluded",
  intent: "code a calculator web app",
  steps: [
    {
      agent_id: "seo.brief",
      agent_name: "seo.brief",
      rationale: "outline requirements and keywords",
      est_price_usdc: 0.009,
      est_eta_seconds: 1.2,
      rep_bps: 8714,
      rep_source: "onchain",
    },
    {
      agent_id: "design.figma",
      agent_name: "design.figma",
      rationale: "produce the interface layout",
      est_price_usdc: 0.048,
      est_eta_seconds: 2.4,
      rep_bps: 7960,
      rep_source: "onchain",
    },
    {
      agent_id: "code.next",
      agent_name: "code.next",
      rationale: "implement and wire up the app",
      est_price_usdc: 0.066,
      est_eta_seconds: 3.1,
      rep_bps: 6583,
      rep_source: "onchain",
    },
  ],
  total_usdc: 0.123,
  total_eta: 6.7,
  floor_bps: 5500,
  // Every bound quoted below was read from the ledger, so the numbers on the
  // card are measurements rather than estimates.
  reputation_degraded: false,
  notices: [
    {
      kind: "excluded",
      agent_id: "vision.ocr",
      agent_name: "vision.ocr",
      reason: "below routing floor (4167 < 5500 bps)",
      reason_code: "below_floor",
      lower_bound_bps: 4167,
      floor_bps: 5500,
    },
    {
      kind: "excluded",
      agent_id: "scrape.fast",
      agent_name: "scrape.fast",
      reason: "below routing floor (5283 < 5500 bps)",
      reason_code: "below_floor",
      lower_bound_bps: 5283,
      floor_bps: 5500,
    },
  ],
} satisfies DecomposeResponse;

/**
 * The same plan, built while the ledger was partly unreadable.
 *
 * `reputation_degraded` is the response-level flag for "at least one read fell
 * back to the prior", which is why it can be true while the two exclusions
 * still quote measured bounds: those two reads succeeded, `code.next`'s did
 * not. That is the honest shape of a partial outage, and it is the state the
 * buyer has to be warned about before authorizing — the score they are
 * weighing for `code.next` is 7000 because that is the prior, not because
 * anyone rated it 3.50.
 */
export const mockPlanDegraded = {
  ...mockPlanExcluded,
  plan_id: "plan_e2e_degraded",
  steps: [
    mockPlanExcluded.steps[0],
    mockPlanExcluded.steps[1],
    {
      ...mockPlanExcluded.steps[2],
      // The prior itself, unmoved: a failed read yields no evidence, so the
      // only honest number is the one every unrated agent starts from.
      rep_bps: 7000,
      rep_source: "prior",
    },
  ],
  reputation_degraded: true,
} satisfies DecomposeResponse;

/**
 * A plan the starvation backstop had to rescue: applying the 5500 floor left
 * no agent able to do the third step, so the floor was relaxed and
 * `audio.whisper` was re-admitted at a lower bound of 4771.
 *
 * `kind` is "degraded" and not "excluded" on purpose — nothing was refused
 * here, the threshold moved — while `reason_code` is `floor_relaxed`. The step
 * keeps `degraded: true` so the compromise is marked where the buyer is
 * looking, not only in the summary. A card that states the applied floor
 * without this sentence tells the buyer a number that was not, in the end,
 * enforced.
 */
export const mockPlanFloorRelaxed = {
  plan_id: "plan_e2e_relaxed",
  intent: "transcribe and summarize a podcast episode",
  steps: [
    mockPlanExcluded.steps[0],
    mockPlanExcluded.steps[1],
    {
      agent_id: "audio.whisper",
      agent_name: "audio.whisper",
      rationale: "transcribe the audio track",
      est_price_usdc: 0.031,
      est_eta_seconds: 4.4,
      rep_bps: 5461,
      rep_source: "onchain",
      degraded: true,
    },
  ],
  total_usdc: 0.088,
  total_eta: 8.0,
  floor_bps: 5500,
  reputation_degraded: false,
  notices: [
    {
      kind: "degraded",
      agent_id: "audio.whisper",
      agent_name: "audio.whisper",
      reason: "re-admitted by starvation backstop (4771 < 5500 bps)",
      reason_code: "floor_relaxed",
      lower_bound_bps: 4771,
      floor_bps: 5500,
    },
  ],
} satisfies DecomposeResponse;

/**
 * What a backend deployed before story 3.02 sends: no `floor_bps`, no
 * `reputation_degraded`, and a notice carrying prose only — no `reason_code`,
 * no `lower_bound_bps`, no per-notice floor.
 *
 * The frontend and the backend deploy separately, so this payload is not
 * hypothetical; it is what the console renders against for however long a
 * rollback or a lagging Render deploy lasts. Every new field is optional in
 * lib/types.ts for that reason, and the card has to survive all of them being
 * absent — a plan the buyer cannot read is worse than a plan without a floor
 * summary. Reputation itself predates 3.02, so the steps keep their scores.
 */
export const mockPlanLegacy = {
  plan_id: "plan_e2e_legacy",
  intent: "code a calculator web app",
  steps: [
    mockPlanExcluded.steps[0],
    mockPlanExcluded.steps[1],
    mockPlanExcluded.steps[2],
  ],
  total_usdc: 0.123,
  total_eta: 6.7,
  notices: [
    {
      kind: "substituted",
      agent_id: "vision.ocr",
      agent_name: "vision.ocr",
      replacement_id: "design.figma",
      replacement_name: "design.figma",
      reason: "below routing floor (4167 < 5500 bps)",
    },
  ],
} satisfies DecomposeResponse;

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Intercepts every /api/* request the app can make (all data fetching is
 * client-side and /api is a pure rewrite proxy, so this catches everything)
 * and fulfills it with mocked JSON — no backend needed.
 */
/**
 * Shapes copied from the live backend. They exist because the runtime guards
 * in lib/guards.ts now reject the catch-all `{}` below — a spec that visits
 * /app/flow or /app/reputation would otherwise land in an error state and look
 * like a product bug rather than a missing fixture.
 */
export const mockFlow = {
  nodes: [
    { id: "in", label: "intent", sub: "user input", x: 4, y: 50 },
    { id: "seo", label: "seo.brief", sub: "research", x: 26, y: 22 },
    { id: "copy", label: "copywrite.v3", sub: "content", x: 50, y: 22 },
    { id: "out", label: "artifact", sub: "delivered", x: 92, y: 50 },
  ],
  edges: [
    ["in", "seo"],
    ["seo", "copy"],
    ["copy", "out"],
  ],
};

export const mockReputationParams = {
  enabled: true,
  prior_bps: 7000,
  prior_weight_usdc: 12.0,
  floor_bps: 5500,
  max_rating_weight_usdc: 100.0,
  read_ttl_seconds: 15.0,
  wilson_z: 1.0,
  epoch_seconds: 604800,
  decay_bps_per_epoch: 9250,
  max_decay_epochs: 96,
  contract_id: "CDFWQJY72GPH7PEQVFGBDZESZNVRF6LQLVWU42CFMWPGRME5RWN5AXSX",
  network: "mainnet",
};

/**
 * The batch every reputation-aware surface reads. Four deliberately different
 * states, because they render as four different sentences:
 *
 *   - `agt_11c0`   scored on-chain, comfortably above the floor;
 *   - `weather_bot` scored on-chain but with a lower bound only just clear of
 *     it — the interesting case, since routing uses the bound and not the
 *     headline score;
 *   - `unbound_bot` never rated, so it carries the Bayesian prior — and its
 *     lower bound of 5677 CLEARS the 5500 floor. That is the honest cold-start
 *     position of a brand-new agent: reputation is not what holds it back.
 *     What an operator sees as "not eligible" on something they just
 *     registered is the endpoint gate, and the two must not be conflated.
 *   - `rated_down_bot` the only entry the floor excludes, and the only way an
 *     agent can be there: it was rated down.
 *
 * THE ARITHMETIC RULE, which every future edit to this fixture has to respect:
 * the floor is 5500 bps and the prior is 7000 bps, so a never-rated agent's
 * lower bound is `lowerBoundBps(7000, 0)` = 5677 — it CLEARS the floor
 * (lib/reputation-math.test.ts pins the number). A cold start therefore cannot
 * sit below the floor at any weight; only evidence can put it there. Any
 * below-floor fixture must be an agent with ratings behind it, or it encodes a
 * position the system cannot produce and every assertion resting on it
 * measures the inverse of the guarantee.
 *
 * That is not hypothetical: `unbound_bot`'s bound used to read 5100, a value
 * no cold-start agent can have, and it quietly inverted the guarantee the
 * reputation work exists to make.
 *
 * `rated_down_bot` is worked from the real math rather than chosen to look
 * right — mean 5400 bps over 20.4 USDC of settled weight gives
 * `smoothedBps` = 5992 and `lowerBoundBps` = 5131. That is the case the whole
 * design turns on: the smoothed score (3.00) is ABOVE the 2.75 floor while the
 * lower bound (2.57) is below it, so a row that showed the headline score next
 * to the floor would read as self-contradictory — routing gates on the bound.
 *
 * Without this, `GET /api/stellar/reputation` fell through to the catch-all
 * `{}`, `isReputationBatch` rejected it, and every score silently became a
 * seeded placeholder — a fixture gap that reads as working software.
 */
export const mockReputationBatch: ReputationBatch = {
  floor_bps: 5500,
  prior_bps: 7000,
  reputations: {
    agt_11c0: {
      agent_id: "agt_11c0",
      smoothed_bps: 9200,
      lower_bound_bps: 8410,
      avg_bps: 9350,
      count: 128,
      weight: 6.912,
      disputed: 0,
      dispute_rate_bps: 0,
      source: "onchain",
      degraded: false,
    },
    weather_bot: {
      agent_id: "weather_bot",
      smoothed_bps: 7420,
      lower_bound_bps: 5746,
      avg_bps: 7750,
      count: 8,
      weight: 1.29,
      disputed: 0,
      dispute_rate_bps: 0,
      source: "onchain",
      degraded: false,
    },
    unbound_bot: {
      agent_id: "unbound_bot",
      smoothed_bps: 7000,
      // 5677, not a number chosen to look plausible. It is what
      // `lower_bound_bps(7000, 0)` actually returns, and it CLEARS the 5500
      // floor by 177 bps. This fixture previously carried 5100 — arithmetically
      // impossible for a cold start — which made every e2e assertion about a
      // newly registered agent measure the inverse of the guarantee the sprint
      // rests on: permissionless registration is not a dead end.
      lower_bound_bps: 5677,
      avg_bps: 7000,
      count: 0,
      weight: 0,
      disputed: 0,
      dispute_rate_bps: 0,
      source: "prior",
      degraded: false,
    },
    // Rated down, not cold: 24 rated jobs carrying 20.4 USDC of weight, six of
    // them disputed (2500 bps = 25.0%). The evidence is what puts the lower
    // bound under the floor, and the count and dispute rate are the evidence —
    // an excluded agent still has to show them, or "not routable" reads as
    // "unknown" rather than as a verdict the buyer can check.
    rated_down_bot: {
      agent_id: "rated_down_bot",
      smoothed_bps: 5992,
      lower_bound_bps: 5131,
      avg_bps: 5400,
      count: 24,
      weight: 20.4,
      disputed: 6,
      dispute_rate_bps: 2500,
      source: "onchain",
      degraded: false,
    },
  },
};

/**
 * The same registry when the reputation service cannot read the ledger.
 *
 * Every entry is the Bayesian prior with `degraded: true`, because that is
 * what a failed read actually produces: the service fails OPEN and serves the
 * prior in place of the score it could not fetch. Faking a degraded flag over
 * the real numbers would describe a state the backend never emits.
 *
 * The flag is the entire point. `source: "prior"` on its own is also what a
 * genuine never-rated newcomer looks like, so without `degraded` a page cannot
 * tell "this agent has no history" from "we could not read any history", and
 * the buyer is shown an estimate presented as a measurement.
 *
 * Derived from the healthy batch's keys rather than written out, so an agent
 * added to one can never go missing from the other. The 5677 lower bound is
 * `lowerBoundBps(7000, 0)`, pinned by lib/reputation-math.test.ts — and it
 * clears the floor, so a degraded read excludes nobody. Losing the ledger must
 * not silently unroute the whole registry.
 */
export const mockReputationBatchDegraded: ReputationBatch = {
  floor_bps: mockReputationBatch.floor_bps,
  prior_bps: mockReputationBatch.prior_bps,
  reputations: Object.fromEntries(
    Object.keys(mockReputationBatch.reputations).map((agentId) => [
      agentId,
      {
        agent_id: agentId,
        smoothed_bps: mockReputationBatch.prior_bps,
        lower_bound_bps: 5677,
        avg_bps: mockReputationBatch.prior_bps,
        count: 0,
        weight: 0,
        disputed: 0,
        dispute_rate_bps: 0,
        source: "prior" as const,
        degraded: true,
      },
    ]),
  ),
};

/**
 * Fails every `/api/*` call the way the production outage did: a 404 carrying
 * the backend's real error envelope. This is deliberately indistinguishable
 * from a healthy backend behind a misconfigured proxy — the exact condition
 * that ran unnoticed in production for days.
 */
export async function mockApiOutage(page: Page): Promise<void> {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Not Found",
        error: {
          code: "not_found",
          message: "Not Found",
          request_id: "e2e0000000000000",
        },
      }),
    }),
  );
}

/**
 * Fails ONLY the reputation batch, as a 503 carrying the backend's error
 * envelope, while every other `/api/*` call keeps its fixture.
 *
 * That partial outage is the case worth a helper: the registry still renders
 * because the batch is best-effort, so nothing on the page changes shape, and
 * a failure the layout does not reflect is one only the copy can report.
 *
 * Register it AFTER `mockApi` — Playwright tries the most recently added
 * matching route first, so this one wins for the batch alone.
 */
export async function mockReputationUnavailable(page: Page): Promise<void> {
  await page.route("**/api/stellar/reputation", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Service Unavailable",
        error: {
          code: "reputation_unavailable",
          message: "reputation service unavailable",
          request_id: "e2e0000000000003",
        },
      }),
    }),
  );
}

// ── Agent endpoint binding (story 2.01) ─────────────────────

/** The agent the bind spec drives, and the wallet that owns it. */
export const mockBindAgentId = "weather_bot";
export const mockWalletAddress =
  "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

/**
 * Somebody else's registering wallet. Well-formed (56 base32 characters) but
 * not an account that exists, and deliberately never the connected wallet: an
 * on-chain agent owned here is one the marketplace lists and the operator
 * surfaces must leave alone. Keeping `rated_down_bot` on this address is what
 * stops it from changing what `e2e/operator.spec.ts` and
 * `e2e/agents-unbound.spec.ts` count as "the wallet's own agents".
 */
export const mockOtherOwnerAddress =
  "GCXQ7T5LMJ4RZB2NPKAH6WVUE3SFDYG2CQ5TMXJ7RLB4NZKAH6WVUE3S";

/**
 * The marketplace as an operator sees it: one seeded catalog agent that needs
 * no endpoint, and two the connected wallet owns on-chain — one of which is
 * deliberately left unbound, because that is the state story 2.05 exists to
 * make visible. `GET /api/agents` used to return `[]`, which made every
 * owned-agent surface untestable.
 *
 * Provenance is carried by `source`, and `real` is deliberately set against it
 * (story 3.05). `real` means "backed by a real Agno worker rather than a
 * mock": `registry_sync` sets it false for every on-chain agent, and the
 * seeded catalog is a mix — so it marks roughly the OPPOSITE population to the
 * one an "externally registered" marker is about. `agt_11c0` below is seeded
 * *and* `real: true`, which is the trap: anything keyed off `real` marks the
 * first-party catalog as somebody else's agent, and leaves every on-chain
 * registration looking first-party.
 *
 * `bound` is tri-state for the same reason the binding lookup is skipped for
 * the catalog: a seeded agent runs on a worker inside the backend and has no
 * endpoint, so `null` means the question does not apply, and only `false` on an
 * on-chain agent reports a registration that cannot yet be routed to.
 */
export const mockAgents = [
  {
    id: "agt_11c0",
    name: "code.gen",
    skills: ["code"],
    price: 0.054,
    rep: 4.6,
    status: "online",
    runs: 128,
    real: true,
    owner: null,
    source: "seeded",
    bound: null,
  },
  {
    id: "weather_bot",
    name: "Weather Bot",
    skills: ["weather"],
    price: 0.02,
    rep: 3.5,
    status: "online",
    runs: 4,
    real: false,
    owner: mockWalletAddress,
    source: "onchain",
    bound: true,
  },
  {
    id: "unbound_bot",
    name: "Unbound Bot",
    skills: ["research"],
    price: 0.03,
    rep: 3.5,
    status: "online",
    runs: 0,
    real: false,
    owner: mockWalletAddress,
    source: "onchain",
    bound: false,
  },
  /**
   * Registered on-chain by a third party, endpoint bound, and below the
   * routing floor — the only row here that the floor itself excludes.
   *
   * It is paired with `unbound_bot` on purpose: that one clears the floor and
   * is held back by its endpoint, this one is operational and held back by its
   * score. Both are unroutable, for reasons an operator must not be allowed to
   * confuse, and a fixture set where the same row carried both faults could
   * never tell the two messages apart.
   *
   * `runs` (41) exceeds the 24 rated jobs behind its score because not every
   * run is rated, and the price is what makes the rating weight coherent:
   * 24 × 0.85 USDC = the 20.4 weight its reputation entry carries.
   */
  {
    id: "rated_down_bot",
    name: "Rated Down Bot",
    skills: ["analysis"],
    price: 0.85,
    rep: 3.0,
    status: "online",
    runs: 41,
    real: false,
    owner: mockOtherOwnerAddress,
    source: "onchain",
    bound: true,
  },
];

/**
 * An agent the connected wallet owns and has DELISTED — `set_active(id,
 * false)`, which `registry_sync` reports as `status: "offline"`.
 *
 * Healthy on every other count on purpose: on-chain, endpoint bound, and
 * rated comfortably clear of the floor (below). Delisting is then the only
 * thing between it and selection, so a surface that forgets the listing rule
 * shows it as routable — exactly the defect this fixture exists to catch.
 *
 * Kept out of `mockAgents` so nothing that counts "the wallet's own agents"
 * changes under the specs that already rely on that list. A spec opts in with
 * `mockApi(page, { agents: [...mockAgents, mockDelistedAgent] })`.
 */
export const mockDelistedAgent = {
  id: "paused_bot",
  name: "Paused Bot",
  skills: ["translation"],
  price: 1.25,
  rep: 4.0,
  status: "offline",
  runs: 30,
  real: false,
  owner: mockWalletAddress,
  source: "onchain",
  bound: true,
};

/**
 * `paused_bot`'s score, worked from the real math like every entry above:
 * twelve rated jobs at its 1.25 USDC price is 15 USDC of weight at a mean of
 * 8800 bps, which `smoothedBps` puts at 8000 (4.00) and `lowerBoundBps` at
 * 7230 (3.62) — well clear of the 5500 floor. Its reputation is not why it is
 * out of the candidate pool.
 */
export const mockDelistedReputation = {
  agent_id: mockDelistedAgent.id,
  smoothed_bps: 8000,
  lower_bound_bps: 7230,
  avg_bps: 8800,
  count: 12,
  weight: 15,
  disputed: 0,
  dispute_rate_bps: 0,
  source: "onchain" as const,
  degraded: false,
};

/**
 * A first-party catalog agent nobody has rated yet — the kind of row the audit
 * caught reading two different scores on two surfaces (live, `design.figma`
 * read 4.87 in the registry and 3.50 on the plan card).
 *
 * Its catalog rating is 4.83, as `app/seed.py` ships it, and that rating is
 * catalog copy: nothing routes on it. The live batch carries the agent at the
 * network prior instead (below), and the prior is the number the plan card
 * shows and the floor is measured against. The two numbers are far apart, so
 * a chip reading either one cannot pass for the other.
 *
 * `research.pro` rather than `design.figma` itself because the plan fixtures
 * above rate `design.figma` on-chain, and one file must not hold two
 * contradictory histories for the same agent.
 */
export const mockUnratedCatalogAgent = {
  id: "agt_09l5",
  name: "research.pro",
  skills: ["research", "citations"],
  price: 0.024,
  rep: 4.83,
  status: "online",
  runs: 9042,
  real: true,
  owner: null,
  source: "seeded",
  bound: null,
};

/** The live prior for `research.pro`: 7000 bps (3.50) with the 5677 lower
 *  bound `lowerBoundBps(7000, 0)` returns. Honest cold start, not a failed
 *  read. */
export const mockUnratedCatalogReputation = {
  agent_id: mockUnratedCatalogAgent.id,
  smoothed_bps: 7000,
  lower_bound_bps: 5677,
  avg_bps: 7000,
  count: 0,
  weight: 0,
  disputed: 0,
  dispute_rate_bps: 0,
  source: "prior" as const,
  degraded: false,
};

/**
 * An agent the registry lists but the reputation batch carries no entry for —
 * registered between the two reads, say. There is no score to show for it,
 * and the fixture exists to prove none is invented: its catalog rating is
 * set to a figure no batch entry anywhere in this file uses.
 */
export const mockUnscoredAgent = {
  id: "fresh_listing",
  name: "Fresh Listing",
  skills: ["summarize"],
  price: 0.015,
  rep: 4.42,
  status: "online",
  runs: 0,
  real: false,
  owner: mockOtherOwnerAddress,
  source: "onchain",
  bound: true,
};

/** One registry row as these fixtures spell it. */
export type AgentFixture = (typeof mockAgents)[number];

/**
 * What the emulated wallet answers a signMessage request with. The spec
 * asserts this exact string reaches POST /bind as `signature`: the backend
 * accepts both raw-bytes and SEP-53 signatures on purpose, so any re-encoding
 * on the way through would turn a valid signature into a rejected one.
 */
export const mockSignature = "ZTJlLXNpZ25hdHVyZS1ieXRlcw==";

/** What the emulated wallet hands back from signTransaction. The value is
 *  opaque on purpose: the app forwards it to POST /api/stellar/submit, which
 *  is itself mocked, so no spec should ever parse it as real XDR. */
export const mockSignedTxXdr = "AAAAAGUyZS1zaWduZWQtdHgtZW52ZWxvcGU=";

/**
 * Settlement as it actually is on this deployment, not as a demo would like
 * it. One `charged` event exists for `weather_bot`, and the payer resolves to
 * the platform's own account rather than a customer — so it is reported,
 * excluded from revenue, and named as a self-payment. `total_stroops` is zero
 * because zero is the true figure.
 *
 * `agt_11c0` and `unbound_bot` return an empty window, which is the ordinary
 * case and must read as "nothing in the last 7 days", never "nothing ever".
 */
export const mockSettlementSelfPaid = {
  agent_id: mockBindAgentId,
  asset: "native",
  window_days: 7,
  scanned_ledgers: 120_960,
  entries: [
    {
      job_id: "9f2c41a8b7e04d5c8a1b2c3d4e5f6071",
      auth_id: "1a2b3c4d5e6f70819a2b3c4d5e6f7081",
      amount_stroops: 1_610_000,
      ledger: 1_284_551,
      // 64 lowercase hex, the spelling the backend normalises to. The panel
      // builds an explorer link out of it, so a fixture that looked roughly
      // right would let a broken link pass.
      tx_hash:
        "3f7a1c9e02b84d6510aefc73d8925b04a6e13f8c27d94b0e5fa6c831d7204ebb",
      at: "2026-09-12T04:18:33Z",
      payer: "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEPLATFORMXXXXX",
      self_payment: true,
      exclusion: "settler",
    },
  ],
  total_stroops: 0,
  self_payment_stroops: 1_610_000,
  truncated: false,
  unavailable: null,
};

/** The empty window every other agent returns. */
export const emptySettlement = (agentId: string) => ({
  agent_id: agentId,
  asset: "native",
  window_days: 7,
  scanned_ledgers: 120_960,
  entries: [],
  total_stroops: 0,
  self_payment_stroops: 0,
  truncated: false,
  unavailable: null,
});

const bindNonce = "e2ebindnonce00000000000000000000";

/** `/api/agents/{id}/bind`, `/bind/challenge` and `/binding`, matched with the
 * id captured so the challenge can be composed for whichever agent was asked
 * about — lib/api.ts rejects a challenge that does not address it. */
const BIND_CHALLENGE_RE = /^\/api\/agents\/([^/]+)\/bind\/challenge$/;
const BIND_RE = /^\/api\/agents\/([^/]+)\/bind$/;
const BINDING_RE = /^\/api\/agents\/([^/]+)\/binding$/;
const SETTLEMENT_RE = /^\/api\/stellar\/settlement\/([^/]+)$/;

/**
 * Per-spec overrides for the shared mock. Everything not named here keeps the
 * default fixture, so an existing `mockApi(page)` call is unaffected.
 */
/**
 * An endpoint already bound to `mockBindAgentId`, so a spec can drive the
 * REPLACE path rather than the first-bind one.
 *
 * Those are different screens: `bind/page.tsx` derives `replacing` from a
 * non-null current binding and changes its field label, its confirmation copy
 * and its submit button on the strength of it. Story 2.05's "I can rebind
 * later" acceptance criterion rests entirely on that branch, and nothing
 * exercised it — the default fixture answers `binding_not_found`, so every
 * bind spec before this one tested a first bind.
 */
export const mockExistingBinding = {
  agent_id: mockBindAgentId,
  endpoint_url: "https://agent.example.com/run",
  owner: mockWalletAddress,
  bound_at: "2026-09-10T08:15:00Z",
  replaced: false,
};

export type MockApiOptions = {
  /**
   * What `POST /api/orchestrator/decompose` answers with. Defaults to
   * `mockPlan`, which several specs assert against by name — the floor
   * variants below are opt-in for exactly that reason. Typed as the real
   * response so a variant that drifts from the contract fails `npm run
   * typecheck` rather than at some unrelated assertion in a browser.
   */
  plan?: DecomposeResponse;
  /**
   * What `GET /api/agents/{id}/binding` answers with. Absent means the
   * ordinary starting state — a 404 carrying `binding_not_found`, which
   * `getAgentBindingOrNull` folds into a plain null. Pass
   * `mockExistingBinding` to put the bind page on its replace path.
   */
  binding?: typeof mockExistingBinding;
  /**
   * What `GET /api/stellar/reputation` answers with. Defaults to
   * `mockReputationBatch`, so every existing caller is unaffected; pass
   * `mockReputationBatchDegraded` to exercise the estimates path. Typed as the
   * real response for the same reason `plan` is — a variant that drifts from
   * the contract fails `npm run typecheck` rather than at some unrelated
   * assertion in a browser.
   */
  reputation?: ReputationBatch;
  /**
   * What `GET /api/agents` answers with. Defaults to `mockAgents`, so every
   * existing caller is unaffected; a spec that needs an extra row — a delisted
   * agent, one the batch has no score for — appends it here rather than
   * editing the shared list other specs count against.
   */
  agents?: readonly AgentFixture[];
};

export async function mockApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<void> {
  await page.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    // Endpoint preflight — checked before the `/agents/{id}/…` patterns below,
    // which it deliberately does not match.
    if (method === "GET" && pathname === "/api/agents/bind/endpoint-check") {
      return json(route, { allowed: true, rule: null, message: null });
    }
    const challengeFor = BIND_CHALLENGE_RE.exec(pathname);
    if (method === "POST" && challengeFor) {
      const agentId = decodeURIComponent(challengeFor[1]);
      const body = route.request().postDataJSON() as { endpoint_url: string };
      return json(route, {
        agent_id: agentId,
        nonce: bindNonce,
        // Composed exactly as the backend does, since the client re-checks
        // that the challenge addresses this agent before it signs anything.
        message: `orizon-bind:v1:${agentId}:${body.endpoint_url}:${bindNonce}`,
        expires_at: new Date(Date.now() + 120_000).toISOString(),
        ttl_seconds: 120,
      });
    }
    const bindFor = BIND_RE.exec(pathname);
    if (method === "POST" && bindFor) {
      const body = route.request().postDataJSON() as { endpoint_url: string };
      return json(route, {
        agent_id: decodeURIComponent(bindFor[1]),
        endpoint_url: body.endpoint_url,
        owner: mockWalletAddress,
        bound_at: new Date().toISOString(),
        replaced: false,
      });
    }
    if (method === "GET" && BINDING_RE.test(pathname)) {
      // An agent that already has an endpoint, when a spec asked for one. This
      // is what puts the bind page on its replace path.
      if (options.binding) {
        return json(route, options.binding);
      }
      // The ordinary starting state: registered, never bound. A 404 carrying
      // `binding_not_found` is how the backend says so, and
      // `getAgentBindingOrNull` turns it into a plain null.
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Not Found",
          error: {
            code: "binding_not_found",
            message: "no endpoint bound for this agent",
            request_id: "e2e0000000000001",
          },
        }),
      });
    }

    if (method === "GET" && pathname === "/api/metrics/overview") {
      return json(route, mockOverview);
    }
    if (method === "GET" && pathname === "/api/tasks") {
      return json(route, mockTasks);
    }
    if (method === "POST" && pathname === "/api/orchestrator/decompose") {
      return json(route, options.plan ?? mockPlan);
    }
    if (method === "GET" && pathname === "/api/agents") {
      return json(route, options.agents ?? mockAgents);
    }
    if (method === "GET" && pathname === "/api/stellar/reputation") {
      return json(route, options.reputation ?? mockReputationBatch);
    }
    const settlementFor = SETTLEMENT_RE.exec(pathname);
    if (method === "GET" && settlementFor) {
      const agentId = decodeURIComponent(settlementFor[1]);
      return json(
        route,
        agentId === mockBindAgentId
          ? mockSettlementSelfPaid
          : emptySettlement(agentId),
      );
    }
    if (
      method === "GET" &&
      pathname.startsWith("/api/stellar/agent-id-available/")
    ) {
      return json(route, { available: true });
    }
    // Anything else gets an empty-but-valid JSON body so stray fetches
    // resolve instead of hanging or erroring.
    return json(route, {});
  });
}

/**
 * A connected wallet, without a browser extension.
 *
 * Two pieces, because the app reaches the wallet by two different routes:
 *
 *   1. a saved session in localStorage, which WalletProvider restores on mount
 *      — that is what makes the page think it is connected;
 *   2. a stand-in for Freighter's content script. `@stellar/freighter-api`
 *      talks to the extension purely by `window.postMessage`, answering a
 *      `FREIGHTER_EXTERNAL_MSG_REQUEST` with a matching
 *      `FREIGHTER_EXTERNAL_MSG_RESPONSE` (whose id field is spelled
 *      `messagedId` — that typo is the real protocol), and short-circuits its
 *      availability probe on a truthy `window.freighter`. Emulating that is
 *      what lets an e2e spec walk the whole signing flow instead of stopping
 *      at the popup.
 *
 * Horizon is intercepted too: the provider fetches a balance the moment a
 * session is restored, and a spec must not depend on the public testnet.
 */
export async function mockWallet(page: Page): Promise<void> {
  await page.route("**/horizon-testnet.stellar.org/**", (route) =>
    json(route, {
      balances: [{ asset_type: "native", balance: "100.0000000" }],
    }),
  );

  await page.addInitScript(
    ({
      address,
      signature,
      signedTxXdr,
      passphrase,
    }: {
      address: string;
      signature: string;
      signedTxXdr: string;
      passphrase: string;
    }) => {
      window.localStorage.setItem(
        "orizon.wallet.v2",
        JSON.stringify({ walletId: "freighter", address }),
      );
      (window as unknown as { freighter?: boolean }).freighter = true;

      window.addEventListener("message", (event: MessageEvent) => {
        const request = event.data as
          | { source?: string; messageId?: unknown; type?: string }
          | null
          | undefined;
        if (!request || request.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") {
          return;
        }
        const reply = (payload: Record<string, unknown>) =>
          window.postMessage(
            {
              source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
              messagedId: request.messageId,
              ...payload,
            },
            window.location.origin,
          );
        switch (request.type) {
          case "REQUEST_CONNECTION_STATUS":
            return reply({ isConnected: true });
          case "REQUEST_ALLOWED_STATUS":
            return reply({ isAllowed: true });
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            return reply({ publicKey: address });
          case "REQUEST_NETWORK":
            return reply({ network: "TESTNET", networkPassphrase: passphrase });
          case "REQUEST_NETWORK_DETAILS":
            return reply({
              networkDetails: {
                network: "TESTNET",
                networkName: "Test Net",
                networkUrl: "https://horizon-testnet.stellar.org",
                networkPassphrase: passphrase,
              },
            });
          // signMessage rides on SUBMIT_BLOB and comes back as `signedBlob`.
          case "SUBMIT_BLOB":
            return reply({ signedBlob: signature, signerAddress: address });
          // signTransaction rides on SUBMIT_TRANSACTION and comes back as
          // `signedTransaction`. Registration needs this one; binding needs
          // SUBMIT_BLOB above. They are genuinely different wallet operations
          // — an on-chain transaction versus a signed message — which is the
          // whole reason story 2.05 has to warn the operator about two
          // prompts. A spec that drives registration without this reply dies
          // on the fallback below rather than failing anywhere informative.
          case "SUBMIT_TRANSACTION":
            return reply({
              signedTransaction: signedTxXdr,
              signerAddress: address,
            });
          default:
            return reply({
              apiError: {
                code: -1,
                message: `unmocked freighter request: ${String(request.type)}`,
              },
            });
        }
      });
    },
    {
      address: mockWalletAddress,
      signature: mockSignature,
      signedTxXdr: mockSignedTxXdr,
      passphrase: "Test SDF Network ; September 2015",
    },
  );
}

// ── Disputes on the trace / receipt view (story 4.05) ───────

/** The workflow every dispute spec opens the trace page on, via `?task=`. */
export const mockDisputeTaskId = "task_e2e_dispute";

/** 16 bytes of hex: the `_JOB_ID_PATTERN` shape the dispute routes accept. */
export const mockDisputeJobIdHex = "7c2e9b41d05a4f38a6e1b9c3d7f20a58";

/**
 * The terms in force. The backend defaults DISPUTE_CREDITED_FRACTION to 1.0;
 * half is used here so a "50%" in the form can only have come from the policy
 * it was served, never from copy that hard-codes a full refund.
 */
export const mockCreditPolicy: CreditPolicy = {
  credited_fraction: 0.5,
  funded_by: "platform",
  adjudicated_by: "platform",
};

/**
 * What the trace stream replays for that workflow. The receipt is read from
 * the durable settlement, not from these lines, so they only have to look
 * like a finished run: the spec asserts they still render beneath the panel.
 */
export const mockDisputeTrace: TraceLine[] = [
  { t: "00.000", level: "input", msg: "intent received → 'audit brief'" },
  { t: "00.412", level: "exec", msg: "seo.brief → outline drafted" },
  { t: "00.430", level: "cost", msg: "x402 payment → seo.brief :: 0.009 USDC" },
  { t: "01.870", level: "exec", msg: "code.gen → calculator app generated" },
  { t: "01.905", level: "cost", msg: "x402 payment → code.gen :: 0.054 USDC" },
  { t: "02.640", level: "error", msg: "vision.ocr failed — step not charged" },
  { t: "02.700", level: "out", msg: "workflow settled" },
];

/**
 * The steps as they settled: two that delivered and were charged, and one
 * that failed. The failed step keeps its own price, as the backend's
 * `SettlementStep` does, but credits nothing. `creditable_usdc` is price x
 * `mockCreditPolicy.credited_fraction`, precomputed the way the backend
 * serves it, because the UI is meant to print it rather than re-derive it.
 */
export const mockSettlementSteps: SettlementStepView[] = [
  {
    step_index: 0,
    agent_id: "seo.brief",
    agent_name: "seo.brief",
    price_usdc: 0.009,
    delivered: true,
    creditable_usdc: 0.0045,
    output_summary: "outline with 12 target keywords",
  },
  {
    step_index: 1,
    agent_id: "code.gen",
    agent_name: "code.gen",
    price_usdc: 0.054,
    delivered: true,
    creditable_usdc: 0.027,
    output_summary: "calculator app, 3 files",
  },
  {
    step_index: 2,
    agent_id: "vision.ocr",
    agent_name: "vision.ocr",
    price_usdc: 0.012,
    delivered: false,
    creditable_usdc: 0,
    output_summary: null,
  },
];

/** The 24-hour window story 4.02 stamps at settlement. */
export const DISPUTE_WINDOW_S = 24 * 60 * 60;

/**
 * A settlement that happened at `settledAtS` (epoch seconds). Built from an
 * explicit instant rather than "an hour ago" so the window's closing time is
 * fixed for the whole test, as the backend's is: it is stamped once at
 * settlement and never moves, however long the page stays open.
 */
export function mockSettlementView(opts: {
  settledAtS: number;
  windowS?: number;
  payer?: string;
}): SettlementView {
  return {
    job_id_hex: mockDisputeJobIdHex,
    payer: opts.payer ?? mockWalletAddress,
    settled_at: opts.settledAtS,
    window_closes_at: opts.settledAtS + (opts.windowS ?? DISPUTE_WINDOW_S),
    settled_usdc: 0.063,
    charge_tx:
      "a41c7e0d93b25f6817ce4a0b9d3f72e15c86a0d4b7e2f91c3a58d06e4b1f7c29",
    proof_tx:
      "0e9d4c71b3a85f2e6c1d07b94a3e8f52d6c10a7e9b4f38d2c5a16e0b7d93f4a8",
    steps: mockSettlementSteps,
    policy: mockCreditPolicy,
  };
}

/** A dispute already on record against one settled step. */
export function mockDispute(
  step: SettlementStepView,
  opts: {
    openedAtS: number;
    reason: string;
    status?: DisputeStatus;
    payer?: string;
  },
): Dispute {
  return {
    id: `dsp_e2e_${step.step_index}`,
    job_id_hex: mockDisputeJobIdHex,
    task_id: mockDisputeTaskId,
    step_index: step.step_index,
    agent_id: step.agent_id,
    payer: opts.payer ?? mockWalletAddress,
    reason: opts.reason,
    status: opts.status ?? "open",
    charged_usdc: step.price_usdc,
    creditable_usdc: step.creditable_usdc,
    opened_at: opts.openedAtS,
    resolved_at: null,
    refund_tx: null,
    rating_tx: null,
  };
}

/**
 * The trace stream for one task, as a finished run: every line, then `done`.
 *
 * EventSource requests go through the same network stack as fetch, so a
 * fulfilled `text/event-stream` body is parsed exactly like a live one. The
 * connection closing after `done` is harmless — `openTraceStream` has already
 * settled by then and ignores the error a closed stream fires.
 */
export async function mockTraceStream(
  page: Page,
  taskId: string,
  lines: readonly TraceLine[] = mockDisputeTrace,
): Promise<void> {
  const body =
    lines
      .map((line) => `event: trace\ndata: ${JSON.stringify(line)}\n\n`)
      .join("") + "event: done\ndata: {}\n\n";
  await page.route(new RegExp(`/api/trace/${taskId}/stream(\\?|$)`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "cache-control": "no-cache" },
      body,
    }),
  );
}

export type MockDisputeApiOptions = {
  /** The workflow's settlement; null while it has not settled. */
  settlement: SettlementView | null;
  /** Disputes already on record when the page first loads. */
  disputes?: readonly Dispute[];
  /**
   * Answer as the backend that is live today does: `window_closes_at` and
   * `disputes`, with no `settlement` and no `now` key at all. Vercel ships the
   * frontend on every merge and Render does not, so this is the response the
   * new page meets first.
   */
  legacy?: boolean;
  /**
   * The server's clock, in epoch ms. Defaults to Node's, which agrees with the
   * page's own. A spec that fast-forwards the page's clock must pass the
   * page's clock here instead, or any read after the jump would report a
   * server time from before it and the correction would wind the page back.
   */
  clock?: () => number | Promise<number>;
  /**
   * How `POST /api/disputes` answers. `created` records the dispute and
   * returns it. `duplicate` answers the backend's 409 `duplicate_dispute`,
   * whose body carries the dispute that already exists — one raised from the
   * buyer's other tab — and every later read includes it, as the server's
   * would.
   */
  open?: "created" | "duplicate";
};

const DISPUTES_RE = /^\/api\/tasks\/([^/]+)\/disputes$/;
const disputeNonce = "e2edisputenonce000000000000000000";

/**
 * The dispute surface: the task's settlement and disputes, the challenge, and
 * opening a dispute. Stateful on purpose — a dispute opened here is returned
 * by every later read, which is what lets a spec assert that the step "now
 * shows its dispute" rather than that a success toast appeared.
 *
 * Register it AFTER `mockApi`: Playwright tries the most recently added
 * route first, and every path this does not own falls back to `mockApi`.
 */
export async function mockDisputeApi(
  page: Page,
  options: MockDisputeApiOptions,
): Promise<void> {
  const recorded: Dispute[] = [...(options.disputes ?? [])];
  const nowS = async () =>
    Math.floor((await (options.clock ?? Date.now)()) / 1000);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    const disputesFor = DISPUTES_RE.exec(pathname);
    if (method === "GET" && disputesFor) {
      const settlement = options.settlement;
      const legacy = {
        task_id: decodeURIComponent(disputesFor[1]),
        window_closes_at: settlement?.window_closes_at ?? null,
        disputes: recorded,
      };
      if (options.legacy) return json(route, legacy);
      const body: TaskDisputes = {
        ...legacy,
        now: await nowS(),
        settlement,
      };
      return json(route, body);
    }

    if (method === "POST" && pathname === "/api/disputes/challenge") {
      const body = request.postDataJSON() as {
        job_id_hex: string;
        step_index: number;
      };
      return json(route, {
        // Composed exactly as `dispute_svc.dispute_message` does; the wallet
        // signs this string verbatim.
        message: `orizon-dispute:v1:${body.job_id_hex}:${body.step_index}:${disputeNonce}`,
        nonce: disputeNonce,
        expires_at: (await nowS()) + 120,
      });
    }

    if (method === "POST" && pathname === "/api/disputes") {
      const body = request.postDataJSON() as OpenDisputeReq;
      const step = options.settlement?.steps.find(
        (s) => s.step_index === body.step_index,
      );
      if (!step) return route.fallback();
      const opened = await nowS();
      if (options.open === "duplicate") {
        const existing = mockDispute(step, {
          openedAtS: opened - 600,
          reason: "raised from another tab",
          payer: body.payer,
        });
        recorded.push(existing);
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "duplicate_dispute",
            error: {
              code: "duplicate_dispute",
              message: "this step is already disputed",
              request_id: "e2e0000000000405",
            },
            dispute: existing,
          }),
        });
      }
      const created = mockDispute(step, {
        openedAtS: opened,
        reason: body.reason,
        payer: body.payer,
      });
      recorded.push(created);
      return json(route, created);
    }

    return route.fallback();
  });
}
