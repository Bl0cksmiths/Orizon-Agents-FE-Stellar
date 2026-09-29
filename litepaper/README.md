# Orizon Agents Litepaper — repository

This folder holds the **Orizon Agents Protocol Litepaper** (v0.5) authored by *the Blocksmiths*.

## What's in here

```
litepaper/
├── README.md                          ← you are here
├── Orizon-Agents-Litepaper.md         bound book — cover · TOC · §1–§10 · §A–§E · footer
├── Orizon-Agents-Litepaper.html       self-contained HTML (CSS + Mermaid runtime embedded)
├── Orizon-Agents-Litepaper.pdf        PDF via headless Chrome
├── Orizon-Agents-Litepaper.docx       Word/Google-Docs/LibreOffice — Mermaid rendered to PNG
├── Orizon-Agents-Litepaper-docx.md    intermediate markdown (Mermaid blocks swapped for image refs)
├── litepaper.css                      print/screen stylesheet
├── mermaid-init.html                  pandoc include-after-body — bootstraps Mermaid
├── figures/                           pre-rendered Mermaid PNGs (referenced by the .docx pipeline)
│   ├── figure-1.png …                 sequenceDiagram for §4.2
│   ├── figure-1.mmd …                 original Mermaid source per figure
│   └── html/                          per-figure HTML wrappers (used by the render step)
└── sections/
    ├── 00-front-matter.md           cover · info box · authors
    ├── 01-coordination-dilemma.md   §1 motivation
    ├── 02-protocol.md               §2 protocol overview · comparison · roadmap
    ├── 03-use-cases.md              §3 use cases
    ├── 04-creating-workflows.md     §4 worker contract · lifecycle (Mermaid) · types · real-worker example
    ├── 05-technical-details.md      §5 components (Mermaid) · contract APIs · perf · threat model · audit · future
    ├── 06-operations-governance.md  §6 roles · onboarding · governance
    ├── 07-economics.md              §7 fee model · reputation · no-token-v1
    ├── 08-about-the-blocksmiths.md  §8 team
    ├── 09-additional-links.md       §9 link index
    ├── 10-disclaimer.md             §10 legal
    ├── 11-appendix-rest-api.md      §A REST API reference (every endpoint)
    ├── 12-appendix-trace-events.md  §B Trace event catalog (7 levels)
    ├── 13-appendix-onchain-events.md §C On-chain events (per contract)
    ├── 14-appendix-glossary.md      §D Glossary of terms
    └── 15-appendix-getting-started.md §E Getting started — buyer · operator · integrator
```

## Figures (Mermaid)

The litepaper carries five diagrams, all written as native Mermaid blocks so GitHub renders them inline:

| # | Title | Section | Type |
|---|---|---|---|
| 1 | End-to-end lifecycle of a single intent | §4.2 | `sequenceDiagram` |
| 2 | Three-layer system architecture | §5.3 | `flowchart TB` |
| 3 | Soroban contract topology | §5.3 | `flowchart LR` |
| 4 | Worker context plumbing | §5.2 | `flowchart LR` |
| 5 | x402 flow as a sequence | §5.3.3 | `sequenceDiagram` |

The **bound book** (`Orizon-Agents-Litepaper.md`) is the canonical single-file artifact for distribution. The **sections** folder is the granular form for editing — each chapter is self-contained and can be revised without rebuilding the rest.

## How to read

