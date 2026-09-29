#!/usr/bin/env python3
"""make check: the BLO-47 acceptance test in code.

  1. source:  the book equals assemble(sections/), and its §6 equals
              sections/06-*.md byte for byte (catches a hand-edited book);
              the -docx.md and figures/*.mmd equal what the book derives.
  2. formats: §6 (from the `§6 · …` heading to the `§7 · …` heading) carries
              the same text in the book .md, the .html, the .pdf and the .docx.
  3. figures: every figure PNG has white margin on all sides (not clipped).
  4. seed:    the §6.2 Genesis-agents table agrees row for row with the
              backend's app/seed.py (read from git, parsed with ast).

Exits non-zero on any disagreement, naming the format and the first difference.
"""
from __future__ import annotations

import argparse
import ast
import re
import subprocess
import sys
import unicodedata
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BOOK, DOCX, DOCX_MD, HTML, PDF, ROOT, docx_markdown, figure_blocks  # noqa: E402

PAGEBREAK = "\n<!-- pagebreak -->"
MD_FROM = "markdown+raw_html+definition_lists+pipe_tables+fenced_code_attributes"
PRIVATE_USE = re.compile("[\ue000-\uf8ff]")


# ---------------------------------------------------------------- markdown --

def chapter_heading_lines(book: str) -> list[tuple[int, str]]:
    """(offset, line) for each `# §X · Title` line outside fenced code."""
    out, fence, pos = [], False, 0
    for line in book.split("\n"):
        if line.startswith("```"):
            fence = not fence
        elif not fence and line.startswith("# §"):
            out.append((pos, line))
        pos += len(line) + 1
    return out


def book_chapter(book: str, num: str) -> tuple[str, str, str]:
    """The chapter's markdown (as assembled: up to its pagebreak), its title
    and the next chapter's title."""
    heads = chapter_heading_lines(book)
    for i, (pos, line) in enumerate(heads):
        if line.startswith(f"# §{num} · "):
            nxt = heads[i + 1][1][2:] if i + 1 < len(heads) else ""
            end = book.find(PAGEBREAK, pos)
            chunk = book[pos:end if end != -1 else len(book)]
            if not nxt:
                if chunk.endswith("\n---\n"):
                    chunk = chunk[:-5]  # the rule assemble.py puts before the footer
                # the last chapter ends at the footer's heading
                m = re.search(r"^#+ (.+)$", book[pos + len(chunk):], re.M)
                nxt = m.group(1) if m else ""
            return chunk, line[2:], nxt
    raise SystemExit(f"check: the book has no '# §{num} · ' chapter")


# -------------------------------------------------------------------- text --

BLOCK = {"p", "div", "li", "ul", "ol", "table", "thead", "tbody", "tr", "td", "th", "h1", "h2",
         "h3", "h4", "h5", "h6", "pre", "blockquote", "br", "hr", "dl", "dt", "dd", "section",
         "header", "figure", "figcaption", "caption"}
SKIP = {"script", "style", "title", "head"}


