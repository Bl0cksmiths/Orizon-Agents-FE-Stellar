/** The registry statuses this build has a tone for. A backend may add more,
 * so `Agent.status` is typed as any string: narrow with `isAgentStatus`
 * before indexing a per-status map, and render anything else neutrally. */
export const AGENT_STATUSES = ["online", "idle", "offline"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const isAgentStatus = (v: string): v is AgentStatus =>
  AGENT_STATUSES.some((k) => k === v);

export type Agent = {
  id: string;
  name: string;
  skills: string[];
  price: number;
  rep: number;
  /** One of `AGENT_STATUSES` today, but any string on the wire: one agent
   *  with a status this build does not know is still a listed agent. */
  status: string;
  runs: number;
  /**
   * Whether this agent is backed by a real Agno worker rather than a mock.
   *
   * An INTERNAL detail of the first-party catalog, and emphatically not a
   * provenance signal: `registry_sync` sets it false for every on-chain agent,
   * and the seeded catalog is a mix. Use `source` to tell an externally
   * registered agent from a seeded one.
   */
  real?: boolean;
  /** Registering wallet's G-address; on-chain indexed agents only, null for seeded. */
  owner?: string | null;
  /** Where the agent came from (`AgentSource` in the backend's app/schemas.py).
   *  The provenance signal of record. Absent on responses predating it. One of
   *  `AGENT_SOURCES` today, but any string on the wire: narrow with
   *  `isAgentSource` rather than assuming the two known values. */
  source?: string | null;
  /**
   * Whether an endpoint is bound. Tri-state: `null`/absent means the question
   * does not apply — a seeded agent runs on a worker inside the backend and
   * has no endpoint to bind, so `false` there would report a defect that is
   * not one. Only an on-chain agent can be meaningfully unbound.
   */
  bound?: boolean | null;
};

/** Where an agent came from: the first-party seeded catalog, or an on-chain
 *  registration by anyone (`AgentSource` in the backend's app/schemas.py). */
export const AGENT_SOURCES = ["seeded", "onchain"] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];
export const isAgentSource = (v: string): v is AgentSource =>
  AGENT_SOURCES.some((k) => k === v);

export type TaskStatus = "pending" | "running" | "complete" | "failed";

export type Task = {
  id: string;
  intent: string;
  agents: number;
  spent: number;
  status: TaskStatus;
  started: string;
  /**
   * What happened to a paid run's money (`TaskSummary.settlement`); null on
   * a simulated run and absent on a backend that predates it. A run whose
   * settlement failed still finalizes `complete` when it delivered, so
   * `status` alone never says the money moved. Read through
   * `readSettlementState`, which reads a word it does not know as
   * `unconfirmed`.
   */
  settlement?: string | null;
};

export type PlanStep = {
  agent_id: string;
  agent_name?: string;
  rationale: string;
  est_price_usdc: number;
  est_eta_seconds: number;
  rep_bps?: number | null;
  /** One of `REPUTATION_SOURCES` today, but any string on the wire. Absent
   *  or unknown reads as an estimate, never as on-chain evidence. */
  rep_source?: string | null;
  /** The reputation lower bound behind `rep_bps` — the number the routing
   * floor gates on, never the smoothed headline score. Null when the agent has
   * no reputation entry; absent from backends predating it, in which case the
   * step cannot be judged against the floor client-side. */
  rep_lower_bound_bps?: number | null;
  /** How many rated jobs back the score. Null or absent when unknown — never
   * read as zero, which would claim the agent has no rating history. */
  rep_count?: number | null;
  /** Share of this agent's rated jobs that were disputed, in bps. Null or
   * absent when unknown. */
  rep_dispute_rate_bps?: number | null;
  /** This step's own on-chain reputation read FAILED and the Bayesian prior
   * was served in its place. Not `degraded` below, which means re-admitted
   * under the floor by the starvation backstop; the per-step form of the
   * plan's `reputation_degraded`. Absent from backends predating it. */
  rep_degraded?: boolean;
  /** The designated kit agent this step replaced when the reputation floor
   * forced a substitution; absent/null on the normal path (story 3.02). */
  substituted_for?: string | null;
  /** True when the starvation backstop re-admitted this step below the
   * routing floor — kept workable, flagged as a degraded choice. */
  degraded?: boolean;
};

/** The notice kinds this build has copy and a mark for. A backend may add
 * more, so `PlanFloorNotice.kind` is typed as any string: narrow with
 * `isPlanFloorNoticeKind` before indexing a per-kind map, and give anything
 * else a neutral fallback rather than a missing one. */
export const PLAN_FLOOR_NOTICE_KINDS = [
  "excluded",
  "substituted",
  "degraded",
] as const;
export type PlanFloorNoticeKind = (typeof PLAN_FLOOR_NOTICE_KINDS)[number];
export const isPlanFloorNoticeKind = (v: string): v is PlanFloorNoticeKind =>
  PLAN_FLOOR_NOTICE_KINDS.some((k) => k === v);

/**
 * Why the floor acted on an agent (`ExclusionReason` in the backend's
 * app/schemas.py). A closed set, because each value renders as its own
 * sentence — an unrecognised one has no copy to show.
 *
 * `kind` and `reason_code` are orthogonal: `kind` is what happened to the
 * plan, this is why. An agent excluded for having no endpoint and one excluded
 * for failing the floor both arrive as `kind: "excluded"`.
 */
