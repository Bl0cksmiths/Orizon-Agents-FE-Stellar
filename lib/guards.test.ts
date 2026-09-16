/**
 * Tests for the shallow runtime guards in lib/guards.ts.
 *
 * Each guard accepts a realistic valid payload (extra unknown keys included —
 * the guards are deliberately non-exhaustive) and rejects payloads where an
 * arithmetic-critical field carries the wrong type.
 */

import { describe, expect, it } from "vitest";
import {
  isAgentBinding,
  isAgentIdAvailability,
  isAgentList,
  isArtifactResponse,
  isAuthorizeBuild,
  isBindChallenge,
  isBindErrorCode,
  isDecomposeResponse,
  isEndpointCheck,
  isFlow,
  isOverview,
  isReputationBatch,
  isReputationInfo,
  isReputationParams,
  isStellarNetworkInfo,
  isSubmitResult,
  isSyncResponse,
  isTaskList,
  isTraceLine,
  isTraceLineList,
  isXdrResponse,
} from "./guards";

describe("isAgentList", () => {
  const agent = {
    id: "agt_01",
    name: "copywrite.v3",
    skills: ["content", "seo"],
    price: 0.012,
    rep: 4.6,
    status: "online",
    runs: 1284,
    real: true,
  };

  it("accepts a valid list and the empty list", () => {
    expect(isAgentList([agent])).toBe(true);
    expect(isAgentList([])).toBe(true);
  });

  it("rejects a non-array payload", () => {
    expect(isAgentList({ agents: [agent] })).toBe(false);
    expect(isAgentList(null)).toBe(false);
  });

  it("rejects a non-numeric price (feeds .toFixed)", () => {
    expect(isAgentList([{ ...agent, price: "0.012" }])).toBe(false);
  });

  it("rejects a missing runs count (feeds .toLocaleString)", () => {
    const { runs: _drop, ...rest } = agent;
    expect(isAgentList([rest])).toBe(false);
  });

  it("rejects a non-numeric rep (feeds rep * 2000)", () => {
    expect(isAgentList([{ ...agent, rep: null }])).toBe(false);
  });

  it("rejects skills that are not an array of strings (feeds .map)", () => {
    expect(isAgentList([{ ...agent, skills: "content" }])).toBe(false);
    expect(isAgentList([{ ...agent, skills: [{ name: "content" }] }])).toBe(
      false,
    );
  });

  it("rejects a status outside the backend literal (keys the tone map)", () => {
    expect(isAgentList([{ ...agent, status: "degraded" }])).toBe(false);
    expect(isAgentList([{ ...agent, status: undefined }])).toBe(false);
  });

  it("accepts an owner as a G-address, absent, or null (seeded agents)", () => {
    expect(
      isAgentList([
        { ...agent, owner: "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E" },
      ]),
    ).toBe(true);
    expect(isAgentList([agent])).toBe(true);
    expect(isAgentList([{ ...agent, owner: null }])).toBe(true);
  });

  it("rejects a non-string owner (compared against the connected wallet)", () => {
    expect(isAgentList([{ ...agent, owner: 42 }])).toBe(false);
  });

  it("rejects when any single entry is malformed", () => {
    expect(isAgentList([agent, { ...agent, price: undefined }])).toBe(false);
  });
});

describe("isOverview", () => {
  const valid = {
    agents_online: 128,
    tasks_per_sec: 0.42,
    avg_completion: 0.97,
    avg_trust: 4.6,
    throughput: [1, 2, 3],
    skills: [{ name: "code", pct: 62, tone: "violet" }],
  };

  it("accepts a valid payload (extra keys tolerated)", () => {
    expect(isOverview({ ...valid, extra: "ignored" })).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isOverview(null)).toBe(false);
    expect(isOverview([])).toBe(false);
    expect(isOverview("<html>proxy error</html>")).toBe(false);
  });

  it("rejects a throughput array containing non-numbers", () => {
    expect(isOverview({ ...valid, throughput: [1, "2", 3] })).toBe(false);
  });

  it("rejects a string avg_completion", () => {
    expect(isOverview({ ...valid, avg_completion: "0.97" })).toBe(false);
  });

  it("rejects a skills entry without a numeric pct", () => {
    expect(isOverview({ ...valid, skills: [{ name: "code" }] })).toBe(false);
  });

  it("rejects a non-string skill tone", () => {
    expect(
      isOverview({ ...valid, skills: [{ name: "code", pct: 62, tone: 7 }] }),
    ).toBe(false);
  });

  it("accepts a skill with an absent or unfamiliar tone", () => {
    // The backend types skills as dict[str, Any] — tone is not contractually
    // guaranteed, and the renderer color-falls-back on anything it knows.
    expect(isOverview({ ...valid, skills: [{ name: "code", pct: 62 }] })).toBe(
      true,
    );
    expect(
      isOverview({
        ...valid,
        skills: [{ name: "code", pct: 62, tone: "amber" }],
      }),
    ).toBe(true);
  });
});

