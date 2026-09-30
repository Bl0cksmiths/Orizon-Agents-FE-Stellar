/**
 * Hand-written runtime guards for the responses whose fields feed arithmetic
 * or `.map` during render. A malformed payload (proxy error page, half-rolled
 * backend, envelope change) would otherwise crash the component tree with
 * `undefined.toFixed(...)`; failing the guard lets lib/api.ts surface a
 * normal error state instead.
 *
 * Deliberately shallow: each guard checks only the fields the UI actually
 * computes with — not the full schema. Zero dependencies.
 */

import type {
  Agent,
  AgentBinding,
  AgentSettlement,
  AgentIdAvailability,
  ArtifactFile,
  ArtifactResponse,
  AuthorizeBuild,
  BindChallenge,
  BindErrorCode,
  BindTimestamp,
  CodeArtifact,
  EndpointCheck,
  DecomposeResponse,
  Flow,
  Overview,
  PlanFloorNotice,
  PlanStep,
  ReputationBatch,
  ReputationInfo,
  ReputationParams,
  StellarNetworkInfo,
  SubmitResult,
  SyncResponse,
  Task,
  TraceLine,
  XdrResponse,
} from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isStr = (v: unknown): v is string => typeof v === "string";

/** A string, or absent. For fields the UI renders behind a fallback: a wrong
 * *type* is still rejected, a missing one is not. */
const isOptionalStr = (v: unknown): v is string | undefined =>
  v === undefined || v === null || isStr(v);

/** A boolean, or absent. Same contract as `isOptionalStr` — the point is to
 * stop a truthy non-boolean (the string `"false"`) from reading as `true`. */
const isOptionalBool = (v: unknown): v is boolean | undefined =>
  v === undefined || v === null || typeof v === "boolean";

/** A finite number, or absent. The numeric mate of `isOptionalStr`: a wrong
 * type is still rejected, a missing one is not. Exists because a field the UI
 * divides or compares must never arrive as a string that coerces. */
const isOptionalNum = (v: unknown): v is number | undefined =>
  v === undefined || v === null || isNum(v);

const isNumArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every(isNum);

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isStr);

/**
 * How many items a per-item screen dropped from a payload, keyed by the very
 * object the screen returned. A WeakMap rather than a field on the payload so
 * the wire types stay the wire types, and so a payload that never went
 * through a screen (a test fixture, an older cache) simply reads as 0.
 */
const DROPPED = new WeakMap<object, number>();

/**
 * How many items were dropped from this payload because they were unusable —
 * a required field missing or the wrong type, or a present optional field of
 * the wrong type. Pass the exact object `listAgents`, `listReputation` or
 * `decompose` resolved with (and `useFetch` hands back); a copy reads as 0.
 *
 * - agent list (`screenAgentList`): agents dropped
 * - reputation batch (`screenReputationBatch`): entries dropped
 * - plan (`screenDecomposeResponse`): notices dropped (steps are never
 *   dropped — a plan missing a step fails as a whole)
 *
 * A page should say "N could not be shown" when this is above 0, rather than
 * let an item vanish silently. An unknown enum value is NOT a drop: it passes
 * through as a string for the component to show neutrally.
 */
export function droppedCount(payload: object): number {
  return DROPPED.get(payload) ?? 0;
}

/** Keeps the items that pass `isItem`, and records how many did not against
 * the array it returns. */
function keepValid<T>(items: unknown[], isItem: (v: unknown) => v is T): T[] {
  const kept = items.filter(isItem);
  DROPPED.set(kept, items.length - kept.length);
  return kept;
}

/** One agent row: `price.toFixed(3)`, `runs.toLocaleString()`, `skills.map`,
 * `rep * 2000`. Mirrors backend `Agent` (`app/schemas.py`); `real` has a
 * server default and is only used as a truthiness flag, so it stays
 * unchecked. `owner` is the registering wallet (on-chain indexed agents only,
 * null for seeded) and feeds the "my agents" wallet comparison, so a wrong
 * type is rejected while absent/null is tolerated.
 *
 * `status` and `source` are checked as strings, NOT against the values this
 * build knows: a backend that adds a status or a provenance must not make the
 * agent disappear. The components narrow them (`isAgentStatus`,
 * `isAgentSource`) and show anything else neutrally. */