export type ExclusionReason =
  | "below_floor"
  | "unbound_endpoint"
  | "floor_relaxed"
  /** A bound agent whose endpoint failed its latest health check, left out
   *  while that failure is fresh (D-084). Not a reputation verdict: its
   *  `lower_bound_bps` is null on purpose. */
  | "unreachable_endpoint";

/** One reputation-floor action taken while building the plan
 * (`PlanFloorNotice` in the backend's app/schemas.py). `replacement_*` are
 * set only when kind is "substituted". */
export type PlanFloorNotice = {
  /** One of `PLAN_FLOOR_NOTICE_KINDS` today, but any string on the wire: a
   *  kind this build does not know is still a floor action the buyer should
   *  see, so it reaches the card as data instead of failing the plan. */
  kind: string;
  agent_id: string;
  agent_name?: string | null;
  replacement_id?: string | null;
  replacement_name?: string | null;
  /** Human prose, e.g. "below routing floor (4200 < 5500 bps)". Kept because
   *  it already renders; `reason_code` is what new code should branch on. */
  reason: string;
  /** Optional so a response from a backend predating this field still
   *  validates — the same contract `degraded` and `exclusion` already use. */
  reason_code?: ExclusionReason;
  /** The deciding numbers as data. Rendering "4.10 against a 3.00 floor"
   *  should not require parsing an English sentence. `lower_bound_bps` is null
   *  when the agent had no reputation entry at all. */
  lower_bound_bps?: number | null;
  floor_bps?: number;
  /** The evidence behind that bound: how many ratings it rests on (lifetime),
   *  and what share of them were disputes, in bps. null when the agent has no
   *  reputation entry; absent from a backend predating them. Reported, not
   *  routed on — they change no verdict. */
  count?: number | null;
  dispute_rate_bps?: number | null;
  /**
   * The agent was held off (refused, or substituted) because a rating landed
   * since its last reputation read and the fresh read has not answered yet
   * (finding S8). `lower_bound_bps` is then the PRE-rating bound and may sit
   * ABOVE `floor_bps` while `reason_code` still says `below_floor`, so such
   * a notice must never be worded as a bound under the floor. Optional: an
   * older backend sends nothing, which means false.
   */
  awaiting_fresh_read?: boolean;
};

export type DecomposeResponse = {
  plan_id: string;
  intent: string;
  steps: PlanStep[];
  total_usdc: number;
  total_eta: number;
  /** Floor actions behind this plan's shape; empty on the common path where
   * every routed agent clears the floor. Absent from backends predating it. */
  notices?: PlanFloorNotice[];
  /** The floor actually applied to this plan. Not assumed client-side: the
   *  value is configurable per deployment, so a hardcoded copy would narrate
   *  the wrong threshold after a change. Absent from older backends. */
  floor_bps?: number;
  /** At least one reputation read behind this plan fell back to the Bayesian
   *  prior because the ledger was unreadable — the buyer is being shown a
   *  trust signal computed from an estimate. Named apart from `degraded`,
   *  which already means "re-admitted below the floor" on steps and notices. */
  reputation_degraded?: boolean;
  /** These steps are the backend's deterministic fallback, not the planner's
   *  own plan: the LLM planner failed or answered with nothing usable, so a
   *  minimal plan was served from agents that cleared the routing checks.
   *  Always false on curated demo-kit plans. Absent from older backends, which
   *  reads as false. Carries no provider error text, by design. */
  planner_fallback?: boolean;
};

/** Response of POST /api/orchestrator/execute. */
export type ExecuteResponse = {
  task_id: string;
  /**
   * Capability token for reading this task's trace/artifact. Replayed via
   * `X-Task-Token` (or `?token=` on the SSE stream) once backend enforcement
   * turns on; absent/null while enforcement is off.
   */
  read_token?: string | null;
};

export type TraceLevel =
  "input" | "exec" | "proof" | "cost" | "out" | "error" | "artifact";
export type TraceLine = {
  t: string;
  level: TraceLevel;
  msg: string;
  /**
   * Set on the one line that reports a paid run's settlement outcome, and on
   * no other, so the trace can say what happened to the money without
   * parsing `msg`. Absent on a backend that predates it.
   */
  settlement?: SettlementState | null;
};

export type ArtifactFile = {
  path: string;
  /** Set by the first-party workers (`ArtifactFile` in app/schemas.py) and
   * absent from every external operator's file — the backend rebuilds those
   * from `path` and `content` alone and drops `language` on purpose
   * (`_parse_files`, app/agents/workers/external_contract.py). */
  language?: string | null;
  content: string;
};

/**
 * Two producers, one wire shape. A first-party worker sends every field
 * (`CodeArtifact` in app/schemas.py). An external operator's artifact is
 * rebuilt from an allowlist (`_parse_artifact`,
 * app/agents/workers/external_contract.py): each of `title`, `files` and
 * `preview_html` is kept only when it arrived well-formed, at least one of
 * them always survives, and `summary` and `entry` never do.
 */
export type CodeArtifact = {
  title?: string | null;
  summary?: string | null;
  files?: ArtifactFile[] | null;
  entry?: string | null;
  preview_html?: string | null;
};