describe("isFlow", () => {
  const valid = {
    nodes: [
      { id: "in", label: "intent", sub: "user input", x: 4, y: 50 },
      { id: "out", label: "outcome", sub: "verified", x: 96, y: 50 },
    ],
    edges: [["in", "out"]],
  };

  it("accepts a valid graph (empty nodes and edges included)", () => {
    expect(isFlow(valid)).toBe(true);
    expect(isFlow({ nodes: [], edges: [] })).toBe(true);
  });

  it("rejects a payload with no edges array (destructured during render)", () => {
    const { edges: _drop, ...rest } = valid;
    expect(isFlow(rest)).toBe(false);
    expect(isFlow({ ...valid, edges: {} })).toBe(false);
  });

  it("rejects edges that are not string pairs", () => {
    expect(isFlow({ ...valid, edges: [["in"]] })).toBe(false);
    expect(isFlow({ ...valid, edges: [["in", "out", "extra"]] })).toBe(false);
    expect(isFlow({ ...valid, edges: [[1, 2]] })).toBe(false);
    expect(isFlow({ ...valid, edges: [{ from: "in", to: "out" }] })).toBe(
      false,
    );
  });

  it("rejects a node without numeric coordinates", () => {
    const node = {
      id: "in",
      label: "intent",
      sub: "user input",
      x: "4",
      y: 50,
    };
    expect(isFlow({ ...valid, nodes: [node] })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isFlow(null)).toBe(false);
    expect(isFlow([])).toBe(false);
  });
});

describe("isTaskList", () => {
  const task = {
    id: "tsk_01",
    intent: "build tetris",
    agents: 3,
    spent: 0.054,
    status: "complete",
    started: "2m ago",
  };

  it("accepts a valid list and the empty list", () => {
    expect(isTaskList([task])).toBe(true);
    expect(isTaskList([])).toBe(true);
  });

  it("rejects a non-array and items with a non-numeric spent", () => {
    expect(isTaskList({ tasks: [task] })).toBe(false);
    expect(isTaskList([{ ...task, spent: "0.054" }])).toBe(false);
    expect(isTaskList([task, { ...task, spent: undefined }])).toBe(false);
  });

  it("accepts every backend task status", () => {
    for (const status of ["pending", "running", "complete", "failed"]) {
      expect(isTaskList([{ ...task, status }])).toBe(true);
    }
  });

  it("rejects a status outside the backend literal (keys the tone map)", () => {
    expect(isTaskList([{ ...task, status: "cancelled" }])).toBe(false);
    const { status: _drop, ...missing } = task;
    expect(isTaskList([missing])).toBe(false);
  });
});

describe("isTraceLine / isTraceLineList", () => {
  const line = { t: "0.4", level: "cost", msg: "0.010 USDC" };

  it("accepts a valid line and a valid history (empty included)", () => {
    expect(isTraceLine(line)).toBe(true);
    expect(isTraceLineList([line, { ...line, level: "proof" }])).toBe(true);
    expect(isTraceLineList([])).toBe(true);
  });

  it("accepts every backend trace level", () => {
    for (const level of [
      "input",
      "exec",
      "proof",
      "cost",
      "out",
      "error",
      "artifact",
    ]) {
      expect(isTraceLine({ ...line, level })).toBe(true);
    }
  });

  it("rejects a level outside the backend literal (keys the color map)", () => {
    expect(isTraceLine({ ...line, level: "warn" })).toBe(false);
    const { level: _drop, ...missing } = line;
    expect(isTraceLine(missing)).toBe(false);
  });

  it("rejects a row with a non-string msg or timestamp", () => {
    expect(isTraceLine({ ...line, msg: { text: "0.010 USDC" } })).toBe(false);
    expect(isTraceLine({ ...line, t: 0.4 })).toBe(false);
  });

  it("rejects non-objects and non-arrays", () => {
    expect(isTraceLine(null)).toBe(false);
    expect(isTraceLine([line])).toBe(false);
    expect(isTraceLineList({ lines: [line] })).toBe(false);
    expect(isTraceLineList("<html>proxy error</html>")).toBe(false);
  });

  it("rejects a history where any single row is malformed", () => {
    expect(isTraceLineList([line, { ...line, level: "warn" }])).toBe(false);
  });
});