function isAgent(a: unknown): a is Agent {
  return (
    isRecord(a) &&
    isStr(a.id) &&
    isStr(a.name) &&
    isStrArray(a.skills) &&
    isNum(a.price) &&
    isNum(a.rep) &&
    isNum(a.runs) &&
    isOptionalStr(a.owner) &&
    isOptionalStr(a.source) &&
    // Tri-state: true, false, or absent/null meaning "does not apply".
    isOptionalBool(a.bound) &&
    isStr(a.status)
  );
}

/** Agents table, operator dashboard, reputation leaderboard. Screened per
 * agent: one unusable agent is dropped (and counted, see `droppedCount`)
 * instead of emptying the whole registry. Null only when the payload is not a
 * list at all — a proxy error page or an error envelope. */
export function screenAgentList(v: unknown): Agent[] | null {
  return Array.isArray(v) ? keepValid(v, isAgent) : null;
}

/** Dashboard + sidebar: stat tiles do `*100`/`.toFixed`, sparkline maps
 * `throughput`, the skills list maps `name`/`pct` and colors each bar from
 * `tone`.
 *
 * `tone` is checked as a string only *when present*: the backend types skills
 * as `list[dict[str, Any]]` (`OverviewMetrics`, app/schemas.py), so pydantic
 * guarantees no key at all — requiring it (or pinning it to today's three
 * tone names) would reject payloads the contract permits. The renderer already
 * falls back to a default color for an unknown tone; the check only rules out
 * a non-string sneaking into a comparison. */
export function isOverview(v: unknown): v is Overview {
  return (
    isRecord(v) &&
    isNum(v.agents_online) &&
    isNum(v.tasks_per_sec) &&
    isNum(v.avg_completion) &&
    isNum(v.avg_trust) &&
    isNumArray(v.throughput) &&
    Array.isArray(v.skills) &&
    v.skills.every(
      (s) =>
        isRecord(s) &&
        isStr(s.name) &&
        isNum(s.pct) &&
        (s.tone === undefined || s.tone === null || isStr(s.tone)),
    )
  );
}

/** Flow graph: `nodes.map` positions each node with `x`/`y` percentages and
 * `edges.map(([from, to]) => …)` destructures every edge — a missing or
 * non-pair `edges` entry is an immediate crash. Mirrors backend `Flow` /
 * `FlowNode` (`app/schemas.py`), where edges are `list[tuple[str, str]]`. */
export function isFlow(v: unknown): v is Flow {
  return (
    isRecord(v) &&
    Array.isArray(v.nodes) &&
    v.nodes.every(
      (n) =>
        isRecord(n) &&
        isStr(n.id) &&
        isStr(n.label) &&
        isStr(n.sub) &&
        isNum(n.x) &&
        isNum(n.y),
    ) &&
    Array.isArray(v.edges) &&
    v.edges.every((e) => Array.isArray(e) && e.length === 2 && e.every(isStr))
  );
}

/** Backend `TaskStatus` literal (`app/schemas.py`). */
const TASK_STATUSES = new Set(["pending", "running", "complete", "failed"]);

/** Task table: rows keyed by `id`, `spent.toFixed(3)` per row, and `status`
 * indexes a tone map (`statusTone[t.status]`) — an unlisted value resolves to
 * `undefined` and renders an unstyled badge, so it is checked against the
 * backend literal rather than merely as a string. */
export function isTaskList(v: unknown): v is Task[] {
  return (
    Array.isArray(v) &&
    v.every(
      (t) =>
        isRecord(t) &&
        isStr(t.id) &&
        isNum(t.spent) &&
        isStr(t.status) &&
        TASK_STATUSES.has(t.status) &&
        // The settlement outcome: any string, null, or absent (see Task).
        (t.settlement === undefined ||
          t.settlement === null ||
          isStr(t.settlement)),
    )
  );
}