export type ArtifactResponse = {
  artifact: CodeArtifact | null;
  charge_tx?: string | null;
  proof_tx?: string | null;
};

export type FlowNode = {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
};
export type Flow = { nodes: FlowNode[]; edges: [string, string][] };

/**
 * GET /api/metrics/overview as backends up to 2026-10 serve it. Every field is
 * a presentation baseline or ambiguous: `agents_online` adds a hard-coded 2481
 * to the real count, `tasks_per_sec`, `throughput` and `skills` are constants,
 * and `avg_completion` / `avg_trust` silently fall back to invented figures
 * with nothing in the payload saying so. The shape is still accepted so the
 * request does not fail against a live backend, but nothing in it is ever
 * displayed: lib/network-stats.ts derives every figure from measured sources
 * instead.
 */
export type LegacyOverview = {
  agents_online: number;
  tasks_per_sec: number;
  avg_completion: number;
  avg_trust: number;
  throughput: number[];
  skills: { name: string; pct: number; tone?: string | null }[];
};

/** One day of the settled-workflow series: `date` is `YYYY-MM-DD` (UTC). */
export type SettledDay = { date: string; settled: number };

/** One skill in the registry mix: how many registered agents list it, and
 * its whole-number share of every skill tag in the registry (the shares sum
 * to 100; an agent lists several tags). */
export type SkillShare = { name: string; agents: number; pct: number };

/**
 * GET /api/metrics/overview once the backend measures it (BE PR #103). Every
 * count is read from the registry, the binding set, the settlement store or
 * the chain; a part the backend could not read is `null` (and `degraded` is
 * set), never a stand-in.
 */
export type OverviewV2 = {
  /** Unix seconds. */
  generated_at: number;
  agents: {
    registered: number;
    onchain: number;
    seeded: number;
    /** On-chain agents owned by a wallet the team does not control, by the
     * adoption report's own owner rule. Null when that rule could not be
     * built. */
    external: number | null;
    /** On-chain agents with an endpoint bound. Null while the binding set
     * has not loaded. */
    bound: number | null;
    online: number;
  };
  /** Distinct owners of the external agents; null with `agents.external`. */
  operators: { external_wallets: number | null };
  /** Distinct settled jobs, all time and all payers — team runs included —
   * from the durable settlement store; the series is the last 14 UTC days.
   * `settled` is null (and `series` empty) when the store is unreadable. */
  workflows: { settled: number | null; series: SettledDay[] };
  tasks: {
    recent: number;
    complete: number;
    failed: number;
    completion_rate: number | null;
  };
  /** `avg` is on the 0–5 scale, over agents with on-chain rating evidence,
   * and null when none is rated. `rated_agents` is null when the reputation
   * read itself failed. */
  trust: { avg: number | null; rated_agents: number | null };
  /** `pct` is a share of all skill TAGS in the registry, not of agents. */
  skills: SkillShare[];
  degraded: boolean;
  /** Whether the registry has finished refilling from the chain since the
   * backend started (lib/registry-sync.ts). While false every registry count
   * above is partial and `degraded` is set. Absent on a backend from before
   * the flag. */
  registry_synced?: boolean;
};

/** Where a reputation score comes from: on-chain evidence or the Bayesian
 * prior. Those are the two this build knows; a backend may add more, so the
 * wire fields are typed as any string. Only `"onchain"` is evidence, so
 * anything that does not narrow to it is shown as an estimate. */
export const REPUTATION_SOURCES = ["onchain", "prior"] as const;
export type ReputationSource = (typeof REPUTATION_SOURCES)[number];
export const isReputationSource = (v: string): v is ReputationSource =>
  REPUTATION_SOURCES.some((k) => k === v);

/** Per-agent reputation as served by GET /api/stellar/reputation[/{agent_id}]. */
export type ReputationInfo = {
  agent_id: string;
  smoothed_bps: number;
  lower_bound_bps: number;
  avg_bps: number;
  count: number;
  weight: number;
  disputed: number;
  dispute_rate_bps: number;
  /** One of `REPUTATION_SOURCES` today, but any string on the wire. Narrow
   *  with `isReputationSource`; only `"onchain"` is evidence. */
  source: string;
  /**
   * The on-chain ledger read failed and this score is the Bayesian prior
   * served in its place — the reputation service fails OPEN. It is the only
   * thing separating "we could not read the chain" from a genuine cold-start
   * newcomer, which `source: "prior"` alone reports identically. Optional:
   * absent on any response from a backend that predates the flag.
   */
  degraded?: boolean;
};

/** Response of GET /api/stellar/reputation — all agents keyed by id. */
export type ReputationBatch = {
  reputations: Record<string, ReputationInfo>;
  floor_bps: number;
  prior_bps: number;
};

/**
 * One `charged` event the escrow emitted for an agent — a real settlement, or
 * a self-payment dressed as one.
 *
 * `self_payment` is the field that carries the weight. The `charged` event
 * payload has no payer and no owner in it, so the backend resolves
 * `authorization(auth_id).payer` and compares it against `owner_of(agent_id)`.
 * Every settlement on this deployment so far has come back true: the platform
 * account paying itself. Rendering those as operator revenue would be the
 * single most misleading thing this dashboard could do.
 */
