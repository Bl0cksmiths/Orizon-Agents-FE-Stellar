# 01 — Tasks completed, Week 2

Both approved team members' work for the week. **Dan (lead engineer):** Epic 2 (the external agent execution path) shipped end to end, Epic 3 (reputation-gated routing, Deliverable D2) completed and hardened, and the one open Week-2 bug (BLO-121) fixed. **Rie (PM + QA):** the week's deliverables QA-tested against the live testnet deployment, 14 defects logged, Week-1 QA closed, and the programme cadence kept. Statuses are as recorded in Linear.

## Danielle (Dan) — lead engineer

Every story in this part is **Done** in Linear and merged to `main` unless noted.

### Epic 2 — External Agent Execution Path ([BLO-6](https://linear.app/bl0cksmiths/issue/BLO-6), 30 pts) — ✅ Done

Until this week an externally registered agent could be listed but never do work: execution only knew the twelve built-in workers. Epic 2 makes "anyone can register an agent" economically real.

| Story | Ticket                                                | Pts | What shipped                                                                                                                                                                                                                                                                                                    | PRs                                                                                                                                                              |
| ----- | ----------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.01  | [BLO-18](https://linear.app/bl0cksmiths/issue/BLO-18) | 6   | An operator binds an execution URL to their on-chain agent id, proving ownership with a **wallet signature** (no account, password or API key). Bindings persist in Postgres when a database is configured, reload after restarts, can be replaced, and can be revoked with a separately signed unbind message. | [BE #43](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/43), [FE #50](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/50)             |
| 2.02  | [BLO-19](https://linear.app/bl0cksmiths/issue/BLO-19) | 8   | The orchestrator dispatches a workflow step to the operator's endpoint: every request **signed** with a dedicated dispatch key (published as `dispatch_signer`), unsafe URLs refused, DNS pinned against rebinding, per-step deadline and response-size cap.                                                    | [BE #45](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/45)                                                                                        |
| 2.03  | [BLO-20](https://linear.app/bl0cksmiths/issue/BLO-20) | 3   | Failure semantics: a step that times out or returns unusable output is **not charged**, is recorded, and counts against the agent's reputation — while an agent that was never called is never blamed (ADR 0005).                                                                                               | [BE #47](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/47)                                                                                        |
| 2.04  | [BLO-21](https://linear.app/bl0cksmiths/issue/BLO-21) | 4   | A copyable **reference agent** in its own public repo, runnable from its README: verifies Orizon's signed dispatches, rejects replays and late requests, returns the published response contract.                                                                                                               | [BE #48](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/48), [Agent #1](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/1) |
| 2.05  | [BLO-22](https://linear.app/bl0cksmiths/issue/BLO-22) | 3   | Endpoint binding built into the registration flow, so listing an agent and wiring it up is one flow; both signatures are explained before the first wallet prompt.                                                                                                                                              | [FE #51](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/51)                                                                                        |
| 2.06  | [BLO-46](https://linear.app/bl0cksmiths/issue/BLO-46) | 6   | Operator dashboard — one page per wallet showing its agents, earnings and reputation, fed by a new settlement-evidence endpoint; each charge links to its transaction on Stellar Expert.                                                                                                                        | [FE #52](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/52), [BE #49](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/49)             |

**Epic 2 hardening** — [BE #44](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/44), [BE #57](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/57), [FE #60](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/60):

- Two kill switches that stop external dispatch without a redeploy.
- Fixes for crashes, rating mistakes and planner-prompt injection found in review.
- Every paid run is rated independently of settlement, so each delivery lands as reputation evidence.
- Transaction hashes are format-checked before they are shown or linked; rebind coverage and transaction links on the dashboard.

### Epic 3 — Reputation-Gated Routing, Deliverable D2 ([BLO-7](https://linear.app/bl0cksmiths/issue/BLO-7), 25 pts this week) — ✅ Done

Before a buyer pays, the plan reads each agent's on-chain reputation, applies a minimum-reputation floor, and shows the buyer what the floor did. Story 3.01 (the floor on the curated demo path) closed in Week 1 and was strengthened this week.

| Story | Ticket                                                  | Pts | What shipped                                                                                                                                                                                                                              | PRs                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.02  | [BLO-24](https://linear.app/bl0cksmiths/issue/BLO-24)   | 5   | Every plan carries `notices` (what the floor did and why, from a closed set: below floor, no endpoint bound, floor relaxed) and the `floor_bps` it applied. Agents the planner simply didn't pick are deliberately not listed (ADR 0006). | [BE #51](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/51), [FE #54](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/54)                                                                                      |
| 3.03  | [BLO-25](https://linear.app/bl0cksmiths/issue/BLO-25)   | 3   | A failed on-chain reputation read is visible: each affected agent is flagged as served an estimate, the plan says so (`reputation_degraded`), and an outage logs one warning per batch.                                                   | [BE #52](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/52)                                                                                                                                                                 |
| 3.04  | [BLO-26](https://linear.app/bl0cksmiths/issue/BLO-26)   | 6   | The plan card shows the trust signal **before** payment: per-step reputation badge with its source, the floor applied, a collapsible list of floor actions with reasons, a warning above Authorize when reputation couldn't be read.      | [FE #56](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/56)                                                                                                                                                                 |
| 3.05  | [BLO-27](https://linear.app/bl0cksmiths/issue/BLO-27)   | 4   | The marketplace shows each agent's standing: floor stated once, on-chain agents marked apart from built-in ones, below-floor and not-yet-operational marks, a page-level notice when reads fail, a "hireable" filter.                     | [BE #56](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/56), [FE #59](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/59)                                                                                      |
| 3.06  | [BLO-28](https://linear.app/bl0cksmiths/issue/BLO-28)   | 5   | Cold-start guarantee: a brand-new agent's starting estimate clears the floor (5677 vs 5500 bps). Locked by a test, announced at startup, and warned about by name if config ever breaks it.                                               | [BE #56](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/56)                                                                                                                                                                 |
| 3.07  | [BLO-111](https://linear.app/bl0cksmiths/issue/BLO-111) | 2   | Contract addresses can't drift silently: the contracts repo tracks its deployed address book, and backend and frontend checks fail loudly, naming the mismatch.                                                                           | [SC #2](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/2), [BE #56](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/56), [FE #59](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/59) |

**Epic 3 hardening** — [BE #58](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/58), [FE #61](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/61):

- **Closed a hole in the floor:** the planner could name an excluded agent after planning and it would be run and paid. A step now survives only if its agent was actually offered to the planner.
- **Fixed the starvation fallback:** it could drop agents that had cleared the floor; it now keeps them all and fills only the gap.
- **Richer plan steps:** lower-bound score, rating count, dispute rate and a read-failed flag, all shown on the plan-card badge.
- **Honest screens:** amounts show the network's real currency (XLM on testnet), invented "prior" scores removed from the marketplace and leaderboard, delisted agents no longer shown as hireable.
- **Frontend CI back to green** (a product bug, fixed in the product); contract-address checks now run daily, and the 6-hourly smoke test compares the live deployment's contract ids with the canonical address book.

### Bug fixed — BLO-121 ([BLO-121](https://linear.app/bl0cksmiths/issue/BLO-121)) — ✅ Done

When the planning LLM failed, a free-form plan request returned **502**. It now returns a small fallback plan built only from agents that passed the routing checks, flagged `planner_fallback: true`, and the plan card tells the buyer and offers "Ask the planner again". [BE #59](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/59), [FE #62](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/62).

Shipped alongside it in BE #59:

- **Ratings made observable:** `/readiness` reports whether this deployment can write ratings (is its signer the ledger's scorer?), a startup line says the same, and a paid run that rates nothing now says why on its trace.
- **Secrets kept out of logs:** keys, passwords, seeds and the database URL are masked in every log line, including tracebacks and the LLM library's own error logs.

### Production hardening

- [BE #41](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/41) — authentication pinned on the payment routes; consistent input guards.
- [FE #48](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/48) — accessibility fixes, skills-input UX, a guard on the live event stream.

### Design records written this week (backend repo, `docs/decisions/`)

| ADR  | Title                              | Added      |
| ---- | ---------------------------------- | ---------- |
| 0003 | Operator endpoint binding          | 2026-09-15 |
| 0004 | External dispatch hardening        | 2026-09-16 |
| 0005 | External failure semantics         | 2026-09-16 |
| 0006 | Floor visibility (the notices API) | 2026-09-16 |

Plus the operator dispatch-verification guide (`docs/operators/verifying-a-dispatch.md`) and the reputation guide (`docs/reputation.md`).

## Rieselle (Rie) — project management + QA

Rie's week is QA against the **live testnet deployment**, the programme cadence, and the evidence. Her tests and QA documents are in the public UAT repo — [UAT PR #3](https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/pull/3) (`uat` → `main`, merged 2026-09-17): **141 commits by `rie-hash14`** (137 authored + 4 merges), +4,217 lines across 25 files.

### QA stories — Epic 6 ([BLO-10](https://linear.app/bl0cksmiths/issue/BLO-10))

| Story | Ticket | Pts | Status | What was tested and delivered |
| ----- | ------ | --- | ------ | ----------------------------- |
| 6.05 — External agent execution path, end to end on testnet | [BLO-128](https://linear.app/bl0cksmiths/issue/BLO-128) | 10 | ✅ Done 2026-09-18 | Registration → endpoint binding → signed dispatch → signature verification → failure scenarios → ratings → restart, against the live deployment, using a **test operator endpoint she built** that verifies Orizon's signed dispatches (`tools/operator-endpoint/`). 5 live test cases passing. New spec `tests/external-dispatch.spec.ts`; evidence report `docs/uat/evidence/6.05-external-dispatch.md`. |
| 6.06 — Operator surfaces: binding flow, reference agent, dashboard | [BLO-129](https://linear.app/bl0cksmiths/issue/BLO-129) | 8 | ✅ Done 2026-09-18 | Walked the reference agent from a fresh clone (37/37 tests pass); the registration page explains both signatures before the first wallet prompt; plaintext, private and loopback endpoint URLs refused before signing; dashboard accurate across wallet states; rebind page; phone-width layout. New spec `tests/operator-surfaces.spec.ts`, evidence report `docs/uat/evidence/6.06-operator-surfaces.md`, and a wallet + phone checklist. |
| 6.01 — Registration across wallets and browsers (Week-1 QA story) | [BLO-40](https://linear.app/bl0cksmiths/issue/BLO-40) | 10 | ✅ Closed 2026-09-18, with all six sub-tasks ([BLO-122](https://linear.app/bl0cksmiths/issue/BLO-122) → [BLO-127](https://linear.app/bl0cksmiths/issue/BLO-127)) | Registration end to end, the wallet + browser matrix, validation and rate-limit recovery, on-chain provenance / delist / price in the marketplace, operator agent management, evidence capture. |

Also delivered: a ~1,000-line Playwright spec for the reputation floor (`tests/reputation-floor.spec.ts`, story 6.02), run against the live deployment.

### Defects logged — D-036 → D-049 (14 defects)

Each defect is recorded in `docs/uat/defects.md` with its severity, reproduction steps and traceability to the test plan — covering the reference agent, endpoint binding, the operator dashboard and wallet support — and handed to engineering with the evidence.

### Programme cadence and evidence (Epic 7)

| Story | Ticket | Status |
| ----- | ------ | ------ |
| 7.02 — Week-2 public build post on X | [BLO-131](https://linear.app/bl0cksmiths/issue/BLO-131) | ✅ Done — [post](https://x.com/OrizonAgents402/status/2101103657043255772) published 2026-09-19 (~08:00 PHT) |
| 7.01 — Week-2 evidence bundle | [BLO-130](https://linear.app/bl0cksmiths/issue/BLO-130) | ✅ Submitted through the programme's Google Form |

The UAT test plan, traceability matrix, sign-off report and runbook were updated for the Week-2 scope in the same PR.

## Totals

**Dan**

- **55 story points of engineering completed** in Week 2 (30 Epic 2 + 25 Epic 3), plus BLO-121 (unestimated bug).
- **1,080 authored commits** dated 14–18 Sep across five public repos — breakdown and the multi-contributor rule in [`02-commit-visibility.md`](./02-commit-visibility.md).
- **Tests on `main` at week's end:** backend 1,534 passing (91.2% coverage); frontend 981 unit + 105 end-to-end passing, with accessibility (axe WCAG 2.0/2.1 AA) and phone-width checks on every changed page.

**Rie**

- **18 story points of Week-2 QA done** (6.05 + 6.06), plus **10 closed from Week 1** (6.01 and its six sub-tasks).
- **14 defects logged** (D-036 → D-049) against the live deployment.
- **137 authored commits** (+ 4 merges) in the public UAT repo — see [`02-commit-visibility.md`](./02-commit-visibility.md).

**Together:** **27 pull requests** merged across five public repos — see [`05-pull-requests.md`](./05-pull-requests.md).