/** Backend `TraceLevel` literal (`app/schemas.py`). Checked as a set because
 * the trace view colors each row with `levelColor[line.level]` — an unlisted
 * level resolves to `undefined` and renders the row unstyled. */
const TRACE_LEVELS = new Set([
  "input",
  "exec",
  "proof",
  "cost",
  "out",
  "error",
  "artifact",
]);

/** One replayed trace row: `t`, `level` and `msg` are all rendered, and
 * `level` additionally keys the color map above.
 *
 * Exported on its own because lib/api.ts screens rows individually on the
 * SSE/polling path, where an unusable row is skipped rather than failing the
 * whole read. */
export function isTraceLine(v: unknown): v is TraceLine {
  return (
    isRecord(v) &&
    isStr(v.t) &&
    isStr(v.msg) &&
    isStr(v.level) &&
    TRACE_LEVELS.has(v.level) &&
    // The settlement outcome the trace gates its on-chain evidence on: absent
    // on an older backend, null on every other line, and a string when set —
    // any string, since `readSettlementState` reads one it cannot name as
    // unconfirmed rather than dropping the line.
    (v.settlement === undefined || v.settlement === null || isStr(v.settlement))
  );
}

/** Trace history: the trace view `.map`s it into rows, and the polling
 * fallback slices its tail by index — a non-array (a proxy error page, an
 * error envelope) silently reads as "no lines yet" and pins the page on
 * "awaiting next step…" forever. */
export function isTraceLineList(v: unknown): v is TraceLine[] {
  return Array.isArray(v) && v.every(isTraceLine);
}

/** One plan step: every step renders `rationale` as a React child — a
 * non-string (a dict from a half-rolled backend) throws "Objects are not
 * valid as a React child" — and `.toFixed`s both estimates. Required on
 * backend `PlanStep` (`app/schemas.py`).
 *
 * The floor fields (story 3.02) and the per-step reputation evidence are
 * additive: absent is fine (a backend predating them), null is how FastAPI
 * serializes an unset Optional, but a present value is never the wrong type.
 * `rep_source` is checked as a string only, NOT against the values this build
 * knows: the badge treats anything but `"onchain"` as an estimate. */
function isPlanStep(s: unknown): s is PlanStep {
  return (
    isRecord(s) &&
    isStr(s.agent_id) &&
    isStr(s.rationale) &&
    isNum(s.est_price_usdc) &&
    isNum(s.est_eta_seconds) &&
    // Rendered as the step's name, a React child: an object here throws and
    // takes the route down through the error boundary.
    isOptionalStr(s.agent_name) &&
    // The headline score the badge prints: a string or an object would print
    // "≈★NaN" beside the agent the buyer is being asked to pay.
    isOptionalNum(s.rep_bps) &&
    isOptionalStr(s.rep_source) &&
    // The reputation badge compares the bound against the floor and
    // prints the count and dispute rate, so each is a finite number or
    // absent. Anything else coerces to NaN, every comparison against it
    // is false — a below-floor agent reads as clearing the floor — and
    // the label prints "NaN% disputed".
    isOptionalNum(s.rep_lower_bound_bps) &&
    isOptionalNum(s.rep_count) &&
    isOptionalNum(s.rep_dispute_rate_bps) &&
    // The string "false" is truthy, and would tell the buyer a healthy
    // read had failed and the score beside it was only the prior.
    isOptionalBool(s.rep_degraded) &&
    isOptionalStr(s.substituted_for) &&
    // Truthy non-boolean would badge a healthy step as below-floor.
    isOptionalBool(s.degraded)
  );
}

/** One floor action. `kind` is checked as a string, NOT against the three
 * kinds this build has a mark for: a backend that adds one (say
 * `"delisted"`) must not blank the plan. The card narrows it with
 * `isPlanFloorNoticeKind` and shows anything else neutrally, beside the
 * backend's own `reason` prose. `reason_code` is open for the same reason. */
