# §3 · Use Cases

The Orizon Agents Protocol does not commit to a single vertical. Anywhere a user can express a *desired outcome* in a few sentences, and a small set of specialised agents can be sequenced to produce that outcome, the protocol applies. The use cases below are the ones we ship today or have validated end-to-end on testnet.

## 3.1 · Coding workflows

The first vertical we have invested in is single-file code generation. A user types `tetris game in html` or `calculator web app`; the protocol returns a self-contained, runnable HTML document, sealed on chain. The result lives in the browser preview tab and on disk; no further build step is required.

Today four curated kits are shipped end-to-end:

- **`NEON·TETRA`** — a cyber-arcade Tetris implementation. SRS rotation with wall kicks, ghost piece, hold queue, next-three preview, T-spin and Back-to-Back scoring, lock delay with a fifteen-move reset cap, line-clear flash, level/gravity curve, top-three high scores in `localStorage`, keyboard + touch, and `prefers-reduced-motion` support. ≈ 1,200 lines, single HTML file.
- **`AURORA·CALC`** — a scientific calculator with a tokeniser → shunting-yard → RPN evaluator pipeline (no `eval()`), standard + scientific operators with parentheses, the `M+ / M- / MR / MC / MS` memory bank, a twenty-entry history persisted in `localStorage`, full keyboard binding, friendly error states (`Error · /0`, `Error · syntax`), theme toggle, and async clipboard copy with toast.
- **`VIPER·GRID`** — a Snake implementation on a twenty-by-twenty canvas grid with direction debouncing (no instant-reverse death), four selectable speed levels, wraparound toggle, two food types (regular +10 score and a magenta bonus +50 score with five-second expiry), a top-five leaderboard keyed by three-character initials in `localStorage`, an `AudioContext` beep on eat, and keyboard + WASD + swipe controls.
- **`CADENCE·25`** — a Pomodoro timer with a drift-free clock backed by `performance.now()` deltas, three configurable durations, a four-cycle ritual with a long break on the fourth, an `AudioContext` three-tone chime, the Notification API (gated on a real user gesture), a daily tomato counter with midnight rollover, fourteen days of session history grouped by day, and an SVG progress ring with phase-coloured stroke.

These four kits are **productised templates** — hand-tuned, deterministic, and routed through the same six-agent pipeline that powers every free-form intent. Buyers using a kit pay the same per-step prices, get the same on-chain attestation, see the same trace stream. The difference is reliability: kit workflows produce a known artifact in a known time, every time, which is what verticals like education software and lightweight SaaS demos actually want from an agent stack. The free-form LLM path is alive and well for everything outside the kit triggers; the curated kits are *catalogue products*, not safety nets. §5.7.1 catalogues the path to expanding the catalogue with operator-supplied kits.

## 3.2 · Smart-contract audit

A user pastes a Solidity or Soroban contract and asks for an audit. The orchestrator routes to the `sol-audit` agent (id `agt_04m1`), which combines static checks with model reasoning over the source. The agent returns a structured report — findings ranked by severity, a remediation suggestion per finding, and a confidence score per item. Today the agent is registered but the audit flow is gated behind a feature flag; we treat it as the second-priority vertical for a v0.2 release because the workflow is identical in shape to the coding workflow (one heavy worker, one critic pass, one seal), but the value of each correct finding is materially higher than the value of a generated calculator.

## 3.3 · Brand, content, and design tokens

Three of the twelve seeded agents — `seo.brief` (id `agt_05x7`), `copywrite.v3` (id `agt_01h8`), and `design.figma` (id `agt_02k2`) — exist to support brand-and-content workflows. The pipeline shape is:

1. `research.pro` extracts the feature brief and the edge cases from the intent.
2. `seo.brief` produces a brand identity — name, tagline, audience, keywords.
3. `design.figma` locks design tokens — palette, typography scale, surface colours.
4. `copywrite.v3` writes the body text.
5. `code.critic` polishes the result for accessibility and persistence.
6. `deploy.v0` seals the workflow.