describe("isDecomposeResponse", () => {
  const valid = {
    plan_id: "pln_1",
    intent: "tetris",
    steps: [
      {
        agent_id: "agt_01",
        rationale: "codes",
        est_price_usdc: 0.03,
        est_eta_seconds: 4.5,
      },
    ],
    total_usdc: 0.03,
    total_eta: 4.5,
  };

  it("accepts a valid plan (empty steps included)", () => {
    expect(isDecomposeResponse(valid)).toBe(true);
    expect(isDecomposeResponse({ ...valid, steps: [] })).toBe(true);
  });

  it("rejects a non-numeric total_usdc", () => {
    expect(isDecomposeResponse({ ...valid, total_usdc: "0.03" })).toBe(false);
  });

  it("rejects a step with a missing price estimate", () => {
    const step = { agent_id: "agt_01", est_eta_seconds: 4.5 };
    expect(isDecomposeResponse({ ...valid, steps: [step] })).toBe(false);
  });

  it("rejects a step whose rationale is missing or not a string", () => {
    const { rationale: _drop, ...missing } = valid.steps[0];
    expect(isDecomposeResponse({ ...valid, steps: [missing] })).toBe(false);
    const objectish = { ...valid.steps[0], rationale: { text: "codes" } };
    expect(isDecomposeResponse({ ...valid, steps: [objectish] })).toBe(false);
  });

  // story 3.02 — floor notices and the inline step marks are additive:
  // absent is fine, present values are type-checked.
  const notice = {
    kind: "substituted",
    agent_id: "agt_02",
    agent_name: "design.figma",
    replacement_id: "agt_09",
    replacement_name: "research.pro",
    reason: "below routing floor (4200 < 5500 bps)",
  };

  it("accepts floor notices and the step floor fields when well-formed", () => {
    const step = {
      ...valid.steps[0],
      substituted_for: "agt_02",
      degraded: true,
    };
    expect(
      isDecomposeResponse({ ...valid, steps: [step], notices: [notice] }),
    ).toBe(true);
    expect(isDecomposeResponse({ ...valid, notices: [] })).toBe(true);
  });

  it("rejects a notice with an unlisted kind (it indexes the tone map)", () => {
    const unlisted = { ...notice, kind: "reshuffled" };
    expect(isDecomposeResponse({ ...valid, notices: [unlisted] })).toBe(false);
  });

  it("rejects a notice missing its reason", () => {
    const { reason: _drop, ...missing } = notice;
    expect(isDecomposeResponse({ ...valid, notices: [missing] })).toBe(false);
  });

  it("rejects a truthy non-boolean degraded (would badge a healthy step)", () => {
    const step = { ...valid.steps[0], degraded: "false" };
    expect(isDecomposeResponse({ ...valid, steps: [step] })).toBe(false);
  });

  it("rejects a non-string substituted_for", () => {
    const step = { ...valid.steps[0], substituted_for: 7 };
    expect(isDecomposeResponse({ ...valid, steps: [step] })).toBe(false);
  });

  // AC-5 — a build predating story 3.02 keeps rendering the plan. The whole
  // design rests on the four floor fields being ADDITIVE, and that claim has
  // two halves the guard is the only thing holding: a backend that predates
  // them serves a plan with none of them (below), and a frontend that predates
  // them meets keys its guard never heard of (these guards are non-exhaustive
  // on purpose, so unknown keys are ignored rather than rejected).
  //
  // The old shape is spelled out in full rather than derived from `valid` —
  // a later edit to the shared fixture must not be able to quietly delete the
  // thing being pinned here.
  it("accepts a pre-3.02 plan carrying none of the floor fields (AC-5)", () => {
    const legacy = {
      plan_id: "pln_legacy",
      intent: "tetris",
      steps: [
        {
          agent_id: "agt_01",
          agent_name: "code.next",
          rationale: "codes",
          est_price_usdc: 0.03,
          est_eta_seconds: 4.5,
          rep_bps: 8200,
          rep_source: "onchain",
        },
      ],
      total_usdc: 0.03,
      total_eta: 4.5,
    };
    expect(isDecomposeResponse(legacy)).toBe(true);
    // The mid-roll shape too: `notices` shipped with the kit-path half of
    // 3.02, the numbers inside them with this half, so a backend serving
    // notices without `reason_code`/`lower_bound_bps`/`floor_bps` is a real
    // deployment state and not a hypothetical.
    expect(isDecomposeResponse({ ...legacy, notices: [notice] })).toBe(true);
  });

  it("accepts the full 3.02 shape, with every reason_code the union names", () => {
    const extended = {
      ...valid,
      // The floor is carried in the payload rather than assumed client-side:
      // it is configurable per deployment, so a hardcoded copy would narrate
      // the wrong threshold after an operator changed it.
      floor_bps: 5500,
      reputation_degraded: true,
      steps: [
        { ...valid.steps[0], substituted_for: "agt_02", degraded: false },
      ],
      notices: [
        {
          ...notice,
          reason_code: "below_floor",
          lower_bound_bps: 4200,
          floor_bps: 5500,
        },
        {
          kind: "excluded",
          agent_id: "agt_03",
          agent_name: "vision.ocr",
          reason: "no endpoint bound",
          reason_code: "unbound_endpoint",
          // Excluded before its standing was ever consulted, so there is no
          // bound to report — see the null test below for why that is not 0.
          lower_bound_bps: null,
          floor_bps: 5500,
        },
        {
          kind: "degraded",
          agent_id: "agt_04",
          agent_name: "code.next",
          reason: "re-admitted by starvation backstop (4800 < 5500 bps)",
          reason_code: "floor_relaxed",
          lower_bound_bps: 4800,
          floor_bps: 5500,
        },
      ],
    };
    expect(isDecomposeResponse(extended)).toBe(true);
    // The other half of AC-5: a guard from a build that predates these fields
    // ignores what it does not know. Pinning unknown-key tolerance here is
    // what keeps the next additive field from needing a frontend release.
    expect(isDecomposeResponse({ ...extended, floor_policy: "v3" })).toBe(true);
  });

  it("rejects wrong types on the four new fields", () => {
    // Optional means "may be absent", never "may be anything". Each of these
    // reaches a comparison or a rendered sentence.
    expect(isDecomposeResponse({ ...valid, floor_bps: "5500" })).toBe(false);
    // The classic truthy non-boolean: `"false"` reads as true, which would
    // tell every buyer the trust signals beside their plan came off the
    // Bayesian prior when the ledger read was in fact healthy.
    expect(
      isDecomposeResponse({ ...valid, reputation_degraded: "false" }),
    ).toBe(false);
    const stringBound = { ...notice, lower_bound_bps: "4200" };
    expect(isDecomposeResponse({ ...valid, notices: [stringBound] })).toBe(
      false,
    );
    const stringFloor = { ...notice, floor_bps: "5500" };
    expect(isDecomposeResponse({ ...valid, notices: [stringFloor] })).toBe(
      false,
    );
  });
});

