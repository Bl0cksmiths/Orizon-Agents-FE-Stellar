# Evidence index: what to change after the deploy

`content/evidence/index.json` is a snapshot of 2026-09-29, taken before anything
from Epic 5 was deployed. It says so honestly: pages that are not live are named
in notes, not linked, and every metric that depends on them is `not_met`. Once
the stack deploys, those rows are out of date the other way. This is the list of
exactly what to change, and how to check each change before committing it.

Change nothing here until its check passes. An index that links a page that
still answers 404 is worse than one that says the page is coming.

## Metric m03 is removed: keep it out

SOW §6.3 metric m03 ("Workflows routed to external agents & settled on
Testnet", target ≥ 3) was removed from the sprint's requirements by the team
lead on 2026-09-30. The index has no m03 row; it lists m03 once under the
top-level `removed_metrics`, and the page states that in one line under
Disclosures. The headline counts only the rows shown ("7 of 10 metrics met").

The backend's generator, `scripts/sow_metrics`, does not know this. It always
produces all eleven rows, each `met` or `not_met`. When you merge its output
into `content/evidence/index.json`:

- **Drop the m03 row it produces.** Do not paste it back into `metrics`.
- Keep the `removed_metrics` entry for m03 exactly as it is.
- Say so in `snapshot.method`, as the current text does.

The validator enforces this: every §6.3 id must be either a row in `metrics`
or an entry in `removed_metrics`, never both and never neither. A pasted m03
row fails `npm run evidence:check` with
`removed_metrics[0].id "m03" is still in metrics; a removed metric has no row`,
and dropping the entry instead fails with `m03 is left out with no
removed_metrics entry`. Neither is fixed by editing the validator.

## 0. Before you start

Two deploys unlock different rows. Check which have happened.

```sh
# Frontend (Vercel, from main): the three pages that are 404 today.
for p in /guide/list-your-agent /demo /litepaper /evidence; do
  curl -s -m 30 -o /dev/null -w "$p %{http_code}\n" "https://orizons.xyz$p"
done

# Backend (Render, deployed by hand): the adoption counter is the marker of
# a post-2026-09-25 build. 404 means the old build is still live.
curl -s -m 90 -o /dev/null -w "adoption %{http_code}\n" \
  https://orizon-agents-be-stellar.onrender.com/api/ecosystem/adoption
curl -s -m 90 https://orizon-agents-be-stellar.onrender.com/readiness | jq .
```

For every change below, also set `snapshot.as_of` to the day you re-checked,
and keep `snapshot.method` true.

## 1. After the frontend deploys (Vercel, from main)

### `6.1-D4-b`: the integration guide

Unlocked when `https://orizons.xyz/guide/list-your-agent` answers 200.

- `status`: `"partial"` to `"present"`.
- `note`: drop the sentences saying #97 is open and the page shows 'not found'.
  Say the guide is public at orizons.xyz/guide/list-your-agent, with every
  sample checked.
- `links`: add first
  `{ "label": "The 'List your agent on Orizon' guide on orizons.xyz", "url": "https://orizons.xyz/guide/list-your-agent", "kind": "page" }`.
  Change the #97 label from `(open)` to `(merged)` and give it the merge `date`.

### `m09`: guide published

Same check as D4-b.

- `achieved`: `"No: the guide page is not live yet"` to `"Yes"`.
- `status`: `"not_met"` to `"met"`.
- `reason`: delete it. It is optional on a met metric, and the current one says
  404.
- `links`: add the same guide page link first. Keep #97, marked `(merged)`.

### `6.1-D4-e`: the litepaper

Unlocked when `https://orizons.xyz/litepaper` answers 200.

- `status`: `"partial"` to `"present"`.
- `note`: drop "is in frontend pull request #97, which is open, so the page
  shows 'not found' today. It goes live when…" and "Until then, the PDF and the
  updated §6 are linked here on GitHub." Keep the formats sentence.
- `links`: add first
  `{ "label": "The Orizon Agents litepaper (v0.5) on orizons.xyz", "url": "https://orizons.xyz/litepaper", "kind": "page" }`.
  This must be the only orizons.xyz address the item gives, because
  `e2e/litepaper.spec.ts` checks it.
- **Re-pin the two GitHub links.** Both are pinned to
  `fc9fa43a38fd39bc970a59b58f84032120a21ba6` (the audit-fix integration
  commit holding the corrected book). Once the audit-fix PR merges, replace
  that sha in both URLs and change `fc9fa43` in both labels to the merge
  commit on main:

  ```sh
  git fetch origin && git rev-parse origin/main
  grep -n fc9fa43 content/evidence/index.json   # 4 hits: 2 URLs, 2 labels
  ```

- #97 label: add `(merged)` and its `date`.

### `6.1-D4-a`: the demo video

Unlocked **in part** when `https://orizons.xyz/demo` answers 200. The item stays
`"missing"` until the video itself is published.

- `note`: replace "in frontend pull request #97, which is open and not
  deployed, so orizons.xyz/demo shows 'not found' until it merges" with the page
  being live and still waiting for the video.
- `links`: add
  `{ "label": "The demo page on orizons.xyz, where the video will be published", "url": "https://orizons.xyz/demo", "kind": "page" }`.
  #97: `(open)` to `(merged)` plus `date`.
- Only when the video is up: `status` to `"present"`, and add the video link
  (`kind: "video"`; the live checker verifies it through YouTube oEmbed).

### `m10`: demo video published

```sh
curl -s https://orizons.xyz/demo | grep -o 'data-demo="[a-z]*"'
```

- While the marker is not `data-demo="published"`: change only `reason`, from
  "The /demo page answers HTTP 404: it has not been deployed yet." to say the
  page is live but no video is published on it. Add the /demo page link.
- When it is `published` and the running time is 3 to 5 minutes: `achieved`
  `"Yes"`, `status` `"met"`, delete `reason`, and link the page and the video.

## 2. After the backend deploys (Render, by hand)

### `6.1-RD-e`: the live API

- `note`: replace "currently runs a build from before 2026-09-25" with the date
  of the deploy you checked.

### `live_backend` (a note)

- `text`: replace "It currently runs a build from before 2026-09-25. Merged work
  waiting for the next deploy includes settlement through escrow v2 (backend
  pull request #88) and the adoption counter (backend pull request #89)." with
  the deploy date, and name whatever merged work is still waiting, if any.

### `6.1-D4-c`: outside registrations

Unlocked when `/api/ecosystem/adoption` answers 200.

- `note`: drop "is merged in backend pull request #89 but not deployed, so its
  public address (/api/ecosystem/adoption) does not work yet. It goes live with
  the next manual backend deploy on Render."
- `links`: add
  `{ "label": "Live adoption counter: outside registrations, as the API counts them", "url": "https://orizon-agents-be-stellar.onrender.com/api/ecosystem/adoption", "kind": "page" }`.
  #89 label: drop `, not yet deployed`.
- `status` stays `"missing"` until the counter shows at least 2 outside
  registrations. Then link each registration `tx` and set `"present"`.

## 3. After the MIT licence pull requests merge

GitHub must detect the licence, not just see a file:

```sh
for r in FE-Stellar BE-Stellar Smart-Contract-Stellar Example-Agent-Stellar; do
  printf '%s ' "$r"
  gh api "repos/Bl0cksmiths/Orizon-Agents-$r/license" --jq .license.spdx_id
done   # every line must say MIT
gh pr view 93 --repo Bl0cksmiths/Orizon-Agents-FE-Stellar --json state,mergedAt
gh pr view 92 --repo Bl0cksmiths/Orizon-Agents-BE-Stellar --json state,mergedAt
gh pr view 5  --repo Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar --json state,mergedAt
```

### `6.1-RD-a`, `6.1-RD-b`, `6.1-RD-c`: the three repositories

For each, when its repository reports `MIT`:

- `status`: `"partial"` to `"present"`.
- `note`: drop "it has no licence file yet, so GitHub shows no licence. The MIT
  licence is added by the open pull request linked here." Keep the redirect
  sentence. For RD-c also drop the Cargo.toml sentence.
- `links`: the PR label from `(open)` to `(merged)`, with its `date`.

### `m11`: all source under MIT

- `achieved`: `"No: 1 of 4 public code repositories has an MIT licence file"`
  to the new count; `"Yes"` when all four report MIT.
- `status`: `"met"` only at 4 of 4. Delete `reason` then.
- `links`: each repository label from "GitHub detects no licence" to "MIT
  licence detected", and each PR label to `(merged)`.

## 4. Also re-read

These are not unlocked by the deploys above, but read them against the same
checks so nothing contradicts the rows you changed: `m08` (its reason cites the
readiness report, which a new backend build changes), `6.1-D4-d` and
`6.1-RD-f` (escrow v2 "merged but not deployed"), and the disclosures
`single_settler_key`, `escrow_custody` and `platform_credits` (they describe v1
as the live escrow). Those change when escrow v2 is deployed to testnet, which
is a contracts deploy, not one of the two above.

## 5. Verify before committing

```sh
npm run evidence:check                        # the validator and testnet-only rule
node scripts/evidence-check/cli.mjs --live    # every link fetched; chain facts read
E2E_PORT=3517 npx playwright test e2e/evidence.spec.ts e2e/litepaper.spec.ts
```

`--live` must exit 0: exit 1 is a failed link, 3 is a link that could not be
checked (never a pass), and 2 is a refused run or a checker that could not run
(for example, `@stellar/stellar-sdk` is not installed: run `npm ci`). Read the
full Playwright summary; the failed count prints above the passed count.
E2E_PORT must be free: another checkout's server on that port is reused
silently.
