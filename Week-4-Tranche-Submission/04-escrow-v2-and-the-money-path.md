# 04 — Escrow v2 and the money path

**Why this is Week 4's topic.** Each bundle's fourth document takes the part of the week that most needs explaining. In Week 4 that is the payment escrow. Everything Deliverable D4 asks for that involves money — three settlements on Stellar Expert, and the dispute and partial-credit refund that D3 could not show in Week 3 — depended on replacing the v1 escrow, which could not move a buyer's funds. Escrow v2 was designed, tested, deployed to testnet and switched on this week, and on the day it went live the deployment settled payments, upheld two disputes, paid both credits, and proved partial delivery. This document explains what changed in the contract, what the backend does with it, what each live transaction proves, and what is still open on the money path.

## Why v1 could never settle

The Week-3 bundle reported that no paid run had ever settled on the deployment. The contracts repository's [escrow v2 interface document](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/blob/main/docs/escrow-v2-interface.md) sets out the cause — three independent faults in v1 ([`CBJPTMAP…25PI`](https://stellar.expert/explorer/testnet/contract/CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI)):

1. **`charge` needed a signature it never had.** It moved funds from the payer's account, which needs the payer's authorization, but only the settler signed a charge, so the network rejected every one with `Error(Auth, InvalidAction)` — QA's defect D-039, [contracts issue #3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3). Its unit tests had passed only because they mocked every authorization, which the network never does.
2. **The settler could not be changed.** It was written once at construction, while the deployment signs with a different key.
3. **It paid the wrong account.** `charge` paid the owner of the label the authorization carried, and the console authorizes a whole plan under one label — so an outside operator could never have been paid.

## What escrow v2 does