function isPlanFloorNotice(v: unknown): v is PlanFloorNotice {
  return (
    isRecord(v) &&
    isStr(v.kind) &&
    isStr(v.agent_id) &&
    isStr(v.reason) &&
    isOptionalStr(v.agent_name) &&
    isOptionalStr(v.replacement_id) &&
    isOptionalStr(v.replacement_name) &&
    isOptionalStr(v.reason_code) &&
    isOptionalNum(v.lower_bound_bps) &&
    isOptionalNum(v.floor_bps) &&
    // The evidence the panel words a below-floor row from: a string here
    // would print "NaN ratings" or read as a count it is not.
    isOptionalNum(v.count) &&
    isOptionalNum(v.dispute_rate_bps) &&
    // Strictly boolean: it decides whether a bound is worded as under the
    // floor, and the string "false" is truthy.
    isOptionalBool(v.awaiting_fresh_read)
  );
}

/** Everything about a plan except the notice items, which are screened one by
 * one below. */
type PlanShell = Omit<DecomposeResponse, "notices"> & { notices?: unknown };

/** `intent` is echoed back and not computed with, so it stays unchecked in
 * keeping with this file's shallow contract. */
function isPlanShell(v: unknown): v is PlanShell {
  return (
    isRecord(v) &&
    isStr(v.plan_id) &&
    isNum(v.total_usdc) &&
    isNum(v.total_eta) &&
    Array.isArray(v.steps) &&
    v.steps.every(isPlanStep) &&
    (v.notices == null || Array.isArray(v.notices)) &&
    // Both optional, because a plan card must keep rendering against a
    // backend that predates them. `floor_bps` is checked as a number rather
    // than defaulted here: a floor that arrives as a string would print "NaN"
    // in the threshold the buyer is being asked to trust.
    isOptionalNum(v.floor_bps) &&
    isOptionalBool(v.reputation_degraded) &&
    // Optional for the same reason, and strict for the same reason as the
    // flag above: the string "false" is truthy, and would tell the buyer the
    // planner never saw a plan it built.
    isOptionalBool(v.planner_fallback)
  );
}

/** Plan card: `total_usdc`/`total_eta` get `.toFixed`, and the steps and
 * notices are mapped into rows.
 *
 * Notices are screened per notice: an unusable one is dropped (and counted,
 * see `droppedCount`) so the card can say a floor action could not be shown,
 * instead of the buyer getting no plan at all.
 *
 * Steps are NOT. One unusable step, or a notices field that is not a list,
 * rejects the plan: the buyer authorizes `total_usdc` for every step and
 * `execute` runs the plan by id, so a card that quietly left a step out would
 * misstate what is being paid for. Returns null in that case, and when the
 * envelope itself is unusable. */
export function screenDecomposeResponse(v: unknown): DecomposeResponse | null {
  if (!isPlanShell(v)) return null;
  if (!Array.isArray(v.notices)) return { ...v, notices: undefined };
  const notices = v.notices.filter(isPlanFloorNotice);
  const plan: DecomposeResponse = { ...v, notices };
  DROPPED.set(plan, v.notices.length - notices.length);
  return plan;
}

/** One agent's reputation, served on its own by
 * GET /api/stellar/reputation/{agent_id} and as every value of the batch
 * below: the numbers feed bps→score math, evidence sums (`weight`), counts
 * and dispute rates. `disputed` is also a sort comparator
 * (`sortValue.disputes`) — a non-number makes every comparison NaN and
 * silently scrambles row order — and `avg_bps` is the unsmoothed on-chain
 * mean. All required on the backend model.
 *
 * `source` is checked as a string, NOT against the two values this build
 * knows: a backend that adds one must not blank the score. Every consumer
 * treats only `"onchain"` as evidence, so an unknown source is shown as an
 * estimate — the humbler claim — rather than as measured.
 *
 * `degraded` is the ledger-read-failed flag (the service fails open and
 * answers with the prior). Optional, because a backend predating it omits the
 * key entirely, but type-checked when present: it is the only signal telling
 * a fallback score from a real cold start, and a truthy non-boolean would
 * report every healthy read as a failed one. */
