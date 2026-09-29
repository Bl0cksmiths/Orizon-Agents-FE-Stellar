#!/usr/bin/env python3
"""Assemble the bound book (Orizon-Agents-Litepaper.md) from sections/.

Layout, recovered from the v0.4 book and proven byte-for-byte against it:

    sections/00-front-matter.md          (the cover, verbatim)
    ---
    ## Table of Contents                 (generated from the chapter headings)
    ### Appendices
    ### Figures                          (generated from the figure captions)
    <!-- pagebreak -->  sections/01…     (each chapter verbatim)
    ...
    <!-- pagebreak -->  sections/15…
    ---
    <!-- pagebreak -->  build/footer.md  (version and date read from the cover)

Usage: assemble.py [--sections DIR] [--out FILE]   (default: stdout)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGEBREAK = "<!-- pagebreak -->"

# Chapters whose `## N.M` headings are listed in the TOC. §1 and §8 have
# subsections too, but the book has never listed them.
TOC_SUBSECTIONS = {"2", "3", "4", "5", "6", "7"}

# TOC entries that deliberately differ from the heading text: the TOC folds a
# section's `###` highlights into its entry. Keyed by section number.
TOC_LABELS = {
    "5.3": "Components — Contract APIs · Error codes · x402 sequence",
    "5.5": "Security and threat model",
    "5.6": "Compliance and audit trail — A worked example",
}

# Figures-table titles that differ from the caption's first clause.
FIGURE_TITLES = {
    5: "x402 flow as a sequence",
}

CHAPTER_RE = re.compile(r"^# (§(\S+) · .+)$")
SECTION_RE = re.compile(r"^(#{2,6}) (\d+(?:\.\d+)+|[A-Z]\.\d+(?:\.\d+)*) · (.+)$")
CAPTION_RE = re.compile(r"^\*\*Figure (\d+)\.\*\* (.+)$")
VERSION_RE = re.compile(r"^\*\*Version\*\* (\S+) · \*\*Date\*\* (\S+)$", re.M)


def outside_fences(text: str):
    """Yield the lines of `text` that are not inside a fenced code block."""
    fence = None
    for line in text.split("\n"):
        m = re.match(r"^(```+|~~~+)", line)
        if m:
            if fence is None:
                fence = m.group(1)
            elif line.strip() == fence[0] * len(fence) or line.startswith(fence):
                fence = None
            continue
        if fence is None:
            yield line


def chapter_files(sections: Path) -> list[Path]:
    files = sorted(sections.glob("[0-9][0-9]-*.md"))
    if not files or not files[0].name.startswith("00-"):
        sys.exit(f"assemble: no 00-*.md cover in {sections}")
    return files


def build_toc(chapters: list[str]) -> str:
    main, appendices = [], []
    for text in chapters:
        lines = list(outside_fences(text))
        m = CHAPTER_RE.match(lines[0])
        if not m:
            sys.exit(f"assemble: chapter does not open with '# §X · Title': {lines[0]!r}")
        title, num = m.groups()
        entry = [f"- **{title}**"]
        if num in TOC_SUBSECTIONS:
            for line in lines[1:]:
                s = SECTION_RE.match(line)
                if s and len(s.group(1)) == 2:
                    sub = s.group(2)
                    entry.append(f"  - §{sub} {TOC_LABELS.get(sub, s.group(3))}")
        (main if num.isdigit() else appendices).extend(entry)
    out = ["## Table of Contents", "", *main]
    if appendices:
        out += ["", "### Appendices", "", *appendices]
    return "\n".join(out)


def build_figures(chapters: list[str]) -> str:
    rows = {}
    for text in chapters:
        where = None
        for line in outside_fences(text):
            s = SECTION_RE.match(line)
            if s:
                where = s.group(2)
            c = CAPTION_RE.match(line)
            if c:
                n = int(c.group(1))
                title = re.split(r" — |\.\s*$", c.group(2), maxsplit=1)[0]
                if n in rows:
                    sys.exit(f"assemble: Figure {n} is captioned twice")
                rows[n] = (FIGURE_TITLES.get(n, title), where)
    if not rows:
        return ""
    if sorted(rows) != list(range(1, len(rows) + 1)):
        sys.exit(f"assemble: figure numbers are not 1..N: {sorted(rows)}")
    out = ["### Figures", "", "| # | Title | Where |", "|---|---|---|"]
    out += [f"| {n} | {t} | §{w} |" for n, (t, w) in sorted(rows.items())]
    return "\n".join(out)


def assemble(sections: Path) -> str:
    files = chapter_files(sections)
    cover = files[0].read_text(encoding="utf-8")
    chapters = [f.read_text(encoding="utf-8") for f in files[1:]]
    v = VERSION_RE.search(cover)
    if not v:
        sys.exit("assemble: the cover has no '**Version** X · **Date** Y' line")
    footer = (ROOT / "build" / "footer.md").read_text(encoding="utf-8")
    footer = footer.format(version=v.group(1), date=v.group(2))

    front = build_toc(chapters)
    figures = build_figures(chapters)
    if figures:
        front += "\n\n" + figures
    book = cover + "\n---\n\n" + front + "\n\n"
    for text in chapters:
        book += f"\n{PAGEBREAK}\n\n" + text
    book += "\n---\n" + f"\n{PAGEBREAK}\n\n" + footer
    return book


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sections", type=Path, default=ROOT / "sections")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    book = assemble(args.sections)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(book, encoding="utf-8")
    else:
        sys.stdout.write(book)


if __name__ == "__main__":
    main()