export type SettlementEntry = {
  job_id: string;
  auth_id: string;
  amount_stroops: number;
  ledger: number;
  /**
   * The charge transaction, as 64 lowercase hex characters.
   *
   * Null means the node handed us something that is not a usable hash — the
   * SDK requires the field, so it can never be absent, but it validates only
   * that it is a string. The backend shape-checks it and sends null rather
   * than pass a malformed value through. **Render no link at all for null**,
   * never an empty href: a dead evidence link looks like proof and sends an
   * operator off to verify a charge against a 404.
   */
  tx_hash?: string | null;
  /** Ledger close time, or null when the RPC response omitted it. */
  at: string | null;
  /** A G… address, or the literal "unknown" when the escrow's authorization
   *  record could not be read. Never a plausible-looking fake address. */
  payer: string;
  self_payment: boolean;
  /**
   * Why this charge is not counted as revenue, or null when it is.
   *
   * `self_payment` alone collapses four different facts into one boolean, and
   * they do not mean the same thing to an operator: their own wallet funding a
   * charge, the platform's settler funding it, and the backend being unable to
   * establish either are separate situations, and only the middle one is the
   * platform paying itself. Reported as an open string rather than a union so
   * an older backend, or a value added later, degrades to "excluded, reason
   * not recognised" instead of failing the guard.
   *
   * Known values: "payer_unreadable", "owner", "settler",
   * "settler_unreadable". Null exactly when `self_payment` is false, and
   * absent altogether on a response from a backend that predates the field —
   * optional for the same reason `degraded` is, so the older shape stays a
   * valid payload rather than a rejected one.
   */
  exclusion?: string | null;
};

/**
 * Response of GET /api/stellar/settlement/{agent_id} — what an agent has
 * actually been paid, and the limits of that claim.
 *
 * Both limits are part of the payload on purpose. `window_days` is the Soroban
 * RPC event retention (7 days, measured — not a policy we chose), so an empty
 * list means "nothing in the last week", never "nothing ever". `unavailable`
 * carries the reason the scan could not run at all, which must never be
 * rendered as a zero.
 */
export type AgentSettlement = {
  agent_id: string;
  /** The asset the escrow's SAC wraps — "native" on testnet. */
  asset: string;
  window_days: number;
  scanned_ledgers: number;
  entries: SettlementEntry[];
  /** Sum of entries where `self_payment` is false. The honest number. */
  total_stroops: number;
  /** Sum of the excluded self-payments, reported rather than hidden. */
  self_payment_stroops: number;
  /** The scan stopped at its page cap before reaching the window's end. */
  truncated: boolean;
  /** Why no scan happened, or null when one did. */
  unavailable: string | null;
};

/** Response of GET /api/stellar/reputation/params — the full parameter set
 * of the reputation system (routing constants + on-chain decay constants). */
export type ReputationParams = {
  enabled: boolean;
  prior_bps: number;
  prior_weight_usdc: number;
  floor_bps: number;
  max_rating_weight_usdc: number;
  read_ttl_seconds: number;
  wilson_z: number;
  epoch_seconds: number;
  decay_bps_per_epoch: number;
  max_decay_epochs: number;
  contract_id: string;
  network: string;
};

/** Response of POST /api/stellar/build/authorize — the unsigned x402
 * authorization the wallet is asked to sign. */
export type AuthorizeBuild = {
  xdr: string;
  /**
   * Epoch seconds stamped into the authorization: escrow v2 refuses to
   * settle after it and refuses the buyer's reclaim before it. Optional on
   * read — every backend sends it, but the card only needs it to tell a buyer
   * when held funds can be reclaimed, and says "once it expires" without it.
   */
  expires_at?: number;
};

/** Response of POST /api/stellar/submit — the outcome of broadcasting a
 * signed envelope. `return_value` is the contract's raw return, normalized
 * by the caller (hex, base64 or a byte list). */
export type SubmitResult = {
  hash: string;
  status: string;
  return_value: unknown;
  diagnostic?: string;
  explorer?: string;
};

/** Response of GET /api/stellar/network — network meta + deployed contract ids. */
export type StellarNetworkInfo = {
  network: string;
  rpc_url: string;
  network_passphrase: string;
  admin: string;
  contracts: Record<string, string>;
  asset: string;
  asset_sac: string;
};

/** Request body of POST /api/stellar/build/register-agent — the fields the
 * backend assembles the unsigned register-agent transaction from. */
export type RegisterAgentReq = {
  owner: string;
  agent_id: string;
  name: string;
  skills: string[];
  price_usdc: number;
};

/** Body of POST /api/stellar/build/update-price — the owner re-prices their
 * own agent (story 1.08). Ownership is the contract's require_auth. */
export type UpdatePriceReq = {
  owner: string;
  agent_id: string;
  price_usdc: number;
};

/** Body of POST /api/stellar/build/set-active — delist (`active: false`) or
 * relist (`active: true`) an owned agent (story 1.08). Reversible; never a
 * delete. */
export type SetActiveReq = {
  owner: string;
  agent_id: string;
  active: boolean;
};

/** A bare unsigned-XDR envelope: the register-agent build hands `xdr` straight
 * to the wallet to sign. */
