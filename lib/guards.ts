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

/** Backend `AgentStatus` literal (app/schemas.py). Checked as a set, not just
 * as a string, because the status indexes a tone map — an unlisted value
 * silently renders an unstyled badge. */
const AGENT_STATUSES = new Set(["online", "idle", "offline"]);

/** Agents table + reputation leaderboard: `price.toFixed(3)`,
 * `runs.toLocaleString()`, `skills.map`, `rep * 2000`, and `status` keys a
 * tone map. Mirrors backend `Agent` (`app/schemas.py`); `real` has a server
 * default and is only used as a truthiness flag, so it stays unchecked.
 * `owner` is the registering wallet (on-chain indexed agents only, null for
 * seeded) and feeds the "my agents" wallet comparison, so a wrong type is
 * rejected while absent/null is tolerated. */
export function isAgentList(v: unknown): v is Agent[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        isRecord(a) &&
        isStr(a.id) &&
        isStr(a.name) &&
        isStrArray(a.skills) &&
        isNum(a.price) &&
        isNum(a.rep) &&
        isNum(a.runs) &&
        isOptionalStr(a.owner) &&
        // Optional and NOT set-checked, unlike `status` below. `status` picks
        // a tone from a closed map, so an unlisted value renders untoned; a
        // provenance value we do not recognise still renders as "not seeded",
        // which is the safe reading, and rejecting the whole registry over one
        // would empty the marketplace.
        isOptionalStr(a.source) &&
        // Tri-state: true, false, or absent/null meaning "does not apply".
        isOptionalBool(a.bound) &&
        isStr(a.status) &&
        AGENT_STATUSES.has(a.status),
    )
  );
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
        TASK_STATUSES.has(t.status),
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
    TRACE_LEVELS.has(v.level)
  );
}

/** Trace history: the trace view `.map`s it into rows, and the polling
 * fallback slices its tail by index — a non-array (a proxy error page, an
 * error envelope) silently reads as "no lines yet" and pins the page on
 * "awaiting next step…" forever. */
export function isTraceLineList(v: unknown): v is TraceLine[] {
  return Array.isArray(v) && v.every(isTraceLine);
}

/** Plan panel: `total_usdc`/`total_eta` get `.toFixed`, steps are mapped with
 * `.toFixed` on each estimate, and every step renders `rationale` as a React
 * child — a non-string (a dict from a half-rolled backend) throws "Objects are
 * not valid as a React child". Required on backend `PlanStep`
 * (`app/schemas.py`); `agent_name`/`rep_bps`/`rep_source` are optional there
 * and already have render-time fallbacks, so they stay unchecked.
 *
 * `notices` and the floor fields on steps (story 3.02) are additive: absent
 * is fine (a backend predating them), but a present value is type-checked —
 * `degraded` because a truthy non-boolean would badge a healthy step as
 * below-floor, `kind` because it indexes the notice tone map. */
export function isDecomposeResponse(v: unknown): v is DecomposeResponse {
  return (
    isRecord(v) &&
    isStr(v.plan_id) &&
    isNum(v.total_usdc) &&
    isNum(v.total_eta) &&
    Array.isArray(v.steps) &&
    v.steps.every(
      (s) =>
        isRecord(s) &&
        isStr(s.agent_id) &&
        isStr(s.rationale) &&
        isNum(s.est_price_usdc) &&
        isNum(s.est_eta_seconds) &&
        isOptionalStr(s.substituted_for) &&
        isOptionalBool(s.degraded),
    ) &&
    (v.notices == null ||
      (Array.isArray(v.notices) && v.notices.every(isPlanFloorNotice))) &&
    // Both optional, because a plan card must keep rendering against a backend
    // that predates them. `floor_bps` is checked as a number rather than
    // defaulted here: a floor that arrives as a string would print "NaN" in
    // the threshold the buyer is being asked to trust.
    isOptionalNum(v.floor_bps) &&
    isOptionalBool(v.reputation_degraded)
  );
}

/** Backend `PlanFloorNotice.kind` literal (`app/schemas.py`). Checked as a
 * set because the kind picks the notice's tone and label on the plan card —
 * an unlisted value would render an unstyled, unexplained row. */
const FLOOR_NOTICE_KINDS = new Set(["excluded", "substituted", "degraded"]);

function isPlanFloorNotice(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.kind) &&
    FLOOR_NOTICE_KINDS.has(v.kind) &&
    isStr(v.agent_id) &&
    isStr(v.reason) &&
    isOptionalStr(v.agent_name) &&
    isOptionalStr(v.replacement_id) &&
    isOptionalStr(v.replacement_name) &&
    // Optional, and deliberately NOT set-checked the way `kind` is. `kind`
    // picks the row's tone, so an unlisted value renders unstyled; an
    // unrecognised `reason_code` still has the prose `reason` beside it, so
    // rejecting the whole payload over one would trade a rendered plan for no
    // plan at all.
    isOptionalStr(v.reason_code) &&
    isOptionalNum(v.lower_bound_bps) &&
    isOptionalNum(v.floor_bps)
  );
}

/** Backend `ReputationInfo.source` literal (`app/routers/stellar.py`). The
 * leaderboard branches on it to decide whether a row shows on-chain evidence
 * or the seeded prior, so an unlisted value would present prior data as
 * measured. */
const REPUTATION_SOURCES = new Set(["onchain", "prior"]);

/** One agent's reputation, served on its own by
 * GET /api/stellar/reputation/{agent_id} and as every value of the batch
 * below: the numbers feed bps→score math, evidence sums (`weight`), counts
 * and dispute rates. `disputed` is also a sort comparator
 * (`sortValue.disputes`) — a non-number makes every comparison NaN and
 * silently scrambles row order — and `avg_bps` is the unsmoothed on-chain
 * mean. All required on the backend model.
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
    REPUTATION_SOURCES.has(v.source) &&
    isOptionalBool(v.degraded)
  );
}

/** Reputation pages: `reputations` values feed the math above and `floor_bps`
 * feeds the floor badge. */
export function isReputationBatch(v: unknown): v is ReputationBatch {
  return (
    isRecord(v) &&
    isNum(v.floor_bps) &&
    isNum(v.prior_bps) &&
    isRecord(v.reputations) &&
    Object.values(v.reputations).every(isReputationInfo)
  );
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
 * verbatim. `files[].language` is therefore required here — the code viewer
 * calls `language.toLowerCase()` and a missing one takes out the whole Trace
 * route through the error boundary. `entry` and `summary` are required on the
 * producing model (`CodeArtifact`, app/agents/workers/code_gen.py) but both
 * have working render-time fallbacks, so they are only type-checked when
 * present rather than made mandatory. */
function isCodeArtifact(v: unknown): v is CodeArtifact {
  return (
    isRecord(v) &&
    isStr(v.title) &&
    isStr(v.preview_html) &&
    isOptionalStr(v.entry) &&
    isOptionalStr(v.summary) &&
    Array.isArray(v.files) &&
    v.files.every(
      (f) =>
        isRecord(f) && isStr(f.path) && isStr(f.content) && isStr(f.language),
    )
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
 * wallet error rather than the backend failure it is. `expires_at` is
 * returned but never read by the UI, so it stays unchecked. */
export function isAuthorizeBuild(v: unknown): v is AuthorizeBuild {
  return isRecord(v) && isStr(v.xdr);
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