[Contracts #4](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/4), merged 2026-09-28; deployed to testnet on 2026-09-30 as [`CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4`](https://stellar.expert/explorer/testnet/contract/CCNO5TENCK3EK532I3OZLZ63323FEEULPAKJ74CUP3JZK3XQINRQ5VC4) and recorded in the address book by [contracts #6](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/pull/6).

| Entry point                                      | Who signs              | What it does                                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorize(payer, plan, max_amount, expires_at)` | the buyer              | Moves the plan's maximum from the buyer into the escrow in the same call, so the buyer's one signature covers both. The authorization is labelled with the plan id, and the backend refuses to run a plan against an authorization whose label, payer, cap or state does not match |
| `settle(settler, auth_id, job_id, payouts[])`    | the platform's settler | Pays each delivered step's **on-chain owner** from custody, writes a receipt per payout, returns the rest to the buyer and marks the authorization settled — all in one transaction. An empty `payouts` is a full release: nothing delivered, everything back to the buyer         |
| `reclaim(payer, auth_id)`                        | the buyer              | After the authorization expires unsettled, the buyer takes their funds back. Before expiry it is refused, because the settler may still owe operators for delivered work; whichever of `settle` and `reclaim` lands first wins                                                     |
| `set_settler(new_settler)`                       | the admin              | Rotates the settling key, which v1 could not do                                                                                                                                                                                                                                    |
| `version()`                                      | —                      | Returns `2`. v1's `charge` and `revoke` are removed, so an old caller gets a clear error rather than a half-working call                                                                                                                                                           |

The contracts now carry **47 tests, 32 of them for the escrow, and none uses `mock_all_auths`**: every authorization in them is checked the way the network checks it, which is exactly what v1's tests did not do. The compiled escrow is 13,151 bytes.

### On the backend

[BE #88](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/88) moved every paid run onto v2. Each run ends in one `settle` that pays only the steps that delivered and releases custody on every path that does not settle; only a confirmed transaction counts as evidence, and each run reports a settlement state — `settled`, `released`, `skipped`, `unconfirmed` or `failed` — instead of a bare success flag. An authorization is bound to the caller and the plan it was signed for, so one signature buys one task, and a reclaim transaction can be built for a buyer whose authorization expired (backend design records [ADR 0010](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0010-escrow-v2-custody-settlement.md) and [ADR 0011](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0011-execute-authorization-guard.md)). It also added a testnet lifecycle harness that drives a whole run — plan, authorize, execute, settle, seal, dispute — and writes every transaction it sees, read back from the network, into a redacted evidence file; the evidence below comes from it.

### In the console

[FE #89](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/89) makes the console's words match what v2 does: the Authorize step says the plan's maximum moves into escrow and the unused part comes back at settlement, checks the buyer's balance first, and shows the cap exactly. The receipt shows the settlement state and each step's payout with its Stellar Expert link, and offers Reclaim after expiry. The frontend pins the escrow id it expects ([FE #101](https://github.com/Bl0cksmiths/Orizon-Agents-FE-Stellar/pull/101)) and checks it against the contracts repository's address book in CI.

## What each live transaction proves

Every transaction below is on Stellar testnet, re-read from the network by the backend's evidence tool (21 of 21 in the team-run sheet, 11 of 11 in the acceptance-run sheet, all successful) and listed in the backend repository under [`docs/evidence/5.01/`](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/tree/main/docs/evidence/5.01). All were made on 2026-09-30 by the team's own keys, buying from agents the team operates, in native XLM.

### 1. A paid run settles — three times

| Run          | Authorization (buyer → escrow)                                                                                                     | Settlement (escrow → agent owner)                                                                                                  | Attestation seal                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1 — 0.01 XLM | [`36fae769…0a672fc7`](https://stellar.expert/explorer/testnet/tx/36fae7698f6c9f5fe1152458d41eb650353725be877d476846c308e10a672fc7) | [`f0674419…4a8d1235`](https://stellar.expert/explorer/testnet/tx/f0674419992bdf30cf730139e54e4cdd985e32b43ee15c91733e08424a8d1235) | [`f0b25fc5…9a7e2b5c`](https://stellar.expert/explorer/testnet/tx/f0b25fc59ee3c0d3e85cd9d3c92c3d18211411a1c578f8bb2bb58ea59a7e2b5c) |
| 2 — 0.2 XLM  | [`b59d49e2…a224cee1`](https://stellar.expert/explorer/testnet/tx/b59d49e2ddb31fe9216c3da271897f184cb25f77203c62032f90864ba224cee1) | [`19f3420d…04a83397`](https://stellar.expert/explorer/testnet/tx/19f3420ddb5232a8328c66ec57c1e34890d09a38350e172fdfd9ce8d04a83397) | [`a705d6a4…24f68b02`](https://stellar.expert/explorer/testnet/tx/a705d6a437469ac1783f372bf60279f5e90a143c4fcde9bcaad20a7f24f68b02) |
| 3 — 0.01 XLM | [`9f9e99c2…caeac655`](https://stellar.expert/explorer/testnet/tx/9f9e99c2aadcbf3b06cfe4738012dcc302fcee9358f092cfab4dc7f5caeac655) | [`785428bf…04ca554b`](https://stellar.expert/explorer/testnet/tx/785428bf6552208750b375703556c534da557dccd64df8d1db7f954a04ca554b) | [`efca274f…da37c0a8`](https://stellar.expert/explorer/testnet/tx/efca274fb83b50865cfc20dc40b6949e5abd1ae23ed3e7a7622e6c9eda37c0a8) |

**What it proves:** the buyer's own signature moves funds into the escrow, the platform's settler pays the agent's on-chain owner out of it, and the attestation seal ties the payout to the job — the flow v1 could never complete. Screenshot [21](./screenshots/21-settlement-tx-stellar-expert.png) shows the first settlement on Stellar Expert.

### 2. A failed run charges nothing

Three runs against a deliberately faulty test agent ([authorizations `f10d0f48…`](https://stellar.expert/explorer/testnet/tx/f10d0f48669d0f1de97d4ae5841f10c4fc27ab60747d1425ad77f16f3c34befb), [`55f23322…`](https://stellar.expert/explorer/testnet/tx/55f233224e00d96d4e56579fa8077f797c9c3f3c578638a80139eeb5c82c8949), [`6af4f1c3…`](https://stellar.expert/explorer/testnet/tx/6af4f1c3afd8ee50fa25e478897eab9a1563d743a3a112db26d0d560b03b4463)): each failed and nothing was charged, and each failure wrote a 20/100 rating that pushed the agent below the routing floor — the live exclusion in [`03`](./03-deliverable-D4-ecosystem-validation.md#d2--reputation-gated-routing-now-evidenced-live).

**What it proves:** a buyer does not pay for work that was not delivered, and the agent's reputation records it.

### 3. A dispute is upheld and the buyer is credited

| What                             | Transaction                                                                                                                        | Time (UTC) |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Dispute rating against the agent | [`b512135f…ee453a49`](https://stellar.expert/explorer/testnet/tx/b512135ffade2d6518fd8cf1628f20787846ed0e311750043b87723dee453a49) | 15:26      |
| Credit of 0.01 XLM to the buyer  | [`cb2c5792…78e1e25f`](https://stellar.expert/explorer/testnet/tx/cb2c57929006470f9f554989dd8071e8539d245df529df956693944a78e1e25f) | 15:25      |

The buyer of run 3 disputed its step; the platform upheld it, paid the credit from its signing key and wrote the `dispute` rating, and the agent's score fell from 7,004 to 6,999 bps. Screenshots [22](./screenshots/22-refund-tx-stellar-expert.png) and [23](./screenshots/23-dispute-rating-tx-stellar-expert.png).

**What it proves:** Deliverable D3 working on the deployment — the window, the dispute, the credit and the reputation consequence, each verifiable on Stellar Expert.

### 4. Partial delivery pays only what was delivered (5.01 AC5)

A two-step plan authorized 0.21 XLM ([`63454933…5a612e9f`](https://stellar.expert/explorer/testnet/tx/634549330a8188d28d32d6530e56ddb14298680de0d86d2568b91d3d5a612e9f)). The first agent delivered; the second hung, and was rated 20 ([`fc9a8268…c7f5212e`](https://stellar.expert/explorer/testnet/tx/fc9a8268b806831f863e70f9a8f103882baef87b8fd34b5b7dda95f7c5f7212e)). The settlement [`0ada0708…7adc556b`](https://stellar.expert/explorer/testnet/tx/0ada07084b5aa1c196fb8e45b15d3712dcbefaf320a315a84e8cf2ab7adc556b) paid **0.01 XLM** for the delivered step and returned **0.2 XLM** to the buyer in the same transaction, and the seal [`41a159ff…cc56fd64`](https://stellar.expert/explorer/testnet/tx/41a159ffd7d96265dd4dd0863c0211697d94e77d636c9b9e198d8cf3cc56fd64) carries only the delivered step's receipt ([BE #101](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/101); the reference agent gained an opt-in fault mode for this kind of test the same week, [agent #6](https://github.com/Bl0cksmiths/Orizon-Agents-Example-Agent-Stellar/pull/6)). Screenshot [27](./screenshots/27-partial-delivery-settle-tx-stellar-expert.png).

**What it proves:** per-operator settlement — the thing v1 could not do — including the case where one operator fails.

### 5. A dispute survives a backend restart (5.01 AC4)

A run settled at 17:48 ([`eb118e0b…d2a24b`](https://stellar.expert/explorer/testnet/tx/eb118e0b679aa8f88c680cf6095b9718f014ecf67344d6393d5d1f2eb4d2a24b)). The backend was then restarted — its uptime fell from 1,389 s to 163 s, and the task was gone from its memory (`GET /api/tasks/{id}` answered 404). At 18:03 the buyer opened a dispute against the settled step anyway, from the durable settlement record, and it was upheld and credited: rating [`60bc5249…ba730e`](https://stellar.expert/explorer/testnet/tx/60bc5249af542ea005ea62573800b0bd48a101eeef6d748f1884f807c1ba730e), credit [`01c3175a…c1efa5be`](https://stellar.expert/explorer/testnet/tx/01c3175a881658808e15dc9a284439f2fbce4091a3566bfe3894ecedc1efa5be) ([BE #100](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/100), [#102](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/102)). Screenshot [26](./screenshots/26-restart-dispute-refund-tx-stellar-expert.png).

**What it proves:** a buyer's 24-hour window is not a promise that ends at the next restart, which on a free-tier host happens whenever the service idles.

## What changed from the SOW, stated plainly

The public evidence index carries each of these under its Disclosures; they are repeated here because they are about the money path.

- **The escrow now holds the buyer's authorized amount.** SOW §3.8 says the platform never takes custody of funds and that the settler moves USDC directly from the buyer to the agent's owner. That design is what could not work (D-039). Escrow v2 takes custody at `authorize` and pays out or returns everything at `settle` or `reclaim` — the change that made settlement possible.
- **The settler can now be rotated, but one platform key still settles.** v2 adds `set_settler`; it has not been used. A single team-held key — the platform's production key, which also writes ratings and seals — signs every settlement, with no multi-signature or threshold control (SOW §3.8 already says the settler is not permissionless).
- **A dispute credit is a separate transfer from the platform's own funds.** It is not taken back from the agent's owner and not drawn from the escrow; the platform, not an independent arbiter, decides whether a dispute is upheld (backend [ADR 0002](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0002-partial-credit-refund.md) and [ADR 0008](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/blob/main/docs/decisions/0008-refund-execution.md)). The share credited is a setting; it is 100% of the disputed step's charge on the deployment today.
- **Testnet settles in native XLM.** The escrow's payment asset on the deployment is the native XLM asset contract, and the app labels testnet amounts XLM.

## Still open on the money path

Rie's register (see [`01`](./01-tasks-completed.md#defects-logged-this-week--d-077--d-092-16)) has three open items that bear on payments rather than on the evidence index, quoted as she titled them:

- **D-077** — "No paid workflow can complete on the deploy: every bound agent with an on-chain owner has a dead endpoint." The team's runs used agents with live endpoints; the outside agents bound so far do not answer, so no outside operator can be paid yet. ([backend #104](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/104))
- **D-083** — "The AttestationRegistry never extends a TTL: the seals and the registry archive on 2026-10-07." ([backend #107](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/107))
- **D-084** — "The planner routes to an agent its own readiness probe reports unreachable, and the buyer pays the fees." ([backend #108](https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/issues/108))

Each is a public issue, and the fixes will be reported in the next bundle.
