import type { Page, Route } from "@playwright/test";

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
    {
      agent_id: "seo.brief",
      agent_name: "seo.brief",
      rationale: "outline requirements and keywords",
      est_price_usdc: 0.009,
      est_eta_seconds: 1.2,
    },
    {
      agent_id: "design.figma",
      agent_name: "design.figma",
      rationale: "produce the interface layout",
      est_price_usdc: 0.048,
      est_eta_seconds: 2.4,
      // story 3.02 — this step replaced a sub-floor designated agent.
      substituted_for: "vision.ocr",
    },
    {
      agent_id: "code.next",
      agent_name: "code.next",
      rationale: "implement and wire up the app",
      est_price_usdc: 0.066,
      est_eta_seconds: 3.1,
      // story 3.02 — re-admitted below the floor by the starvation backstop.
      degraded: true,
    },
  ],
  total_usdc: 0.123,
  total_eta: 6.7,
  // story 3.02 — the floor actions behind the step marks above.
  notices: [
    {
      kind: "substituted",
      agent_id: "vision.ocr",
      agent_name: "vision.ocr",
      replacement_id: "design.figma",
      replacement_name: "design.figma",
      reason: "below routing floor (4200 < 5500 bps)",
    },
    {
      kind: "degraded",
      agent_id: "code.next",
      agent_name: "code.next",
      reason: "re-admitted by starvation backstop (4800 < 5500 bps)",
    },
  ],
};

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
 * The batch every reputation-aware surface reads. Three deliberately
 * different states, because they render as three different sentences:
 *
 *   - `agt_11c0`   scored on-chain, comfortably above the floor;
 *   - `weather_bot` scored on-chain but with a lower bound only just clear of
 *     it — the interesting case, since routing uses the bound and not the
 *     headline score;
 *   - `unbound_bot` never rated, so it carries the Bayesian prior and its
 *     lower bound sits *below* the floor. That is the honest cold-start
 *     position of a brand-new agent and the reason an operator sees
 *     "not eligible" on something they just registered.
 *
 * Without this, `GET /api/stellar/reputation` fell through to the catch-all
 * `{}`, `isReputationBatch` rejected it, and every score silently became a
 * seeded placeholder — a fixture gap that reads as working software.
 */
export const mockReputationBatch = {
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
      lower_bound_bps: 5100,
      avg_bps: 7000,
      count: 0,
      weight: 0,
      disputed: 0,
      dispute_rate_bps: 0,
      source: "prior",
      degraded: false,
    },
  },
};

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
      at: "2026-09-12T04:18:33Z",
      payer: "GA7AI5TA6QKZ2V6SWKFOQDQBLNJ4HRFG2PYBEXAMPLEPLATFORMXXXX",
      self_payment: true,
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

// ── Agent endpoint binding (story 2.01) ─────────────────────

/** The agent the bind spec drives, and the wallet that owns it. */
export const mockBindAgentId = "weather_bot";
export const mockWalletAddress =
  "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

/**
 * The marketplace as an operator sees it: one seeded catalog agent that needs
 * no endpoint, and two the connected wallet owns on-chain — one of which is
 * deliberately left unbound, because that is the state story 2.05 exists to
 * make visible. `GET /api/agents` used to return `[]`, which made every
 * owned-agent surface untestable.
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
  },
];
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

const bindNonce = "e2ebindnonce00000000000000000000";

/** `/api/agents/{id}/bind`, `/bind/challenge` and `/binding`, matched with the
 * id captured so the challenge can be composed for whichever agent was asked
 * about — lib/api.ts rejects a challenge that does not address it. */
const BIND_CHALLENGE_RE = /^\/api\/agents\/([^/]+)\/bind\/challenge$/;
const BIND_RE = /^\/api\/agents\/([^/]+)\/bind$/;
const BINDING_RE = /^\/api\/agents\/([^/]+)\/binding$/;
const SETTLEMENT_RE = /^\/api\/stellar\/settlement\/([^/]+)$/;

export async function mockApi(page: Page): Promise<void> {
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
      return json(route, mockPlan);
    }
    if (method === "GET" && pathname === "/api/agents") {
      return json(route, mockAgents);
    }
    if (method === "GET" && pathname === "/api/stellar/reputation") {
      return json(route, mockReputationBatch);
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