- **Operators and grant reviewers** — read `Orizon-Agents-Litepaper.md` straight through (100 pages as a PDF).
- **Developers building agents** — §6.3 and §E.2 for an agent of your own (an HTTPS endpoint you register and bind); §4 and §5 for how the backend runs its seeded agents.
- **Investors and ecosystem partners** — §2.2 (comparison), §6 (governance), §7 (economics).
- **Skeptics** — §5.5 (security), §5.7 (what isn't built yet), §10 (disclaimer).

## Render pipeline

**Edit `sections/`, then regenerate. Never hand-edit a rendered artifact** (the book, `-docx.md`, `.html`, `.pdf`, `.docx`, `figures/`): the formats drift, and `make check` fails on a hand-edit.

```bash
make all      # book → html → pdf → figures → docx, then check
make check    # the formats agree (see below); exits non-zero on any disagreement
make test     # the checker's own tests
make all OUT=/tmp/lp   # build into a scratch directory instead
```

Everything runs locally on Linux/WSL with no network. Requirements: `pandoc` 3.10 (on `PATH`, else `~/bin/pandoc`; `PANDOC=` overrides), a Chromium (the newest Playwright `chrome-headless-shell`, else Playwright Chromium, else `chromium` on `PATH`; `CHROME=` overrides), and Python 3 with `build/requirements.txt` (Pillow, pypdf, pytest). Paths are relative to this folder, so the build runs the same wherever it is mounted (e.g. `litepaper/` in the FE repo). Scratch files go to `.build/` (ignored).

| step | script | what it does |
| --- | --- | --- |
| `make book` | `build/assemble.py` | `sections/00` verbatim as the cover · `---` · a Table of Contents generated from the `# §X` and `## N.M` headings (§2–§7 list subsections; three hand-worded entries are coded in `TOC_LABELS`) · a Figures table generated from the `**Figure N.**` captions · each chapter after a `<!-- pagebreak -->` · `---` · `build/footer.md`, with the version and date read from the cover. Reproduces the v0.4 book byte for byte from the v0.4 sections. |
| `make html` | `build/render_html.py` | Swaps `<!-- pagebreak -->` for a page-break `<div>`, then `pandoc --from=markdown+raw_html+definition_lists+pipe_tables+fenced_code_attributes --to=html5 --standalone --embed-resources --css=litepaper.css --include-after-body=mermaid-init.html`, title and `lang=en` metadata. Reproduces the v0.4 HTML byte for byte. |
| `make pdf` | `build/pdf.py` | Headless Chromium `--print-to-pdf --virtual-time-budget=40000 --no-pdf-header-footer` on the HTML, so Mermaid renders before the snapshot. Chromium 153 honours the `@page` size and margins in `litepaper.css`. |
| `make figures` | `build/figures.py` | Each Mermaid block → `figures/figure-N.mmd`, wrapped in `build/figure.html` → `figures/html/figure-N.html`, screenshotted at 2× (`--force-device-scale-factor=2`, 1400×5000 CSS px window) and trimmed to 30 px of white margin with Pillow → `figures/figure-N.png`. |
| `make docx` | `build/docx.py` | The book with each Mermaid block swapped for `![Figure N](figures/figure-N.png)` → `Orizon-Agents-Litepaper-docx.md` → `pandoc` to `.docx` with title, author and the cover's date. |

**Figure numbers are caption numbers.** `figure-N` and the alt text `![Figure N]` belong to the diagram captioned **Figure N.**, not the Nth block in the book (§5.2's Figure 4 comes before §5.3's Figures 2 and 3). Up to v0.4 the files were numbered in document order, so the `.docx` showed "Figure 2" above the caption "Figure 4".

**Figures re-render only when their diagram changes.** A PNG is re-rendered when its `.mmd` changed or it is missing; `FORCE=all` (or `FORCE=2,5`) re-renders the rest. The v0.4 PNGs came from Windows Chrome; a re-render here matches them in size but not in bytes, so an unchanged diagram keeps its PNG. A render whose content reaches the window edge is refused: v0.4's Figure 2 (the three-layer architecture) was cut off below `execution_svc` that way, and 0.5 re-renders it whole.

### Determinism

Re-running the pipeline produces byte-identical files:

- **Mermaid runtime.** `mermaid-init.html` and the figure wrapper load the floating `mermaid@10` from jsDelivr, which `--embed-resources` inlines at build time. That was 10.9.6 for v0.4 and is 10.9.8 now. The build swaps the URL for `build/vendor/mermaid-10.9.6.min.js` (identical to the runtime embedded in v0.4 and to jsDelivr's `mermaid@10.9.6`, sha256 `eda3a0ad…767151`). The build fails if the URL in those files changes.
- **Dates.** `SOURCE_DATE_EPOCH` defaults to midnight UTC on the cover's date. It pins the PDF's `/CreationDate` and `/ModDate` (rewritten in place at the same length) and the `.docx` zip and `docProps` timestamps. The `.docx` date field is the cover's date. v0.4's was 2026-06-10, not the 2026-06-07 recorded here then.
- **Fonts.** v0.4 was printed by Windows Chrome with Segoe UI and Consolas. Under WSL the build points Chromium's fontconfig at `/mnt/c/Windows/Fonts` so text renders in the same faces; `FONT_DIRS=` (empty) turns that off, `FONT_DIRS=a:b` picks other directories. Glyphs Segoe UI lacks (✓, ✗) fall back to DejaVu Sans rather than Segoe UI Symbol.
- **Layout.** The PDF layout differs slightly from v0.4 even for unchanged text, because Chrome itself changed, from Windows Chrome 148 to Chromium 153. The v0.4 book printed at 84 pages then and 85 now; the v0.5 book prints at 100.
- **Structure ids.** Chrome tags each PDF structure element with its DOM node number, `(node00004895)`, in its `/ID`, in table cells' `/Headers` and in the `/IDTree`. Those numbers can shift from run to run with identical text: the 0.5 audit saw two builds differ by 942 bytes that way, with all 94 pages' text the same. `build/pdf.py` renumbers them 1, 2, 3… in their numeric order at the same width, so the byte length, the sort order and the xref table are unchanged and the PDF repeats byte for byte.
- **Chromium.** The full Playwright Chromium hangs on `--print-to-pdf` under WSL, even for a one-line page; `chrome-headless-shell` does not, so it is preferred.

### `make check`

The acceptance test for "every format carries the same content, regenerated from the source":

1. **Source.** The book equals `assemble(sections/)`. The book's §6 equals `sections/06-*.md` byte for byte. `-docx.md` and `figures/*.mmd` equal what the book derives. This catches a hand-edited book.
2. **Formats.** For each chapter in `CHECK` (default `2 4 5 6 7 9 10 A B C D E`, every chapter 0.5 changed), the text from its `§X · Title` heading to the next chapter's heading is compared across the book `.md` (rendered by pandoc), the `.html` (parsed), the `.pdf` (pypdf) and the `.docx` (pandoc to HTML). The `.docx` is compared with the chapter as `-docx.md` carries it, with each Mermaid block already its PNG, so chapters with figures compare too. All text is normalised with NFKC (ligatures, no-break spaces), straight quotes and no soft hyphens. The PDF is compared as a character stream without whitespace or hyphens, because Chrome hyphenates (`hyphens: auto`). Its reference also carries what print adds: link URLs (`a[href^="http"]::after`) and ordered-list numbers. Any difference prints the format and the first diverging word in context. The PDF text drops the private-use code points Chrome leaves at the top of some pages. pypdf still extracts the odd code block out of order, and a table split across pages repeats its header inside a cell (§9), so the chapters in `NO_PDF` (default `4 5 9 A B E`) are compared in the `.md`, `.html` and `.docx` only, and the report says `SKIP  pdf`.
3. **Figures.** Every PNG has a white margin, so none is clipped.
4. **Seed table.** The §6.2 Genesis-agents table agrees row for row, column by column (matched by header), with `_SEED` in the backend's `app/seed.py`. It is read with `git show $(SEED_REF):$(SEED_PATH)` from `SEED_REPO` (defaults `origin/main`, `app/seed.py`, `~/Websites-Services-2026/orizon-agents-BE-Stellar`) and parsed with `ast`, never imported. `SEED_REPO=none` skips it.

## Pandoc + LaTeX (alternative)

If you prefer a LaTeX-typeset PDF (system install needed):

```bash
sudo apt-get install -y --no-install-recommends pandoc texlive-xetex \
  texlive-fonts-recommended texlive-latex-recommended lmodern
pandoc Orizon-Agents-Litepaper.md \
  -o Orizon-Agents-Litepaper.pdf \
  --pdf-engine=xelatex \
  --toc --toc-depth=2 \
  -V geometry:margin=1in
```

Note: LaTeX PDFs won't include Mermaid diagrams natively — you'd need to pre-render each Mermaid block to SVG via `mmdc` (`@mermaid-js/mermaid-cli`) and embed the SVGs before pandoc runs.

## Version log

| Version | Date | Notes |
| --- | --- | --- |
| 0.1 | 2026-06-07 | Initial draft. 11,236 words, 4 Mermaid figures, 11 sections. All shipped behaviour cited against `Orizon-Agents-FE-Stellar`, `Orizon-Agents-BE-Stellar`, and `Orizon-Agents-Smart-Contract-Stellar` source repos. |
| 0.2 | 2026-06-07 | Expanded for depth. 15,784 words, 5 Mermaid figures (added Figure 5: x402 sequence). Added §4.5 real-worker example, full contract API tables in §5.3, error-code table in §5.3.2, threat model in §5.5.1, worked attestation example in §5.6.1, and three new appendices: §A REST API reference, §B trace event catalog, §C on-chain events. |
| 0.3 | 2026-06-07 | Added Word-compatible `.docx` build (Mermaid pre-rendered to 2× DPI PNGs, embedded via pandoc). |
| 0.4 | 2026-06-07 | 18,970 words. Tonal pass: removed demo / testnet-only framing, frame as live shipping protocol. Added §2.4 (Why Stellar), §3.6 (kit case studies), §7.4 (monthly projection), §D Glossary, §E Getting Started (buyer / operator / integrator paths). |
| 0.5 | 2026-09-29 | §6 rewritten for the Blue Belt sprint: open registration, reputation-gated routing and the cold start (§6.7), the dispute window and platform-funded credit (§6.8), standing disclosures (§6.9). Corrected three claims the code did not support: settler rotation (§6.1), orchestrator routing and the reputation floor scale (§6.3). Matching glossary and disclaimer corrections, and the same corrections carried into the front matter, §2, §4, §5, §7, §9 and appendices A to E: the settler apart from the scorer and sealer, the ledger's 0–100 rating scale, persistent replay guard and deployed address, the cold start at the prior, no buyer ratings, no charge settled through the deployed escrow, one settlement per workflow rather than a charge per step, network fees and contract sizes measured on testnet, and the USD/XLM rate stated as a dated assumption. Every corrected claim cites its file and symbol. |

## License

MIT, same as the protocol.