export type XdrResponse = { xdr: string };

/** Response of GET /api/stellar/agent-id-available/{id} — whether a desired
 * agent id can be claimed, and why not when it cannot. `reason` is one of
 * id_malformed | id_reserved | id_taken; `owner` is present only for id_taken. */
export type AgentIdAvailability = {
  available: boolean;
  reason?: string | null; // id_malformed | id_reserved | id_taken
  message?: string | null;
  owner?: string | null; // present for id_taken
};

/** Response of POST /api/stellar/agents/sync — how many on-chain agents were
 * reindexed. */
export type SyncResponse = { synced: number };

// ── Agent endpoint binding (story 2.01) ─────────────────────

/**
 * A timestamp as the bind endpoints serialize it.
 *
 * The contract pins the field names but not their primitive, and the two
 * plausible serializations are both in use in this codebase already: FastAPI
 * renders a `datetime` as an ISO-8601 string, while the x402 build endpoints
 * (`AuthorizeBuild.expires_at`) answer with a Unix epoch. Accepting both means
 * a serializer detail can never make a perfectly valid binding read as
 * malformed; callers normalize at render time.
 */
export type BindTimestamp = string | number;

/** Body of POST /api/agents/{agent_id}/bind/challenge. */
export type BindChallengeReq = { endpoint_url: string };

/**
 * Response of POST /api/agents/{agent_id}/bind/challenge — the nonce the
 * agent's owner must sign before the endpoint is accepted.
 */
export type BindChallenge = {
  agent_id: string;
  nonce: string;
  /**
   * The EXACT string the wallet must sign, composed server-side as
   * `orizon-bind:v1:{agent_id}:{endpoint_url}:{nonce}`. Signed verbatim and
   * never re-derived on the client: the backend may normalize the URL it
   * embeds (host case, a trailing slash), and signing a locally rebuilt
   * string would produce a signature it then rejects as invalid.
   */
  message: string;
  expires_at: BindTimestamp;
  /** Seconds the nonce stays valid — drives the re-challenge countdown. */
  ttl_seconds: number;
};

/** Body of POST /api/agents/{agent_id}/bind. `signature` is base64 ed25519
 * over `BindChallenge.message`. */
export type BindReq = { endpoint_url: string; signature: string };

/**
 * A live agent → endpoint binding: the response of both
 * POST /api/agents/{agent_id}/bind and GET /api/agents/{agent_id}/binding.
 */
export type AgentBinding = {
  agent_id: string;
  endpoint_url: string;
  /** The owning wallet's G-address, as the registry holds it. */
  owner: string;
  bound_at: BindTimestamp;
  /** True when this bind superseded an existing endpoint rather than being
   * the agent's first — the difference between "bound" and "re-pointed", and
   * the only warning an owner gets that they overwrote a live route. */
  replaced: boolean;
};

/**
 * Response of GET /api/agents/bind/endpoint-check — an advisory verdict on a
 * candidate URL. The backend opens no connection to reach it, so the check is
 * cheap enough to drive INLINE field validation while the owner types, which
 * turns what would otherwise be a bare 422 at submit time into a reason.
 */
export type EndpointCheck = {
  allowed: boolean;
  /** Which policy rule refused the URL; absent or null when allowed. */
  rule?: string | null;
  /** Human sentence for the field hint. */
  message?: string | null;
};

/**
 * The machine-readable codes the bind endpoints answer with, carried in the
 * shared `{ detail, error: { code, message, request_id } }` envelope.
 *
 * These are the fork the human message cannot express: `endpoint_not_allowed`
 * belongs inline under the URL field, `registry_unavailable` is a retryable
 * banner, `not_agent_owner` is a connected-wallet mismatch, and
 * `binding_not_found` is not a failure at all. One 4xx sentence, four screens.
 */
export type BindErrorCode =
  | "agent_not_found"
  | "not_agent_owner"
  | "challenge_invalid"
  | "endpoint_not_allowed"
  | "signature_malformed"
  | "registry_unavailable"
  | "binding_not_found"
  | "rate_limited";

// ── disputes (stories 4.02–4.05) ─────────────────────────────────

/**
 * A dispute's lifecycle as the backend records it. `crediting` is not an
 * outcome anyone chooses: it is a refund in flight, held so a retry can never
 * pay twice (story 4.03).
 */
/**
 * What happened to a paid run's money, as the backend reports it
 * (`SettlementState` in its app/schemas.py, ADR 0010). Null — or absent, on
 * a backend that predates it — is a run that asked for no on-chain
 * settlement, or one the backend no longer holds: "not attempted" as far as
 * anyone can say.
 *
 * - `settled`: the settle CONFIRMED — each delivered step's operator paid
 *   from escrow, the rest returned to the payer.
 * - `released`: v2 only. Nothing was delivered, so an empty settle returned
 *   the payer's whole custody and paid nobody.
 * - `skipped`: v1 only. Nothing was delivered, so nothing was charged.
 * - `unconfirmed`: submitted and then lost track of. It MAY still land and is
 *   never retried; nothing is shown as paid until it is known.
 * - `failed`: definitely moved no money — refused before it was sent, or
 *   rejected by the ledger. Under v2 the funds stay in escrow.
 */
