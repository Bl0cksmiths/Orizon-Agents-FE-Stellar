# 04 — Escrow v2 and the money path

**Why this is Week 4's topic.** Each bundle's fourth document takes the part of the week that most needs explaining. In Week 4 that is the payment escrow. Everything Deliverable D4 asks for that involves money — three settlements on Stellar Expert, and the dispute and partial-credit refund that D3 could not show in Week 3 — depended on replacing the v1 escrow, which could not move a buyer's funds. Escrow v2 was designed, tested, deployed to testnet and switched on this week, and on the day it went live the deployment settled payments, upheld two disputes, paid both credits, and proved partial delivery. This document explains what changed in the contract, what the backend does with it, what each live transaction proves, and what is still open on the money path.

## Why v1 could never settle

The Week-3 bundle reported that no paid run had ever settled on the deployment. The contracts repository's [escrow v2 interface document](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/blob/main/docs/escrow-v2-interface.md) sets out the cause — three independent faults in v1 ([`CBJPTMAP…25PI`](https://stellar.expert/explorer/testnet/contract/CBJPTMAPMGODGZCZ2IMEQSRUX3WGUXNMKDTNN2KMJ3NFGYZ5OJ5525PI)):

1. **`charge` needed a signature it never had.** It moved funds from the payer's account, which needs the payer's authorization, but only the settler signed a charge, so the network rejected every one with `Error(Auth, InvalidAction)` — QA's defect D-039, [contracts issue #3](https://github.com/Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar/issues/3). Its unit tests had passed only because they mocked every authorization, which the network never does.
2. **The settler could not be changed.** It was written once at construction, while the deployment signs with a different key.
3. **It paid the wrong account.** `charge` paid the owner of the label the authorization carried, and the console authorizes a whole plan under one label — so an outside operator could never have been paid.