export function isReputationInfo(v: unknown): v is ReputationInfo {
  return (
    isRecord(v) &&
    isNum(v.smoothed_bps) &&
    isNum(v.lower_bound_bps) &&
    isNum(v.avg_bps) &&
    isNum(v.count) &&
    isNum(v.weight) &&
    isNum(v.disputed) &&
    isNum(v.dispute_rate_bps) &&
    isStr(v.source) &&
    isOptionalBool(v.degraded)
  );
}

/** Reputation pages: `reputations` values feed the math above and `floor_bps`
 * feeds the floor badge. Screened per entry: an unusable entry is dropped (and
 * counted, see `droppedCount`), which the pages already render honestly as "no
 * score" for that one agent, instead of blanking every score on the page.
 *
 * The envelope stays strict — null when `floor_bps`, `prior_bps` or the
 * `reputations` map is unusable — because no single score on the page can be
 * judged against a floor that did not arrive. */
export function screenReputationBatch(v: unknown): ReputationBatch | null {
  if (!(
    isRecord(v) &&
    isNum(v.floor_bps) &&
    isNum(v.prior_bps) &&
    isRecord(v.reputations)
  ))
    return null;
  const entries = Object.entries(v.reputations);
  const kept = entries.filter((e): e is [string, ReputationInfo] =>
    isReputationInfo(e[1]),
  );
  const batch: ReputationBatch = {
    ...v,
    floor_bps: v.floor_bps,
    prior_bps: v.prior_bps,
    reputations: Object.fromEntries(kept),
  };
  DROPPED.set(batch, entries.length - kept.length);
  return batch;
}

/** One settlement row. `amount_stroops` is summed and divided, `self_payment`
 * decides whether it counts as revenue at all, so a wrong type on either is
 * worse than a missing payload. */
const isSettlementEntry = (v: unknown): boolean =>
  isRecord(v) &&
  isStr(v.job_id) &&
  isStr(v.auth_id) &&
  isNum(v.amount_stroops) &&
  isNum(v.ledger) &&
  // Optional, so a response from a backend predating the field still renders
  // its charges. A wrong TYPE is still rejected: the panel builds an explorer
  // URL out of this, and a number coerced into a path is a link to nowhere.
  isOptionalStr(v.tx_hash) &&
  isOptionalStr(v.at) &&
  isStr(v.payer) &&
  typeof v.self_payment === "boolean" &&
  // Optional rather than required: a backend that predates the field still
  // serves correct figures, and rejecting the whole payload over a missing
  // explanation would trade real evidence for none.
  isOptionalStr(v.exclusion);

/** Settlement panel: every numeric below is rendered as money or as a window
 * boundary, and `unavailable` is what separates "nothing was paid" from "we
 * could not look". */
export function isAgentSettlement(v: unknown): v is AgentSettlement {
  return (
    isRecord(v) &&
    isStr(v.agent_id) &&
    isStr(v.asset) &&
    isNum(v.window_days) &&
    isNum(v.scanned_ledgers) &&
    Array.isArray(v.entries) &&
    v.entries.every(isSettlementEntry) &&
    isNum(v.total_stroops) &&
    isNum(v.self_payment_stroops) &&
    typeof v.truncated === "boolean" &&
    isOptionalStr(v.unavailable)
  );
}

/** Reputation reference card + score calculator: every numeric here is
 * divided or fed into the smoothed/lower-bound chain (`epoch_seconds / 86400`,
 * `decay_bps_per_epoch / 100`, the whole `prior_weight_usdc`/`wilson_z` math),
 * so a missing one renders `NaN` or `★ NaN`. Mirrors backend `ReputationParams`
 * (`app/routers/stellar.py`); `enabled` is not computed with, so it is left
 * unchecked in keeping with this file's shallow contract. */
export function isReputationParams(v: unknown): v is ReputationParams {
  return (
    isRecord(v) &&
    isNum(v.prior_bps) &&
    isNum(v.prior_weight_usdc) &&
    isNum(v.floor_bps) &&
    isNum(v.max_rating_weight_usdc) &&
    isNum(v.read_ttl_seconds) &&
    isNum(v.wilson_z) &&
    isNum(v.epoch_seconds) &&
    isNum(v.decay_bps_per_epoch) &&
    isNum(v.max_decay_epochs) &&
    isStr(v.contract_id) &&
    isStr(v.network)
  );
}