export const SETTLEMENT_STATES = [
  "settled",
  "released",
  "skipped",
  "unconfirmed",
  "failed",
] as const;
export type SettlementState = (typeof SETTLEMENT_STATES)[number];

/**
 * One step's payout as the receipt may state it. `paid` only when the
 * settlement is confirmed AND the backend reported the amount; everything
 * else says what is known and no more.
 */
export type StepPayout =
  | {
      kind: "paid";
      usdc: number;
      /** The settle transaction the payout happened in, when recorded. */
      tx: string | null;
      receiptIdHex: string | null;
    }
  /** Delivered by a seeded platform agent: never billed, share returned. */
  | { kind: "platform" }
  /** Delivered, and paid nothing for a reason the backend named. */
  | { kind: "not_billed"; reason: "free" | "owner_unreadable" | "over_cap" }
  | { kind: "pending" }
  | { kind: "not_paid" }
  | { kind: "unreported" };

/** What came back to the payer from escrow, on the same terms. */
export type SettlementRemainder =
  | { kind: "returned"; usdc: number }
  | { kind: "pending" }
  | { kind: "held" }
  | { kind: "unreported" };

export type DisputeStatus =
  "open" | "upheld" | "crediting" | "credited" | "rejected";

/**
 * The terms a dispute is raised under. Served by the backend rather than
 * written into the UI, so the buyer is shown the policy actually in force —
 * and shown it BEFORE they commit (story 4.05's product rule).
 */
export type CreditPolicy = {
  /** Share of a disputed step's charge credited if upheld, from 0 to 1. */
  credited_fraction: number;
  /** Who pays the credit: the platform, never clawed back from the agent. */
  funded_by: "platform";
  /** Who decides: the platform. There is no on-chain arbitration. */
  adjudicated_by: "platform";
};

/**
 * One step of a settled workflow, as it was charged — read from the durable
 * settlement record, never from the trace, which is in-memory and gone after
 * a restart while a buyer still has the whole window to dispute.
 */
export type SettlementStepView = {
  step_index: number;
  agent_id: string;
  agent_name: string | null;
  /** What the step was charged, in USDC. */
  price_usdc: number;
  /**
   * Whether the step produced output and was charged. A step that did not
   * deliver was never billed, so there is nothing to dispute.
   */
  delivered: boolean;
  /**
   * What an upheld dispute of this step would credit, computed by the backend
   * with the refund's own rule so the UI never re-derives the rounding. 0 when
   * the step did not deliver.
   */
  creditable_usdc: number;
  /** The one line the step produced; null when it was not recorded. */
  output_summary: string | null;
  // Escrow v2's payout, per step. OPTIONAL like story 4.06's dispute fields:
  // this client deploys ahead of the backend, and a backend on escrow v1 has
  // no per-step payout to report. Absent means "not reported", never zero.
  /**
   * What `settle` paid this step's operator, from its `charged` event. Null
   * on a v1 settlement, which paid one total for the run. 0 on a v2 step no
   * one was paid for: undelivered, free, or run by a seeded platform agent
   * with no on-chain owner, whose share went back to the buyer. Only read as
   * money moved when the settlement is `settled`.
   */
  paid_usdc?: number | null;
  /**
   * The on-chain receipt that payout minted (16 bytes, hex). The payout
   * itself happened inside the settlement's transaction, `charge_tx`.
   */
  receipt_id_hex?: string | null;
  /**
   * Why a DELIVERED v2 step was paid nothing: "free", "no_onchain_owner" (a
   * seeded platform agent — a payout naming it would revert the whole
   * settle), "owner_unreadable" or "over_authorized_cap". Null for a paid
   * step, an undelivered one and every v1 record. An open string: a reason
   * this build does not know still reads as "not paid", never as paid.
   */
  unpaid_reason?: string | null;
};

/** A workflow's settlement: what moved, who paid, and until when to dispute. */
export type SettlementView = {
  job_id_hex: string;
  /** The G-address that paid. Only this wallet may dispute. */
  payer: string;
  /** Epoch seconds, on the server's clock. */
  settled_at: number;
  /** Epoch seconds, stamped at settlement and never moved afterwards. */
  window_closes_at: number;
  settled_usdc: number;
  charge_tx: string | null;
  proof_tx: string | null;
  steps: SettlementStepView[];
  policy: CreditPolicy;
  /**
   * What `settle` returned to the payer from escrow — the maximum they
   * authorized less what the steps were paid — as the `settled` event states
   * it. Optional and nullable: v1 had no remainder, and an unreported one is
   * never derived here from other figures, because a computed refund is a
   * claim about money the chain has not been read for.
   */
  returned_usdc?: number | null;
};

