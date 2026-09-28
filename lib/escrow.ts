/**
 * The buyer's side of PaymentEscrow v2, in one place.
 *
 * v2 takes CUSTODY at `authorize`: the one signature the buyer gives moves the
 * plan's maximum from their wallet into the escrow contract, in that same
 * transaction. `settle` then pays each delivered step's operator out of it and
 * returns the unspent remainder to the buyer; `reclaim` lets the buyer take an
 * authorization back that was never settled, once it has expired. v1 did none
 * of this — its `authorize` recorded a cap and moved nothing — so every number
 * and sentence the console attaches to authorizing is decided here, against
 * the frozen v2 interface (contracts repo `docs/escrow-v2-interface.md`).
 */

/**
 * The `agent_id` every console authorization is signed under.
 *
 * Only a LABEL since escrow v2. v1 paid `owner_of(auth.agent_id)` at charge
 * time, so this symbol decided who got paid — and because `orizon_batch` is
 * owned by the settler, no external operator ever could be. v2 names the
 * agent on each payout at `settle` instead, and keeps this argument (same
 * signature as v1, so every transaction builder still works) purely to tag
 * the authorization in its `authd` event. Changing it changes no payment.
 */
export const ESCROW_BATCH_LABEL = "orizon_batch";

/**
 * How long a signed authorization stays settleable, in seconds — the
 * `ttl_seconds` sent to `POST /stellar/build/authorize`, which stamps
 * `expires_at = now + ttl` into the authorization.
 *
 * Escrow v2 turns this one number into a trade-off between the two people the
 * custody protects, because it refuses `settle` once `expires_at` has passed
 * (`Expired`) and refuses the buyer's `reclaim` until it has (`Locked`):
 *
 * - Too SHORT, and a slow run — a cold agent endpoint, an LLM retry, a
 *   settlement queued behind the seal — finishes after expiry. The operators
 *   who delivered can then never be paid for it, and the whole maximum sits in
 *   escrow until the buyer reclaims it.
 * - Too LONG, and a run that never settles (a backend restart mid-run, a
 *   settlement that failed) keeps the buyer's funds locked for that long
 *   before `reclaim` is allowed to return them.
 *
 * The backend accepts 30–3600 s (`AuthorizeReq.ttl_seconds`). 1800 s, half
 * an hour, is well past any run the console has timed while keeping a stuck
 * authorization recoverable the same afternoon. v1's 600 s was chosen when an
 * expiry only lapsed a cap; under custody it is also the buyer's lock-up, so
 * it is set deliberately and in one place. The backend lane recommends the
 * final value; change it here and nowhere else.
 */
export const AUTHORIZE_TTL_SECONDS = 1800;
