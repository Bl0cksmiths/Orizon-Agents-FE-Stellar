export type AgentStatus = "online" | "idle" | "offline";

export type Agent = {
  id: string;
  name: string;
  skills: string[];
  price: number;
  rep: number;
  status: AgentStatus;
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
   *  The provenance signal of record. Absent on responses predating it. */
  source?: AgentSource;
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
export type AgentSource = "seeded" | "onchain";

export type TaskStatus = "pending" | "running" | "complete" | "failed";

export type Task = {
  id: string;
  intent: string;
  agents: number;
  spent: number;
  status: TaskStatus;
  started: string;
};

export type PlanStep = {
  agent_id: string;
  agent_name?: string;
  rationale: string;
  est_price_usdc: number;
  est_eta_seconds: number;
  rep_bps?: number | null;
  rep_source?: ReputationSource | null;
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

export type PlanFloorNoticeKind = "excluded" | "substituted" | "degraded";

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
  "below_floor" | "unbound_endpoint" | "floor_relaxed";

/** One reputation-floor action taken while building the plan
 * (`PlanFloorNotice` in the backend's app/schemas.py). `replacement_*` are
 * set only when kind is "substituted". */
export type PlanFloorNotice = {
  kind: PlanFloorNoticeKind;
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
export type TraceLine = { t: string; level: TraceLevel; msg: string };

export type ArtifactFile = {
  path: string;
  language: string;
  content: string;
};

export type CodeArtifact = {
  title: string;
  summary: string;
  files: ArtifactFile[];
  entry: string;
  preview_html: string;
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

export type Overview = {
  agents_online: number;
  tasks_per_sec: number;
  avg_completion: number;
  avg_trust: number;
  throughput: number[];
  skills: { name: string; pct: number; tone: "violet" | "cyan" | "magenta" }[];
};

/** Where a reputation score comes from: on-chain evidence or the Bayesian prior. */
export type ReputationSource = "onchain" | "prior";

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
  source: ReputationSource;
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
  expires_at: number;
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
  /** Kept for older clients; equals `settlement.window_closes_at`. */
  window_closes_at: number | null;
  /** The server's clock at response time, in epoch seconds. */
  now?: number;
  /** Null until the workflow settles. */
  settlement?: SettlementView | null;
  disputes: Dispute[];
};