class Text(HTMLParser):
    """Visible text of an HTML document. With `printed=True` it also emits
    what the print stylesheet and Chrome add to a PDF: ` <href>` after each
    http link (litepaper.css `a[href^="http"]::after`) and `N.` before each
    ordered-list item."""

    def __init__(self, printed: bool = False):
        super().__init__(convert_charrefs=True)
        self.printed, self.parts, self.skip, self.links, self.lists = printed, [], 0, [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP:
            self.skip += 1
        if tag in BLOCK:
            self.parts.append("\n")
        if tag == "ol":
            self.lists.append(int(a.get("start") or 1))
        elif tag == "ul":
            self.lists.append(None)
        elif tag == "li" and self.printed and self.lists and self.lists[-1] is not None:
            self.parts.append(f"{self.lists[-1]}. ")
            self.lists[-1] += 1
        elif tag == "a":
            self.links.append(a.get("href") or "")

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        if tag in BLOCK:
            self.parts.append("\n")
        if tag in ("ol", "ul") and self.lists:
            self.lists.pop()
        elif tag == "a" and self.links:
            href = self.links.pop()
            if self.printed and href.startswith("http") and not self.skip:
                self.parts.append(" " + href)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_text(html: str, printed: bool = False) -> str:
    p = Text(printed)
    p.feed(html)
    p.close()
    return "".join(p.parts)


QUOTES = str.maketrans({"‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
                        "“": '"', "”": '"', "„": '"', "″": '"'})
INVISIBLE = dict.fromkeys(map(ord, "­​‌‍⁠﻿"))
HYPHENS = re.compile(r"[-‐‑]")


def words(text: str) -> list[str]:
    """NFKC (ligatures, no-break spaces), straight quotes, no soft hyphens."""
    return unicodedata.normalize("NFKC", text).translate(QUOTES).translate(INVISIBLE).split()


def section_slice(tokens: list[str], start: list[str], end: list[str]) -> list[str] | None:
    """tokens from the chapter's `start` title up to the `end` title. The TOC
    carries both titles too, so the chapter is the last `start` hit that an
    `end` hit follows (the last `start` hit, when `end` is empty)."""
    def find_all(seq):
        n = len(seq)
        return [i for i in range(len(tokens) - n + 1) if tokens[i:i + n] == seq]

    starts = find_all(start)
    if not end:
        return tokens[starts[-1]:] if starts else None
    ends = find_all(end)
    for s in reversed(starts):
        e = next((e for e in ends if e > s), None)
        if e is not None:
            return tokens[s:e]
    return None


def first_divergence(ref: list[str], got: list[str], loose: bool = False) -> tuple[int, int] | None:
    """Index into (ref, got) of the first differing word, or None.

    `loose` (for the PDF) compares the character stream with whitespace and
    hyphens removed: Chrome hyphenates (`hyphens: auto`) and pypdf's word
    spacing is approximate, so a word split or joined there is not a change.
    """
    if not loose:
        for i in range(max(len(ref), len(got))):
            if i >= len(ref) or i >= len(got) or ref[i] != got[i]:
                return i, i
        return None

    def stream(tokens):
        chars, owner = [], []
        for k, t in enumerate(tokens):
            t = HYPHENS.sub("", t)
            chars.append(t)
            owner += [k] * len(t)
        return "".join(chars), owner

    a, oa = stream(ref)
    b, ob = stream(got)
    if a == b:
        return None
    i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
    return (oa[i] if i < len(oa) else len(ref)), (ob[i] if i < len(ob) else len(got))


def context(tokens: list[str], i: int, n: int = 6) -> str:
    before = " ".join(tokens[max(0, i - n):i])
    at = tokens[i] if i < len(tokens) else "<end of §>"
    after = " ".join(tokens[i + 1:i + 1 + n])
    return f"…{before} [[{at}]] {after}…"


# ----------------------------------------------------------------- formats --

def pandoc(pandoc_bin: str, args: list[str], data: bytes | None = None) -> str:
    r = subprocess.run([pandoc_bin, *args], input=data, capture_output=True, check=True)
    return r.stdout.decode("utf-8")


def pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    # Content-stream order. Known limit: Chrome paints the odd code block out
    # of order (§A.1's "202 Accepted" is extracted after §A.2's first
    # paragraphs, in v0.4 too). Layout mode fixes that but interleaves
    # multi-line table cells, which §6 has plenty of. Chrome also leaves
    # private-use code points (U+E000–U+F8FF) at the top of some pages; they
    # stand for no text, so they are dropped.
    text = "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    return PRIVATE_USE.sub("", text)


def format_texts(out: Path, pandoc_bin: str, chapter_md: str, docx_chapter_md: str,
                 pdf: bool = True) -> dict[str, tuple[str, str]]:
    """{format: (reference text from the book, text read from the format)}.

    The .docx is compared with the chapter as the -docx.md carries it, where
    each Mermaid block is already its figure's PNG (check_source ties that
    file to the book), so a chapter with figures compares cleanly."""
    def md_html(md: str) -> str:
        return pandoc(pandoc_bin, [f"--from={MD_FROM}", "--to=html5"], md.encode())

    ref_html = md_html(chapter_md)
    ref, ref_printed = html_text(ref_html), html_text(ref_html, printed=True)
    texts = {}
    texts["html"] = (ref, html_text((out / HTML).read_text(encoding="utf-8")))
    if pdf:
        texts["pdf"] = (ref_printed, pdf_text(out / PDF))
    texts["docx"] = (html_text(md_html(docx_chapter_md)),
                     html_text(pandoc(pandoc_bin, ["--from=docx", "--to=html5", str(out / DOCX)])))
    return texts


def check_formats(out: Path, pandoc_bin: str, num: str = "6", pdf: bool = True) -> list[str]:
    book = (out / BOOK).read_text(encoding="utf-8")
    chapter_md, title, next_title = book_chapter(book, num)
    docx_chapter_md = book_chapter((out / DOCX_MD).read_text(encoding="utf-8"), num)[0]
    start, end = words(title), words(next_title)
    failures = []
    if not pdf:
        print(f"SKIP  pdf: §{num} (NO_PDF: pypdf extracts its code blocks out of order)")
    for fmt, (ref_text, got_text) in format_texts(out, pandoc_bin, chapter_md, docx_chapter_md, pdf).items():
        ref = section_slice(words(ref_text), start, [])
        got = section_slice(words(got_text), start, end)
        if got is None:
            failures.append(f"{fmt}: no §{num} found (looked for '{title}' … '{next_title}')")
            continue
        d = first_divergence(ref, got, loose=(fmt == "pdf"))
        if d:
            failures.append(
                f"{fmt}: §{num} differs from the book at word {d[0] + 1}:\n"
                f"    book: {context(ref, d[0])}\n    {fmt}: {context(got, d[1])}"
            )
        else:
            print(f"ok    {fmt}: §{num} matches the book ({len(ref)} words)")
    return failures


# ------------------------------------------------------------------ source --

def check_source(out: Path, sections: Path, num: str = "6", full: bool = True) -> list[str]:
    import assemble

    failures = []
    book = (out / BOOK).read_text(encoding="utf-8")
    src = next((f for f in sorted(sections.glob("[0-9][0-9]-*.md"))
                if f.read_text(encoding="utf-8").startswith(f"# §{num} · ")), None)
    chapter_md = book_chapter(book, num)[0]
    if src is None:
        failures.append(f"source: no sections/*.md opens with '# §{num} · '")
    elif chapter_md != src.read_text(encoding="utf-8"):
        failures.append(f"source: the book's §{num} is not {src.name} — hand-edited, or not regenerated")
    else:
        print(f"ok    source: the book's §{num} equals sections/{src.name}")
    if not full:
        return failures
    if book != assemble.assemble(sections):
        a, b = book.split("\n"), assemble.assemble(sections).split("\n")
        line = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
        failures.append(f"source: the book differs from assemble(sections) at line {line + 1} — run make book")
    else:
        print("ok    source: the book equals assemble(sections)")
    docx_md = out / DOCX_MD
    if not docx_md.exists() or docx_md.read_text(encoding="utf-8") != docx_markdown(book):
        failures.append(f"source: {DOCX_MD} is not derived from the book — run make docx")
    else:
        print(f"ok    source: {DOCX_MD} is derived from the book")
    for n, mmd, _ in figure_blocks(book):
        p = out / "figures" / f"figure-{n}.mmd"
        if not p.exists() or p.read_text(encoding="utf-8") != mmd:
            failures.append(f"source: figures/figure-{n}.mmd is not Figure {n}'s Mermaid block — run make figures")
    return failures


def check_figures(out: Path, margin: int = 2) -> list[str]:
    from PIL import Image, ImageChops

    failures = []
    book = (out / BOOK).read_text(encoding="utf-8")
    for n, _, _ in figure_blocks(book):
        p = out / "figures" / f"figure-{n}.png"
        if not p.exists():
            failures.append(f"figures: {p.name} is missing")
            continue
        img = Image.open(p).convert("RGB")
        l, t, r, b = ImageChops.difference(img, Image.new("RGB", img.size, (255, 255, 255))).getbbox() or (0, 0, 0, 0)
        w, h = img.size
        if l < margin or t < margin or r > w - margin or b > h - margin:
            failures.append(f"figures: {p.name} content touches the image edge — clipped render (FORCE={n} make figures)")
    if not failures:
        print("ok    figures: every PNG has a white margin (none clipped)")
    return failures


# -------------------------------------------------------------------- seed --

SEED_FIELDS = ("id", "name", "skills", "price", "rep", "status", "runs", "real")


def load_seed(source: str) -> list[dict]:
    """The `_SEED` list literal from app/seed.py, via ast (no import)."""
    for node in ast.walk(ast.parse(source)):
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        if any(isinstance(t, ast.Name) and t.id == "_SEED" for t in targets) and node.value is not None:
            rows = ast.literal_eval(node.value)
            bad = [r for r in rows if len(r) != len(SEED_FIELDS)]
            if bad:
                raise SystemExit(f"check: seed.py rows no longer have the {len(SEED_FIELDS)} fields {SEED_FIELDS}: {bad[0]}")
            return [dict(zip(SEED_FIELDS, r)) for r in rows]
    raise SystemExit("check: no _SEED list in seed.py")


def column_field(header: str) -> str | None:
    h = header.strip().lower()
    for key, field in (("id", "id"), ("name", "name"), ("skills", "skills"), ("price", "price"),
                       ("reputation", "rep"), ("status", "status"), ("runs", "runs"), ("real", "real")):
        if h == key or h.startswith(key + " ") or h.startswith(key + "?") or key == "reputation" and key in h:
            return field
    return None


def genesis_table(chapter_md: str) -> tuple[list[str], list[list[str]]]:
    """Header and rows of the §6.2 table: the first table whose header starts `id | name`."""
    cells = lambda line: [c.strip() for c in line.strip().strip("|").split("|")]  # noqa: E731
    lines = chapter_md.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("|") and [c.lower() for c in cells(line)][:2] == ["id", "name"]:
            rows = []
            for row in lines[i + 2:]:
                if not row.startswith("|"):
                    break
                rows.append(cells(row))
            return cells(line), rows
    raise SystemExit("check: no Genesis-agents table (header `| id | name | …`) in §6")


def cell_value(field: str, cell: str):
    c = cell.strip().strip("`")
    if field == "skills":
        return [s.strip() for s in c.split(",")]
    if field in ("price", "rep"):
        return Decimal(c)
    if field == "runs":
        return int(c.replace(",", ""))
    if field == "real":
        return {"✓": True, "✗": False}.get(c, c)
    return c


def check_seed(chapter_md: str, seed_source: str, where: str) -> list[str]:
    header, rows = genesis_table(chapter_md)
    fields = [column_field(h) for h in header]
    if None in fields:
        return [f"seed: §6.2 column '{header[fields.index(None)]}' has no seed.py field to check against"]
    seed = load_seed(seed_source)
    failures = []
    if len(rows) != len(seed):
        failures.append(f"seed: §6.2 has {len(rows)} rows, {where} has {len(seed)}")
    for k, (row, agent) in enumerate(zip(rows, seed), 1):
        for field, cell in zip(fields, row):
            want = agent[field]
            want = Decimal(repr(want)) if field in ("price", "rep") else want
            if cell_value(field, cell) != want:
                failures.append(f"seed: §6.2 row {k} ({agent['id']}) {field}: table has '{cell}', {where} has {agent[field]!r}")
    if not failures:
        print(f"ok    seed: §6.2 agrees with {where}, {len(seed)} rows × {len(fields)} columns")
    return failures


def seed_source(args) -> tuple[str | None, str]:
    if args.seed_file:
        return Path(args.seed_file).read_text(encoding="utf-8"), args.seed_file
    if args.seed_repo == "none":
        return None, ""
    spec = f"{args.seed_ref}:{args.seed_path}"
    r = subprocess.run(["git", "-C", args.seed_repo, "show", spec], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"check: cannot read {spec} from {args.seed_repo} (set SEED_REPO, or SEED_REPO=none to skip):\n{r.stderr}")
    sha = subprocess.run(["git", "-C", args.seed_repo, "rev-parse", "--short", args.seed_ref], capture_output=True, text=True).stdout.strip()
    return r.stdout, f"backend {args.seed_ref}@{sha}:{args.seed_path}"


# -------------------------------------------------------------------- main --

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check that every litepaper format agrees.")
    ap.add_argument("--out", type=Path, default=ROOT)
    ap.add_argument("--sections", type=Path, default=ROOT / "sections")
    ap.add_argument("--pandoc", default="pandoc")
    ap.add_argument("--section", action="append", help="chapter to compare across formats (repeatable; default 6)")
    ap.add_argument("--seed-repo", default=str(Path.home() / "Websites-Services-2026/orizon-agents-BE-Stellar"))
    ap.add_argument("--seed-ref", default="origin/main")
    ap.add_argument("--seed-path", default="app/seed.py")
    ap.add_argument("--seed-file", help="read seed.py from this file instead of git")
    args = ap.parse_args(argv)

    chapters = args.section or ["6"]
    failures = []
    for i, num in enumerate(chapters):
        failures += check_source(args.out, args.sections, num, full=(i == 0))
        failures += check_formats(args.out, args.pandoc, num)
    failures += check_figures(args.out)
    source, where = seed_source(args)
    if source is None:
        print("SKIP  seed: SEED_REPO=none")
    else:
        failures += check_seed(book_chapter((args.out / BOOK).read_text(encoding="utf-8"), "6")[0], source, where)
    for f in failures:
        print("FAIL  " + f)
    print(f"\n{'FAILED' if failures else 'PASSED'}: {len(failures)} disagreement(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