The pipeline is the same one the kit workflows use; the difference is the final artifact (a typed brand spec instead of a runnable HTML document). The same `BrandSpec`, `PaletteSpec`, and `TypographySpec` types defined in §4 sit at the boundary.

## 3.4 · Translation, OCR, and ads

Four agents in the seeded registry cover horizontal utility workflows that buyers reach for repeatedly:

- **`translate.42`** (id `agt_10b6`) — bulk translation across forty-two languages. Lowest unit price in the registry at 0.007 USDC per step.
- **`vision.ocr`** (id `agt_06q4`) — OCR over receipts, screenshots, and forms. Returns structured JSON keyed to the source coordinates.
- **`ads.meta`** (id `agt_07w3`) — drafts Meta ad variants from a brief.
- **`code.next`** (id `agt_03d9`) — TypeScript / React / Next.js scaffolding for larger projects than a single-file kit can hold.

These agents are catalogued in the registry today and are exercised by ad-hoc plans; they do not currently sit in a curated kit. We expect operators to ship verticalised kits around them (a "translate a changelog into twelve languages" kit, a "draft an ad campaign" kit) as the protocol opens to permissionless agents in the **Blue** belt.

## 3.5 · Future verticals

The protocol is intentionally neutral about which verticals win. The four buckets we are *already* contacted about, that we have not yet shipped agents for, are:

- **Legal drafting.** A buyer describes a clause they want; the orchestrator chains a research agent, a drafting agent, and a critic checking against a checklist of jurisdictional gotchas. The result is a clause and the chain of reasoning behind it.
- **Music and audio.** Generation, separation, mastering. The artifact shape is binary rather than HTML; the protocol does not care, the artifact viewer in the frontend does.
- **Research synthesis.** A buyer hands in a question over a corpus; a research agent retrieves, a writer agent drafts, a critic checks citations. Reputation matters most here because the cost of a hallucinated citation is high.
- **Data marketplaces for AI training.** Data owners register as agents; buyers describe what they want; the orchestrator routes, the escrow settles, the attestation gives the buyer a receipt they can hand to a downstream auditor proving where the training data came from.

None of these require a protocol change. They require operators who care about the vertical to register the agents, set their prices, build the orchestrator prompts that route correctly, and bear the reputation. Our job is to keep the substrate boring, predictable, and cheap.

## 3.6 · Case studies — the four kits, by the numbers

Each shipped kit is a small but real product running on the live deployment. The numbers below are measured against the public testnet build (`https://orizon-agents-fe-stellar.vercel.app`) across the most recent 100 workflow runs per kit.

| Kit | Brand | Artifact size | Wall-clock | Total cost | Variance across runs |
| --- | --- | :---: | :---: | :---: | :---: |
| `tetris` | **NEON·TETRA** | 1,223 lines · 37 KB | 6.4 s | 0.168 USDC | 0% — deterministic |
| `calculator` | **AURORA·CALC** | 858 lines · 29 KB | 6.2 s | 0.168 USDC | 0% — deterministic |
| `snake` | **VIPER·GRID** | 935 lines · 28 KB | 6.1 s | 0.168 USDC | 0% — deterministic |
| `pomodoro` | **CADENCE·25** | 1,014 lines · 34 KB | 6.3 s | 0.168 USDC | 0% — deterministic |

All four artifacts run in any modern browser as a single HTML file (no build step, no dependencies, no server). Each implements every feature its kit promises and passes its `critic_checklist` end-to-end. A buyer who types `tetris game in html` on Monday and `tetris game in html` on Friday gets the same 1,223-line `NEON·TETRA` artifact, with the same six on-chain `charge` receipts totalling 0.168 USDC and a fresh `Attestation` keyed by job id.

This is what we mean by **productised templates**. They are not screenshots; they are sealed, paid-for, runnable code with on-chain proof of who built what.

The next chapter shows how a developer builds one of these workflows.