describe("isReputationInfo", () => {
  const valid = {
    agent_id: "agt_01",
    smoothed_bps: 7000,
    lower_bound_bps: 5677,
    avg_bps: 0,
    count: 0,
    weight: 0,
    disputed: 0,
    dispute_rate_bps: 0,
    source: "prior",
  };

  it("accepts a valid row, with or without the degraded flag", () => {
    expect(isReputationInfo(valid)).toBe(true);
    expect(isReputationInfo({ ...valid, degraded: false })).toBe(true);
    expect(isReputationInfo({ ...valid, degraded: true })).toBe(true);
  });

  it("rejects a non-boolean degraded flag (a truthy string reads as true)", () => {
    expect(isReputationInfo({ ...valid, degraded: "false" })).toBe(false);
    expect(isReputationInfo({ ...valid, degraded: 0 })).toBe(false);
  });

  it("rejects a missing weight or dispute rate (both feed evidence sums)", () => {
    const { weight: _w, ...noWeight } = valid;
    expect(isReputationInfo(noWeight)).toBe(false);
    const { dispute_rate_bps: _d, ...noRate } = valid;
    expect(isReputationInfo(noRate)).toBe(false);
  });

  it("rejects a source outside the backend literal", () => {
    expect(isReputationInfo({ ...valid, source: "cached" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isReputationInfo(null)).toBe(false);
    expect(isReputationInfo([valid])).toBe(false);
  });
});

describe("isReputationBatch", () => {
  const rep = {
    agent_id: "agt_01",
    smoothed_bps: 7000,
    lower_bound_bps: 5677,
    avg_bps: 0,
    count: 0,
    weight: 0,
    disputed: 0,
    dispute_rate_bps: 0,
    source: "prior",
  };
  const valid = {
    reputations: { agt_01: rep },
    floor_bps: 5500,
    prior_bps: 7000,
  };

  it("accepts a valid batch (empty reputations included)", () => {
    expect(isReputationBatch(valid)).toBe(true);
    expect(isReputationBatch({ ...valid, reputations: {} })).toBe(true);
  });

  it("rejects an entry with a non-numeric smoothed_bps", () => {
    const bad = { ...rep, smoothed_bps: null };
    expect(isReputationBatch({ ...valid, reputations: { agt_01: bad } })).toBe(
      false,
    );
  });

  it("rejects a batch without a numeric floor_bps", () => {
    expect(isReputationBatch({ ...valid, floor_bps: undefined })).toBe(false);
  });

  it("rejects a non-numeric disputed count (sorted on, NaN scrambles order)", () => {
    const bad = { ...rep, disputed: "0" };
    expect(isReputationBatch({ ...valid, reputations: { agt_01: bad } })).toBe(
      false,
    );
    const { disputed: _drop, ...missing } = rep;
    expect(
      isReputationBatch({ ...valid, reputations: { agt_01: missing } }),
    ).toBe(false);
  });

  it("rejects a missing avg_bps", () => {
    const { avg_bps: _drop, ...missing } = rep;
    expect(
      isReputationBatch({ ...valid, reputations: { agt_01: missing } }),
    ).toBe(false);
  });

  it("rejects a source outside the backend literal", () => {
    expect(
      isReputationBatch({
        ...valid,
        reputations: { agt_01: { ...rep, source: "cached" } },
      }),
    ).toBe(false);
    const { source: _drop, ...missing } = rep;
    expect(
      isReputationBatch({ ...valid, reputations: { agt_01: missing } }),
    ).toBe(false);
  });

  it("accepts an on-chain sourced entry", () => {
    const onchain = { ...rep, source: "onchain", disputed: 2, avg_bps: 8100 };
    expect(
      isReputationBatch({ ...valid, reputations: { agt_01: onchain } }),
    ).toBe(true);
  });

  // The ledger read failed and the service answered with the prior: the batch
  // has to carry that flag through, and only as a real boolean.
  it("carries a degraded entry through and rejects a non-boolean flag", () => {
    const fellBack = { ...rep, degraded: true };
    expect(
      isReputationBatch({ ...valid, reputations: { agt_01: fellBack } }),
    ).toBe(true);
    expect(
      isReputationBatch({
        ...valid,
        reputations: { agt_01: { ...rep, degraded: "true" } },
      }),
    ).toBe(false);
  });
});

describe("isReputationParams", () => {
  const valid = {
    enabled: true,
    prior_bps: 7000,
    prior_weight_usdc: 12,
    floor_bps: 5500,
    max_rating_weight_usdc: 100,
    read_ttl_seconds: 15,
    wilson_z: 1,
    epoch_seconds: 604_800,
    decay_bps_per_epoch: 9250,
    max_decay_epochs: 96,
    contract_id: "CDCS",
    network: "testnet",
  };

  it("accepts a valid parameter set (extra keys tolerated)", () => {
    expect(isReputationParams({ ...valid, extra: 1 })).toBe(true);
  });

  it("rejects a missing epoch_seconds (divided by 86400)", () => {
    const { epoch_seconds: _drop, ...rest } = valid;
    expect(isReputationParams(rest)).toBe(false);
  });

  it("rejects a missing decay_bps_per_epoch (divided by 100)", () => {
    const { decay_bps_per_epoch: _drop, ...rest } = valid;
    expect(isReputationParams(rest)).toBe(false);
  });

  it("rejects non-numeric smoothing inputs that would render ★ NaN", () => {
    expect(isReputationParams({ ...valid, prior_weight_usdc: "12" })).toBe(
      false,
    );
    expect(isReputationParams({ ...valid, wilson_z: null })).toBe(false);
    expect(isReputationParams({ ...valid, floor_bps: undefined })).toBe(false);
  });

  it("rejects a non-string contract_id or network", () => {
    expect(isReputationParams({ ...valid, contract_id: 7 })).toBe(false);
    expect(isReputationParams({ ...valid, network: null })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isReputationParams(null)).toBe(false);
    expect(isReputationParams([])).toBe(false);
  });
});

describe("isArtifactResponse", () => {
  const artifact = {
    title: "Tetris",
    summary: "playable tetris",
    files: [{ path: "index.html", language: "html", content: "<html/>" }],
    entry: "index.html",
    preview_html: "<html/>",
  };

  it("accepts a sealed artifact and a null artifact", () => {
    expect(
      isArtifactResponse({ artifact, charge_tx: "abc", proof_tx: null }),
    ).toBe(true);
    expect(isArtifactResponse({ artifact: null })).toBe(true);
  });

  it("rejects an artifact whose files entries lack string content", () => {
    const bad = { ...artifact, files: [{ path: "index.html", content: 42 }] };
    expect(isArtifactResponse({ artifact: bad })).toBe(false);
  });

  it("rejects a file without a language (code viewer calls .toLowerCase)", () => {
    const bad = {
      ...artifact,
      files: [{ path: "index.html", content: "<html/>" }],
    };
    expect(isArtifactResponse({ artifact: bad })).toBe(false);
    const wrongType = {
      ...artifact,
      files: [{ path: "app.tsx", language: 42, content: "x" }],
    };
    expect(isArtifactResponse({ artifact: wrongType })).toBe(false);
  });

  it("rejects when any one file in the set is missing its language", () => {
    const bad = {
      ...artifact,
      files: [artifact.files[0], { path: "app.js", content: "console.log(1)" }],
    };
    expect(isArtifactResponse({ artifact: bad })).toBe(false);
  });

  it("rejects a non-string entry or summary", () => {
    expect(
      isArtifactResponse({ artifact: { ...artifact, entry: ["index.html"] } }),
    ).toBe(false);
    expect(
      isArtifactResponse({ artifact: { ...artifact, summary: { t: "x" } } }),
    ).toBe(false);
  });

  it("accepts an artifact with no entry or summary (both render behind a fallback)", () => {
    const { entry: _e, summary: _s, ...rest } = artifact;
    expect(isArtifactResponse({ artifact: rest })).toBe(true);
  });

  it("rejects non-object payloads", () => {
    expect(isArtifactResponse(null)).toBe(false);
    expect(isArtifactResponse("gateway timeout")).toBe(false);
  });
});

describe("isStellarNetworkInfo", () => {
  const valid = {
    network: "testnet",
    rpc_url: "https://soroban-testnet.stellar.org",
    network_passphrase: "Test SDF Network ; September 2015",
    admin: "GABC",
    contracts: { reputation: "CDCS", escrow: "CAAA" },
    asset: "USDC",
    asset_sac: "CBBB12345678",
  };

  it("accepts a valid payload (empty contracts included)", () => {
    expect(isStellarNetworkInfo(valid)).toBe(true);
    expect(isStellarNetworkInfo({ ...valid, contracts: {} })).toBe(true);
  });

  it("rejects non-string contract ids", () => {
    expect(
      isStellarNetworkInfo({ ...valid, contracts: { reputation: 7 } }),
    ).toBe(false);
  });

  it("rejects a missing asset_sac", () => {
    const { asset_sac: _drop, ...rest } = valid;
    expect(isStellarNetworkInfo(rest)).toBe(false);
  });
});

describe("isAuthorizeBuild", () => {
  const valid = { xdr: "AAAAAgAAAAB…", expires_at: 1_764_000_000 };

  it("accepts a build envelope (extra keys tolerated)", () => {
    expect(isAuthorizeBuild({ ...valid, extra: 1 })).toBe(true);
  });

  it("accepts a build with no expires_at (never read by the UI)", () => {
    const { expires_at: _drop, ...rest } = valid;
    expect(isAuthorizeBuild(rest)).toBe(true);
  });

  it("rejects a missing or non-string xdr (handed to the wallet to sign)", () => {
    const { xdr: _drop, ...rest } = valid;
    expect(isAuthorizeBuild(rest)).toBe(false);
    expect(isAuthorizeBuild({ ...valid, xdr: null })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isAuthorizeBuild(null)).toBe(false);
    expect(isAuthorizeBuild("AAAAAgAAAAB…")).toBe(false);
  });
});

describe("isSubmitResult", () => {
  const valid = {
    hash: "9f2c1a",
    status: "SUCCESS",
    return_value: "00112233445566778899aabbccddeeff",
  };

  it("accepts a broadcast result, with and without the failure fields", () => {
    expect(isSubmitResult(valid)).toBe(true);
    expect(
      isSubmitResult({
        ...valid,
        status: "FAILED",
        diagnostic: "tx_bad_auth",
        explorer: "https://stellar.expert/…",
      }),
    ).toBe(true);
  });

  it("accepts any return_value, including none (bytesToHex takes anything)", () => {
    expect(isSubmitResult({ ...valid, return_value: [1, 2, 3] })).toBe(true);
    const { return_value: _drop, ...rest } = valid;
    expect(isSubmitResult(rest)).toBe(true);
  });

  it("rejects a missing hash (linked into the explorer URL)", () => {
    const { hash: _drop, ...rest } = valid;
    expect(isSubmitResult(rest)).toBe(false);
  });

  it("rejects a non-string status (branched on for SUCCESS)", () => {
    expect(isSubmitResult({ ...valid, status: 1 })).toBe(false);
  });

  it("rejects non-string diagnostic or explorer when present", () => {
    expect(isSubmitResult({ ...valid, diagnostic: { code: 1 } })).toBe(false);
    expect(isSubmitResult({ ...valid, explorer: 404 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSubmitResult(null)).toBe(false);
    expect(isSubmitResult([valid])).toBe(false);
  });
});

describe("isXdrResponse", () => {
  it("accepts a bare xdr envelope", () => {
    expect(isXdrResponse({ xdr: "AA" })).toBe(true);
  });

  it("rejects a missing or non-string xdr (handed to the wallet to sign)", () => {
    expect(isXdrResponse({})).toBe(false);
    expect(isXdrResponse({ xdr: 1 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isXdrResponse(null)).toBe(false);
  });
});

describe("isAgentIdAvailability", () => {
  it("accepts an available result and a taken one carrying its owner", () => {
    expect(isAgentIdAvailability({ available: true })).toBe(true);
    expect(
      isAgentIdAvailability({
        available: false,
        reason: "id_taken",
        owner: "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E",
      }),
    ).toBe(true);
  });

  it("rejects a non-boolean available (a truthy string reads as free)", () => {
    expect(isAgentIdAvailability({ available: "yes" })).toBe(false);
  });

  it("rejects a non-string reason", () => {
    expect(isAgentIdAvailability({ available: true, reason: 5 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isAgentIdAvailability(null)).toBe(false);
  });
});

describe("isSyncResponse", () => {
  it("accepts a numeric synced count", () => {
    expect(isSyncResponse({ synced: 3 })).toBe(true);
  });

  it("rejects a missing or non-numeric synced count (rendered as a count)", () => {
    expect(isSyncResponse({ synced: "3" })).toBe(false);
    expect(isSyncResponse({})).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSyncResponse(null)).toBe(false);
  });
});

describe("isBindChallenge", () => {
  const challenge = {
    agent_id: "orizon_batch",
    nonce: "n_7f3a91",
    message:
      "orizon-bind:v1:orizon_batch:https://agent.example.com/run:n_7f3a91",
    expires_at: "2026-09-15T12:00:30Z",
    ttl_seconds: 30,
    request_id: "req_01",
  };

  it("accepts a full challenge, extra envelope keys included", () => {
    expect(isBindChallenge(challenge)).toBe(true);
  });

  it("accepts either timestamp serialization the contract allows", () => {
    expect(isBindChallenge({ ...challenge, expires_at: 1_789_000_000 })).toBe(
      true,
    );
  });

  it("rejects a missing message (the wallet would sign 'undefined')", () => {
    const { message: _drop, ...rest } = challenge;
    expect(isBindChallenge(rest)).toBe(false);
  });

  it("rejects a missing nonce (matched against the message tail)", () => {
    const { nonce: _drop, ...rest } = challenge;
    expect(isBindChallenge(rest)).toBe(false);
  });

  it("rejects a non-numeric ttl (counts down as NaN)", () => {
    expect(isBindChallenge({ ...challenge, ttl_seconds: "30" })).toBe(false);
  });

  it("rejects a null expires_at that would render as Invalid Date", () => {
    expect(isBindChallenge({ ...challenge, expires_at: null })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isBindChallenge(null)).toBe(false);
    expect(isBindChallenge([challenge])).toBe(false);
  });
});

describe("isAgentBinding", () => {
  const binding = {
    agent_id: "orizon_batch",
    endpoint_url: "https://agent.example.com/run",
    owner: "GBVN3FUM3TPMZXNSBMEGBLYBM2QFGXN7QCZL4TWZ5PJ7V36E",
    bound_at: "2026-09-15T12:00:00Z",
    replaced: false,
  };

  it("accepts a first binding and a replacement", () => {
    expect(isAgentBinding(binding)).toBe(true);
    expect(isAgentBinding({ ...binding, replaced: true })).toBe(true);
  });

  it("accepts an epoch bound_at", () => {
    expect(isAgentBinding({ ...binding, bound_at: 1_789_000_000 })).toBe(true);
  });

  it("rejects a non-boolean replaced (the string 'false' reads as true)", () => {
    expect(isAgentBinding({ ...binding, replaced: "false" })).toBe(false);
  });

  it("rejects a missing replaced flag (hides an overwritten route)", () => {
    const { replaced: _drop, ...rest } = binding;
    expect(isAgentBinding(rest)).toBe(false);
  });

  it("rejects a missing endpoint_url or owner", () => {
    const { endpoint_url: _url, ...noUrl } = binding;
    const { owner: _owner, ...noOwner } = binding;
    expect(isAgentBinding(noUrl)).toBe(false);
    expect(isAgentBinding(noOwner)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isAgentBinding(null)).toBe(false);
  });
});

describe("isEndpointCheck", () => {
  it("accepts an allowed verdict and a refusal carrying its rule", () => {
    expect(isEndpointCheck({ allowed: true, rule: null, message: null })).toBe(
      true,
    );
    expect(
      isEndpointCheck({
        allowed: false,
        rule: "loopback",
        message: "loopback addresses cannot be reached from the registry",
      }),
    ).toBe(true);
  });

  it("accepts a verdict that omits rule and message entirely", () => {
    expect(isEndpointCheck({ allowed: true })).toBe(true);
  });

  it("rejects a non-boolean allowed (a truthy string reads as permitted)", () => {
    expect(isEndpointCheck({ allowed: "false" })).toBe(false);
  });

  it("rejects a non-string rule", () => {
    expect(isEndpointCheck({ allowed: false, rule: 7 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isEndpointCheck(null)).toBe(false);
  });
});

describe("isBindErrorCode", () => {
  it("accepts every code the bind envelope is documented to carry", () => {
    for (const code of [
      "agent_not_found",
      "not_agent_owner",
      "challenge_invalid",
      "endpoint_not_allowed",
      "signature_malformed",
      "registry_unavailable",
      "binding_not_found",
      "rate_limited",
    ]) {
      expect(isBindErrorCode(code)).toBe(true);
    }
  });

  it("rejects a code the contract does not name", () => {
    expect(isBindErrorCode("id_taken")).toBe(false);
    expect(isBindErrorCode("")).toBe(false);
  });

  it("rejects a missing or non-string code", () => {
    expect(isBindErrorCode(undefined)).toBe(false);
    expect(isBindErrorCode(404)).toBe(false);
  });
});
