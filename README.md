# Orizon Agents Litepaper — repository

This folder holds the **Orizon Agents Protocol Litepaper** (v0.1) authored by *the Blocksmiths*.

## What's in here

```
whitepaper/
├── README.md                          ← you are here
├── Orizon-Agents-Litepaper.md         bound book — cover · TOC · §1–§10 · §A–§C · footer
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

The litepaper carries four diagrams, all written as native Mermaid blocks so GitHub renders them inline:

| # | Title | Section | Type |
|---|---|---|---|
| 1 | End-to-end lifecycle of a single intent | §4.2 | `sequenceDiagram` |
| 2 | Three-layer system architecture | §5.3 | `flowchart TB` |
| 3 | Soroban contract topology | §5.3 | `flowchart LR` |
| 4 | Worker context plumbing | §5.2 | `flowchart LR` |
| 5 | x402 flow as a sequence | §5.3.3 | `sequenceDiagram` |

The **bound book** (`Orizon-Agents-Litepaper.md`) is the canonical single-file artifact for distribution. The **sections** folder is the granular form for editing — each chapter is self-contained and can be revised without rebuilding the rest.

## How to read

- **Operators and grant reviewers** — read `Orizon-Agents-Litepaper.md` straight through (~30 pages).
- **Developers building agents** — §4 and §5 are written for you.
- **Investors and ecosystem partners** — §2.2 (comparison), §6 (governance), §7 (economics).
- **Skeptics** — §5.5 (security), §5.7 (what isn't built yet), §10 (disclaimer).

## Render pipeline

The render is a three-step bash flow. Each step is reproducible and committed:

**Step 1 — Bound book from sections.**

```bash
cd whitepaper
# Take the cover verbatim, append TOC + Figures table, then each chapter
# preceded by a <!-- pagebreak --> marker, then a footer.
# See git history for the exact assembly command; the book is the canonical
# single-file distribution artifact.
```

**Step 2 — Self-contained HTML via pandoc.**

```bash
sed -E 's|<!-- pagebreak -->|<div style="page-break-before: always; break-before: page; height: 0;"></div>|g' \
  Orizon-Agents-Litepaper.md > /tmp/litepaper-html-src.md

pandoc /tmp/litepaper-html-src.md \
  -o Orizon-Agents-Litepaper.html \
  --from=markdown+raw_html+definition_lists+pipe_tables+fenced_code_attributes \
  --to=html5 \
  --standalone \
  --embed-resources \
  --css=litepaper.css \
  --include-after-body=mermaid-init.html \
  --metadata title="The Orizon Agents Protocol Litepaper" \
  --metadata lang=en
```

`mermaid-init.html` boots the Mermaid runtime and converts pandoc's `<pre class="mermaid">` blocks into rendered SVG. With `--embed-resources`, the stylesheet *and* the Mermaid runtime are inlined, so the HTML is fully self-contained (~3.3 MB) and works offline.

**Step 3 — PDF via headless Chrome (no LaTeX needed).**

```bash
# Use whichever Chrome/Edge/Chromium binary you have. On WSL with Windows Chrome:
chrome.exe \
  --headless=new --disable-gpu --no-sandbox \
  --run-all-compositor-stages-before-draw \
  --virtual-time-budget=40000 \
  --no-pdf-header-footer \
  --print-to-pdf=Orizon-Agents-Litepaper.pdf \
  "file:///path/to/Orizon-Agents-Litepaper.html"
```

`--virtual-time-budget=40000` (40 s) gives Mermaid enough time to render its SVGs before Chrome captures the print snapshot.

**Caveat.** Chrome's headless `--print-to-pdf` ignores `@page` CSS sizing — it uses Letter at default margins. For finer pagination control, open the HTML in any browser and **Ctrl-P → Save as PDF**; the interactive print dialog honours `@page`, `page-break-before`, etc.

## Word / Google-Docs / LibreOffice (.docx)

The `.docx` is built by pre-rendering each Mermaid diagram to PNG (Chrome headless screenshots a small HTML wrapper per diagram, Pillow trims the whitespace), then converting an intermediate markdown — where the Mermaid blocks are swapped for `![Figure N](figures/figure-N.png)` references — through pandoc to .docx.

```bash
# 1. Extract Mermaid blocks → figures/figure-N.mmd and produce *-docx.md
python3 - << 'PY'
import re
from pathlib import Path
src = Path('Orizon-Agents-Litepaper.md').read_text()
pat = re.compile(r'```mermaid\n(.*?)\n```', re.DOTALL)
Path('figures').mkdir(exist_ok=True)
counter = [0]
for i, b in enumerate(pat.findall(src), 1):
    (Path('figures') / f'figure-{i}.mmd').write_text(b)
def rep(m):
    counter[0] += 1
    return f'![Figure {counter[0]}](figures/figure-{counter[0]}.png)'
Path('Orizon-Agents-Litepaper-docx.md').write_text(pat.sub(rep, src))
PY

# 2. Wrap each .mmd in a small HTML, screenshot via Chrome headless at 2× DPI
#    (see git history for the exact wrapper template)

# 3. Trim white margins via Pillow
python3 -c "
from PIL import Image, ImageChops
for i in range(1, 6):
    p = f'figures/figure-{i}.png'
    img = Image.open(p).convert('RGB')
    bg = Image.new('RGB', img.size, (255, 255, 255))
    bbox = ImageChops.difference(img, bg).getbbox()
    if bbox:
        l, t, r, b = bbox
        img.crop((max(0, l-30), max(0, t-30), min(img.size[0], r+30), min(img.size[1], b+30))).save(p)
"

# 4. Build the .docx
pandoc Orizon-Agents-Litepaper-docx.md \
  -o Orizon-Agents-Litepaper.docx \
  --metadata title="The Orizon Agents Protocol Litepaper" \
  --metadata author="The Blocksmiths" \
  --metadata date="2026-06-07"
```

The resulting .docx (~800 KB) opens cleanly in Word, Google Docs, and LibreOffice. Word auto-fits images to page width; the 2× DPI screenshots stay crisp when re-scaled.

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

## License

MIT, same as the protocol.