/** Artifact viewer maps `files`, sums `content.length`, renders `title` and
 * `preview_html`; `artifact` itself may legitimately be null (not sealed).
 *
 * This is the only validation the artifact ever gets: the backend types it as
 * a bare `dict` (`Task.artifact`, `ArtifactResponse.artifact`), so pydantic
 * performs no structural check and a worker's output crosses the HTTP seam
 * verbatim. `entry` and `summary` are required on the producing model
 * (`CodeArtifact`, app/agents/workers/code_gen.py) but both have working
 * render-time fallbacks, so they are only type-checked when present rather
 * than made mandatory. */
function isCodeArtifact(v: unknown): v is CodeArtifact {
  return (
    isRecord(v) &&
    isStr(v.title) &&
    isStr(v.preview_html) &&
    isOptionalStr(v.entry) &&
    isOptionalStr(v.summary) &&
    Array.isArray(v.files) &&
    v.files.every(isArtifactFile)
  );
}

/** One file of an artifact. `path` and `content` are the two fields every
 * producer sends; `language` is optional because an external operator's
 * files never carry one — the backend drops it (`_parse_files`,
 * app/agents/workers/external_contract.py) — and the code viewer renders
 * such a file as plain text. A `language` of the wrong type is still
 * refused: it would reach `.toLowerCase()`. */
function isArtifactFile(f: unknown): f is ArtifactFile {
  return (
    isRecord(f) &&
    isStr(f.path) &&
    isStr(f.content) &&
    isOptionalStr(f.language)
  );
}

export function isArtifactResponse(v: unknown): v is ArtifactResponse {
  if (!isRecord(v)) return false;
  const a = v.artifact;
  return a === null || a === undefined || isCodeArtifact(a);
}

/** Wallet page: `Object.entries(contracts)` is mapped into explorer links,
 * `asset_sac.slice(0, 8)`, and the string fields render as React children. */
export function isStellarNetworkInfo(v: unknown): v is StellarNetworkInfo {
  return (
    isRecord(v) &&
    isStr(v.network) &&
    isStr(v.network_passphrase) &&
    isStr(v.rpc_url) &&
    isStr(v.admin) &&
    isStr(v.asset) &&
    isStr(v.asset_sac) &&
    isRecord(v.contracts) &&
    Object.values(v.contracts).every(isStr)
  );
}

/** Authorize build: `xdr` is handed straight to the wallet
 * (`wallet.signXdr(xdr)`) as the transaction to sign, so a missing one
 * reaches Freighter as the literal "undefined" and comes back as an opaque
 * wallet error rather than the backend failure it is. `expires_at` tells a
 * buyer whose funds are held in escrow when they can reclaim them, so it is
 * a number when present — a string would print as a time that never was —
 * and absent is tolerated: the notice then says "once it expires". */
export function isAuthorizeBuild(v: unknown): v is AuthorizeBuild {
  return (
    isRecord(v) &&
    isStr(v.xdr) &&
    (v.expires_at === undefined || isNum(v.expires_at))
  );
}

/** Submit result: the plan card branches on `status !== "SUCCESS"` and links
 * `hash` into the explorer, where a missing one builds a URL the user cannot
 * tell from a real transaction. `return_value` is deliberately unchecked —
 * it is typed `unknown` and `bytesToHex` already accepts anything — while
 * `diagnostic`/`explorer` only join into a failure sentence, so they are
 * type-checked when present rather than required. */
export function isSubmitResult(v: unknown): v is SubmitResult {
  return (
    isRecord(v) &&
    isStr(v.hash) &&
    isStr(v.status) &&
    isOptionalStr(v.diagnostic) &&
    isOptionalStr(v.explorer)
  );
}

/** Register-agent build: `xdr` is handed straight to the wallet to sign, so a
 * missing one reaches Freighter as the literal "undefined" — the same contract
 * as `isAuthorizeBuild`, without the unread `expires_at`. */
