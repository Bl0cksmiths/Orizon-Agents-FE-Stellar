/**
 * A fake backend for the hero's network figures, for tests that run a real
 * Next server (scripts/hero-isr-check.mjs). The browser-side route mocks in
 * e2e/mocks.ts cannot reach a server render, so this answers over HTTP.
 *
 * It serves what lib/public-network-stats.ts reads — the measured overview,
 * the registry, the platform's keys — in whichever sync shape the state
 * names, and is steered by POSTing a partial state to /__state:
 *
 *   signal: "overview"  the overview carries `registry_synced`
 *           "header"    only GET /api/agents carries `X-Registry-Synced`
 *           "none"      neither (a backend from before the signals)
 *   synced: false       mid-refill: the flag or header says so, and with
 *                       signal "none" every registry read grows the count
 *   down:   true        every read answers 503
 */
import { createServer } from "node:http";

const TEAM = "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV";
const DISPATCH = "GB5MKHDFLJZ6OFPAHM7R4HGBUPFV5PZYL3W27VTIUZZ25JMQSDZBKCMR";
const SEEDED = 12;

/** A valid-looking outside operator's account id, the `i`th. */
const operator = (i) => `GOP${String(i).padStart(53, "A")}`.slice(0, 56);

export const INITIAL_STATE = {
  signal: "overview",
  synced: true,
  down: false,
  registered: 278,
  external: 253,
  wallets: 248,
};

/** The registry the state describes: the seeded catalog, then `external`
 * agents spread over `wallets` outside operators, the rest the team's. */
export function registryFor({ registered, external, wallets }) {
  return Array.from({ length: registered }, (_, i) => {
    const seeded = i < SEEDED;
    const n = i - SEEDED;
    return {
      id: seeded ? `agt_${i}` : `ext_${i}`,
      name: `agent ${i}`,
      skills: ["research"],
      price: 0.01,
      rep: 4,
      status: "online",
      runs: 0,
      owner: seeded ? null : n < external ? operator(n % wallets) : TEAM,
      source: seeded ? "seeded" : "onchain",
      bound: seeded ? null : false,
    };
  });
}

function overviewFor(state) {
  const { registered, external, wallets } = state;
  return {
    generated_at: Date.now() / 1000,
    agents: {
      registered,
      onchain: Math.max(0, registered - SEEDED),
      seeded: Math.min(SEEDED, registered),
      external,
      bound: 0,
      online: registered,
    },
    operators: { external_wallets: wallets },
    workflows: { settled: 0, series: [] },
    tasks: { recent: 0, complete: 0, failed: 0, completion_rate: null },
    trust: { avg: null, rated_agents: 0 },
    skills: [],
    degraded: !state.synced,
    ...(state.signal === "overview" ? { registry_synced: state.synced } : {}),
  };
}

/** Starts the fake on `port`; resolves to { state, reads, timeline, close }.
 * `timeline` lists every read: when (epoch ms), what, and the state's
 * answer. */
export function startStatsBackend(port) {
  const state = { ...INITIAL_STATE };
  const reads = {};
  const timeline = [];
  let refill = 0;

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/__state") {
      if (req.method === "POST") {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          Object.assign(state, JSON.parse(raw || "{}"));
          refill = 0;
          send(res, 200, state);
        });
        return;
      }
      return send(res, 200, { state, reads });
    }
    reads[path] = (reads[path] ?? 0) + 1;
    timeline.push({
      at: Date.now(),
      path,
      answer: state.down
        ? "503"
        : `${state.registered} ${state.synced ? "synced" : "syncing"} (${state.signal})`,
    });
    if (state.down) return send(res, 503, { detail: "waking up" });

    switch (path) {
      case "/api/metrics/overview":
        return send(res, 200, overviewFor(state));
      case "/api/agents": {
        let count = state.registered;
        // Mid-refill with no signal: the count grows on every read.
        if (!state.synced && state.signal === "none") count += refill++ * 7;
        const body = registryFor({ ...state, registered: count });
        const headers =
          state.signal === "header"
            ? {
                "X-Registry-Synced": String(state.synced),
                "X-Registry-Count": String(body.length),
              }
            : {};
        return send(res, 200, body, headers);
      }
      case "/api/stellar/network":
        return send(res, 200, { admin: TEAM, dispatch_signer: DISPATCH });
      case "/readiness":
        return send(res, 200, { status: "ready", ratings: {} });
      case "/api/health":
        return send(res, 200, { status: "ok" });
      default:
        // The adoption read among them: slow and costly on the real backend,
        // and never needed while the overview has owner figures.
        return send(res, 404, { detail: "not mocked" });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        state,
        reads,
        timeline,
        close: () => new Promise((r) => server.close(r)),
      }),
    );
  });
}