/** One buyer's dispute of one settled step. */
export type Dispute = {
  id: string;
  job_id_hex: string;
  task_id: string;
  step_index: number;
  agent_id: string;
  payer: string;
  reason: string;
  status: DisputeStatus;
  /** What the disputed step cost. */
  charged_usdc: number;
  /** What an upheld dispute credits, frozen when the dispute was opened. */
  creditable_usdc: number;
  /** Epoch seconds. */
  opened_at: number;
  resolved_at: number | null;
  refund_tx: string | null;
  rating_tx: string | null;
  // The four fields story 4.06 added. OPTIONAL, unlike every field above:
  // this client deploys itself on merge and the backend does not, so it will
  // meet a backend that sends none of them, and a strict check that demanded
  // them would put every receipt into an error state until the backend caught
  // up. Absent means "not known", never a value.
  /** What the refund actually transferred; set once credited. */
  credited_usdc?: number | null;
  /** Epoch seconds of the dispute's last state change. */
  updated_at?: number | null;
  /**
   * Whether `rating_tx` is known to have landed. A hash is recorded on a
   * timeout too, so the hash alone never proves the agent was rated.
   */
  rating_confirmed?: boolean | null;
  /**
   * Whether `refund_tx` is known to have landed — the money artifact's answer
   * to `rating_confirmed`, and the stricter rule the refund was missing: the
   * hash is the sole gate on the final amount and on the green "Refunded"
   * badge, so a backend that can tell an unconfirmed transfer from a landed
   * one must be able to say so.
   *
   * ABSENT (today's backend sends no such field) means "this backend does not
   * distinguish", NOT "unconfirmed" — reading it as unconfirmed would show
   * every real refund as pending for ever. A `credited` record with a hash is
   * then taken at its word, on the backend's own invariant: `credited` is
   * written only once the transfer has landed, and the hash is written with
   * it. An explicit `false` is the only way to withdraw that word.
   */
  refund_confirmed?: boolean | null;
  /**
   * The adjudicator's reason, present only when the dispute was rejected.
   * Written for the buyer, and shown only to the buyer.
   */
  rejection_reason?: string | null;
  /**
   * Whether `reason` and `rejection_reason` were withheld from THIS caller —
   * true exactly when the backend blanked them for want of a task read token
   * or a payer's read grant (D-067). Absent on a backend that predates the
   * grant, which offers the payer no way to read them back.
   */
  reason_withheld?: boolean;
};

/**
 * Response of GET /api/tasks/{task_id}/disputes — a workflow's settlement and
 * every dispute raised against it, in one read.
 *
 * `now` and `settlement` are OPTIONAL on purpose. The frontend deploys itself
 * on every merge and the backend does not, so this client will meet a backend
 * that predates both fields; an absent `settlement` must read as "not
 * disputable yet", never as a crash.
 */
export type TaskDisputes = {
  task_id: string;
  /**
   * The backend's machine-readable answer to "did this run's escrow v2
   * settlement land?" — present whether or not a settlement is on record,
   * because a failed or unconfirmed settle writes none. Absent on a backend
   * that predates it, which is read exactly as before: a record means a
   * confirmed charge. A value this build does not know is read as
   * `unconfirmed`, the answer that claims the least.
   */
  settlement_state?: SettlementState | null;
  /** Kept for older clients; equals `settlement.window_closes_at`. */
  window_closes_at: number | null;
  /** The server's clock at response time, in epoch seconds. */
  now?: number;
  /** Null until the workflow settles. */
  settlement?: SettlementView | null;
  disputes: Dispute[];
};

export type DisputeChallengeReq = { job_id_hex: string; step_index: number };

/**
 * Response of POST /api/disputes/challenge — a single-use nonce the payer's
 * wallet must sign before a dispute is accepted.
 */
export type DisputeChallenge = {
  /**
   * The EXACT string the wallet must sign, composed server-side as
   * `orizon-dispute:v1:{job_id_hex}:{step_index}:{nonce}`. Signed verbatim and
   * never rebuilt on the client, for the same reason as `BindChallenge`.
   */
  message: string;
  nonce: string;
  /** Epoch seconds after which the nonce is refused. */
  expires_at: number;
};

/** Body of POST /api/disputes. */
export type OpenDisputeReq = {
  job_id_hex: string;
  step_index: number;
  reason: string;
  /** The G-address that signed — it must be the workflow's payer. */
  payer: string;
  nonce: string;
  signature_b64: string;
};

/**
 * The codes opening a dispute can be refused with, in the shared
 * `{ detail, error: { code, message, request_id } }` envelope. Each needs a
 * different screen: `challenge_expired` is a silent retry, `not_the_payer` is
 * a wallet mismatch, `dispute_window_closed` is final, and `duplicate_dispute`
 * is not a failure at all — the step already has its dispute.
 *
 * `reason_invalid` is every unusable reason — empty, blank, invisible-only or
 * too long — whichever side refused it; its `DisputeRefusal` carries the
 * sentence to show, which names the limit. `reason_required` is what the
 * backend deployed before it said, for a blank reason alone. `openDispute`
 * folds it into `reason_invalid`, but it stays a member here for as long as
 * a deployed backend can send it: `disputeErrorCode` narrows the wire code
 * into this union, and dropping it would type a real answer as impossible.
 */
export type DisputeErrorCode =
  | "reason_invalid"
  | "reason_required"
  | "unknown_job"
  | "signature_malformed"
  | "challenge_expired"
  | "not_the_payer"
  | "dispute_window_closed"
  | "step_not_settled"
  | "nothing_was_charged"
  | "duplicate_dispute"
  | "rate_limited";

/**
 * Who is looking at a settled workflow. The page cannot tell a payer from
 * anyone else until a wallet connects, so `anonymous` is its own case: it is
 * shown the receipt and a prompt to connect the paying wallet, never an action.
 */