export function isXdrResponse(v: unknown): v is XdrResponse {
  return isRecord(v) && isStr(v.xdr);
}

/** Agent-id availability check: the register form gates its submit button on
 * `available` and renders `reason`/`message`/`owner` as the inline hint. A
 * non-boolean `available` (the string "false") would read as free, so it is
 * checked strictly, while the optional strings only reject a wrong type. */
export function isAgentIdAvailability(v: unknown): v is AgentIdAvailability {
  return (
    isRecord(v) &&
    typeof v.available === "boolean" &&
    isOptionalStr(v.reason) &&
    isOptionalStr(v.message) &&
    isOptionalStr(v.owner)
  );
}

/** Agents sync: `synced` is rendered as a count ("indexed N agents"), so a
 * non-number would print `NaN`. */
export function isSyncResponse(v: unknown): v is SyncResponse {
  return isRecord(v) && isNum(v.synced);
}

/** A bind timestamp in either serialization the contract permits — an ISO
 * string or a Unix epoch (see `BindTimestamp`). Rejecting one of the two would
 * fail a valid binding over a serializer detail; what is ruled out is the
 * object/null that would render as "[object Object]" or "Invalid Date". */
const isBindTimestamp = (v: unknown): v is BindTimestamp =>
  isStr(v) || isNum(v);

/** Bind challenge: `message` is handed straight to the wallet as the payload
 * to sign, so a missing one reaches Freighter as the literal "undefined" and
 * comes back as an opaque wallet error rather than the backend failure it is —
 * the same contract as `isAuthorizeBuild`. `nonce` is additionally matched
 * against the message's own tail before signing, and `ttl_seconds` drives the
 * expiry countdown, where a non-number counts down as `NaN`. */
export function isBindChallenge(v: unknown): v is BindChallenge {
  return (
    isRecord(v) &&
    isStr(v.agent_id) &&
    isStr(v.nonce) &&
    isStr(v.message) &&
    isNum(v.ttl_seconds) &&
    isBindTimestamp(v.expires_at)
  );
}

/** A bound endpoint, from the bind POST and the binding GET alike.
 * `endpoint_url` and `owner` are rendered, and `replaced` is checked strictly
 * as a boolean because it picks the confirmation copy — the string "false"
 * would tell an owner their very first binding had overwritten a live route,
 * and a missing flag would hide that a real one was. */
export function isAgentBinding(v: unknown): v is AgentBinding {
  return (
    isRecord(v) &&
    isStr(v.agent_id) &&
    isStr(v.endpoint_url) &&
    isStr(v.owner) &&
    isBindTimestamp(v.bound_at) &&
    typeof v.replaced === "boolean"
  );
}

/** Endpoint preflight: the bind form gates its submit on `allowed` and renders
 * `rule`/`message` as the inline hint. A non-boolean `allowed` (the string
 * "false") would read as permitted and walk the owner into the 422 this check
 * exists to prevent, so it is checked strictly while the optional strings only
 * reject a wrong type — the same contract as `isAgentIdAvailability`. */
export function isEndpointCheck(v: unknown): v is EndpointCheck {
  return (
    isRecord(v) &&
    typeof v.allowed === "boolean" &&
    isOptionalStr(v.rule) &&
    isOptionalStr(v.message)
  );
}

/** The codes the bind error envelope is documented to carry. */
const BIND_ERROR_CODES = new Set<string>([
  "agent_not_found",
  "not_agent_owner",
  "challenge_invalid",
  "endpoint_not_allowed",
  "signature_malformed",
  "registry_unavailable",
  "binding_not_found",
  "rate_limited",
]);

/** Narrows an envelope's `error.code` to the bind contract. A guard rather
 * than a cast so a code the backend adds after this build resolves to "not one
 * of ours" and the caller takes its generic branch, instead of being handed a
 * value its exhaustive switch has no arm for. */
export function isBindErrorCode(v: unknown): v is BindErrorCode {
  return isStr(v) && BIND_ERROR_CODES.has(v);
}
