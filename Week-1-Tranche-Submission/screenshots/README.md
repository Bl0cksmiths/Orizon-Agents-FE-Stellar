# Screenshots — evidence manifest

**Status: ✅ all 9 captured (2026-09-12).** Each is a full-page PNG of a public
page; the underlying artifact is also linked by URL below so a reviewer can
verify it live.

## Manifest

| # | Filename | What it shows | Captured | Source URL |
|---|----------|---------------|:--------:|------------|
| 1 | `01-registration-tx-stellar-expert.png` | Story-1.05 permissionless registration tx, live on testnet | ✅ 106 KB | https://stellar.expert/explorer/testnet/tx/416bea4f83e5afd9fc80e38c75ba4b1050031a2d590b0fe6232aa00d6a846393 |
| 2 | `02-refund-tx-stellar-expert.png` | 4.01 partial-credit refund tx (Successful, ledger 4635132) | ✅ 102 KB | https://stellar.expert/explorer/testnet/tx/9b8ffaa44b2b966e4c3f1ab581f4203a30d282901ba3b231a578e46d8f919a68 |
| 3 | `03-registrant-account-stellar-expert.png` | The registrant/buyer account on testnet | ✅ 198 KB | https://stellar.expert/explorer/testnet/account/GBI2I3WLMP2Q6L26G7CBKRPP5WJ6G3GGYJHWALOJ7D6EBRGL5OZAADBH |
| 4 | `04-be-pr-40.png` | Backend PR #40 (4.01 refund + compliance records) | ✅ 330 KB | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pull/40 |
| 5 | `05-uat-repo-rie-commits.png` | Rie's 99 commits in the public UAT repo | ✅ 370 KB | https://github.com/Bl0cksmiths/Orizon-Agents-UAT-Stellar/commits |
| 6 | `06-be-pull-requests.png` | Backend PR list (Week-1 merges) | ✅ 347 KB | https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar/pulls?q=is%3Apr |
| 7 | `07-orizons-home.png` | The live dApp home | ✅ 448 KB | https://orizons.xyz |
| 8 | `08-orizons-agents.png` | The live marketplace / agents page | ✅ 961 KB | https://orizons.xyz/app/agents |
| 9 | `09-dan-registration-tx-stellar-expert.png` | The operator-wallet registration `register(dan_w1_probe)` — Successful, ledger 4636035 | ✅ 105 KB | https://stellar.expert/explorer/testnet/tx/f07aab3e17afeca65c30719962bba5cc0f97bf58e22f659e429c3e8b44198a78 |

> Note on #7–#8: `orizons.xyz` currently serves the **mainnet** build (the
> testnet dashboard flip, story 1.11, is a pending Render/Vercel step). For a
> *testnet* screenshot of the dApp, recapture the testnet Vercel alias once the
> flip is done. The on-chain evidence (#1–#3) is unambiguously testnet.

## Reproduce

```bash
node Week-1-Tranche-Submission/screenshots/capture-screenshots.mjs
```

Requires Chromium's system deps (one-time, needs sudo in a real terminal):
`sudo apt-get install -y libnspr4 libnss3 libasound2t64` — or `npx playwright install-deps chromium`.