export type DisputeViewer = "payer" | "other" | "anonymous";

/**
 * Why one settled step can or cannot be disputed by THIS viewer right now.
 * Every rule story 4.05 states lives in how this is derived, in pure code:
 * an undelivered step was never charged; a step has at most one dispute; a
 * closed window offers nothing; and only the payer is ever offered an action.
 */
export type StepDisputeState =
  | { kind: "disputable" }
  | {
      kind: "disputed";
      dispute: Dispute;
      showReason: boolean;
      receipt: DisputeReceiptView;
    }
  | { kind: "not_charged" }
  /** The settlement is not confirmed: nothing to dispute until it is. */
  | { kind: "payout_unconfirmed" }
  | { kind: "window_closed" }
  | { kind: "view_only" };

/**
 * The whole receipt panel, derived purely from the backend's answer, the
 * connected wallet, whether the workflow has finished, and the server-corrected
 * clock. The panel renders this and decides nothing.
 *
 * `hidden` covers the trace page's demo mode and a backend too old to send a
 * settlement at all. `not_settled` is the backend's answer that it holds no
 * settlement RECORD — not yet, while `running`, or none once the wait for
 * one is spent — and the panel says so rather than showing nothing. It is
 * not proof that nothing was charged: a store that lost its records answers
 * the same way, so the copy states what is on record, never what happened.
 * It never replaces a receipt already shown (see `useDisputePanel`).
 */
export type DisputePanelView =
  | { kind: "hidden" }
  | {
      kind: "not_settled";
      running: boolean;
      /** The backend's settlement state, when it reports one. */
      settlementState?: SettlementState | null;
      /** The panel stopped re-reading an unconfirmed settlement. */
      settlementStoppedChecking?: boolean;
    }
  | {
      kind: "settled";
      viewer: DisputeViewer;
      window: {
        open: boolean;
        /** Epoch milliseconds, server clock. */
        closesAtMs: number;
        /** Milliseconds left on the server's clock; 0 once closed. */
        remainingMs: number;
      };
      jobIdHex: string;
      payer: string;
      /** Epoch milliseconds, server clock. */
      settledAtMs: number;
      settledUsdc: number;
      chargeTx: string | null;
      proofTx: string | null;
      policy: CreditPolicy;
      steps: {
        step: SettlementStepView;
        state: StepDisputeState;
        /** Absent on a backend that reports no settlement state (v1). */
        payout?: StepPayout;
      }[];
      /**
       * The backend's settlement state; absent or null on a backend that
       * predates it, where a record on file means a confirmed charge.
       */
      settlementState?: SettlementState | null;
      /** What came back to the payer; absent where no state is reported. */
      remainder?: SettlementRemainder;
      /**
       * The panel stopped re-reading an unconfirmed settlement: whatever it
       * says is only as fresh as the last read.
       */
      settlementStoppedChecking?: boolean;
      /**
       * The payer is looking, and the backend withheld their own dispute
       * words from this read (D-067): they may sign to read them. Always
       * false for anyone else, and on a backend that cannot say.
       */
      reasonsWithheld: boolean;
    };

/**
 * One on-chain artifact of an upheld dispute — the refund transfer or the
 * dispute rating — stated only as far as the record can vouch for it.
 * `confirmed` is the ONLY state that may read as done: a hash that is merely
 * in flight is `pending`, because an optimistic "refunded" that is later
 * contradicted is worse than no receipt at all (story 4.06).
 */
export type DisputeArtifact = {
  txHash: string | null;
  state: "confirmed" | "pending" | "none";
};

/**
 * What a buyer is told about one dispute, derived purely from the record, the
 * policy and who is looking. The receipt draws it and decides nothing.
 */
export type DisputeReceiptView = {
  status: DisputeStatus;
  /** Epoch milliseconds. */
  openedAtMs: number;
  /**
   * Epoch milliseconds of the last state change. An older backend sends no
   * `updated_at`, so this falls back to `resolved_at`, then `opened_at`.
   */
  lastChangedAtMs: number;
  /**
   * What an upheld dispute pays: the amount actually transferred once
   * credited, the promise before that. `final` says which, so the copy never
   * calls a promise a payment.
   */
  amount: { usdc: number; final: boolean };
  /** Who pays the credit: always the platform, never clawed back. */
  fundedBy: CreditPolicy["funded_by"];
  refund: DisputeArtifact;
  rating: DisputeArtifact;
  /**
   * A rating the record still owes after its refund landed, which the panel
   * has stopped reading for (`PENDING_WAIT_MS`). The receipt says it stopped,
   * so "not recorded yet" is never left standing as though it were live.
   */
  ratingStalled: boolean;
  /**
   * The panel has stopped re-reading while this receipt still waits on
   * something — a decision, a refund, a rating (see `disputePollMs`'s
   * bounds). Whatever the receipt says is pending is then only as fresh as
   * the last read, and the copy must say it stopped checking and how to look
   * again, never go on implying the page will update itself. Absent reads as
   * false.
   */
  stoppedChecking?: boolean;
  /** The buyer's own reason; null for anyone but the payer. */
  reason: string | null;
  /** Why it was rejected; null unless rejected, and for anyone but the payer. */
  rejectionReason: string | null;
};
