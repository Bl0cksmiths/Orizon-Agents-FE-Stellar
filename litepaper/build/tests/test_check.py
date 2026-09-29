"""Tests for build/check.py: agreement passes, and each kind of drift fails.

A small litepaper (cover, §6 with a Genesis table, §7) is built once through
the real pipeline (assemble, render_html, pdf, docx) into a temp directory.
Needs pandoc (PANDOC, default: PATH, then ~/bin/pandoc) and a Chromium.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

BUILD = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BUILD))

import check  # noqa: E402
from common import BOOK, DOCX, DOCX_MD, HTML  # noqa: E402

PANDOC = os.environ.get("PANDOC") or shutil.which("pandoc") or str(Path.home() / "bin/pandoc")

COVER = """# The Orizon Agents Protocol Litepaper

> **Pay-per-workflow agent commerce on Stellar.**

---

**Version** 9.9 · **Date** 2026-09-29
**By** The Blocksmiths
"""

SIX = """# §6 · Operations and Governance

The protocol works only as well as the people who run it. The “settler” can’t move funds.

## 6.1 · Roles

- **Buyer.** Anyone with a Stellar testnet wallet, funded with XLM. See <https://stellar.org>.
- **Settler.** The address `PaymentEscrow` accepts as the caller of `charge`.

## 6.2 · Genesis agents

| id | name | skills | price (USDC) | starting reputation | runs (seed) | real? |
| --- | --- | --- | :---: | :---: | :---: | :---: |
| `agt_01h8` | `copywrite.v3` | copy, seo, en | 0.012 | 4.92 | 18,420 | ✓ |
| `agt_03d9` | `code.next` | ts, react, next | 0.066 | 4.90 | 24,610 | ✗ |

## 6.3 · Agent onboarding

1. Build a worker implementing the `Worker` interface.
2. Sign and submit a `register` XDR for the `AgentRegistry` contract.
3. The agent is now addressable on chain.

The admin slot cannot delete an agent or invalidate an attestation; that power would let an operator rewrite history.

Operators who want the house orchestrator to route to them have to earn reputation first.
"""

SEVEN = """# §7 · Economics

The next chapter is the money.
"""

SEED = '''from .schemas import Agent

# id → (name, skills, price, rep, status, runs, real)
_SEED: list[tuple[str, str, list[str], float, float, str, int, bool]] = [
    ("agt_01h8", "copywrite.v3", ["copy", "seo", "en"], 0.012, 4.92, "online", 18420, True),
    ("agt_03d9", "code.next", ["ts", "react", "next"], 0.066, 4.9, "online", 24610, False),
]
'''


def run(*args):
    subprocess.run([sys.executable, *map(str, args)], check=True, cwd=BUILD.parent)


@pytest.fixture(scope="session")
def built(tmp_path_factory):
    """The fixture litepaper, built through the real pipeline."""
    root = tmp_path_factory.mktemp("litepaper")
    sections = root / "sections"
    sections.mkdir()
    (sections / "00-front-matter.md").write_text(COVER)
    (sections / "06-operations-governance.md").write_text(SIX)
    (sections / "07-economics.md").write_text(SEVEN)
    (root / "seed.py").write_text(SEED)
    out, tmp = root / "out", root / "tmp"
    run(BUILD / "assemble.py", "--sections", sections, "--out", out / BOOK)
    run(BUILD / "render_html.py", out, PANDOC, tmp / "html")
    run(BUILD / "pdf.py", out, tmp / "pdf")
    run(BUILD / "docx.py", out, PANDOC)
    return root


@pytest.fixture
def copy(built, tmp_path):
    """A disposable copy of the fixture to break."""
    dst = tmp_path / "lp"
    shutil.copytree(built, dst)
    return dst


def main(root, seed="seed.py"):
    return check.main(["--out", str(root / "out"), "--sections", str(root / "sections"),
                       "--pandoc", PANDOC, "--seed-file", str(root / seed)])


def test_agreement_passes(built, capsys):
    assert main(built) == 0
    out = capsys.readouterr().out
    for fmt in ("html", "pdf", "docx"):
        assert f"ok    {fmt}: §6 matches the book" in out
    assert "ok    source: the book's §6 equals sections/06-operations-governance.md" in out
    assert "ok    seed: §6.2 agrees with" in out


def test_hand_edited_html_fails(copy, capsys):
    html = copy / "out" / HTML
    text = html.read_text()
    assert text.count("rewrite history") == 1
    html.write_text(text.replace("rewrite history", "rewrite the ledger"))
    assert main(copy) == 1
    out = capsys.readouterr().out
    assert "FAIL  html: §6 differs from the book" in out
    assert "[[history.]]" in out and "[[the]]" in out
    assert "FAIL  pdf" not in out and "FAIL  docx" not in out


def test_docx_missing_a_paragraph_fails(copy, capsys):
    out_dir = copy / "out"
    md = (out_dir / DOCX_MD).read_text()
    para = "Operators who want the house orchestrator to route to them have to earn reputation first.\n"
    assert para in md
    (out_dir / "short.md").write_text(md.replace(para, ""))
    subprocess.run([PANDOC, "short.md", "-o", DOCX], cwd=out_dir, check=True)
    assert main(copy) == 1
    out = capsys.readouterr().out
    assert "FAIL  docx: §6 differs from the book" in out
    assert "[[Operators]]" in out and "[[<end of §>]]" in out


def test_pdf_printed_from_a_stale_html_fails(copy, capsys):
    html = copy / "out" / HTML
    good = html.read_text()
    assert "can’t move funds" in good
    html.write_text(good.replace("can’t move funds", "can move funds"))
    run(BUILD / "pdf.py", copy / "out", copy / "tmp" / "pdf2")
    html.write_text(good)  # the html is right again; only the pdf is stale
    assert main(copy) == 1
    assert "FAIL  pdf: §6 differs from the book" in capsys.readouterr().out


def test_no_pdf_chapter_skips_only_the_pdf(copy, capsys):
    html = copy / "out" / HTML
    good = html.read_text()
    html.write_text(good.replace("can’t move funds", "can move funds"))
    run(BUILD / "pdf.py", copy / "out", copy / "tmp" / "pdf2")
    html.write_text(good)  # a stale pdf, as above, but §6 is compared without it
    assert check.main(["--out", str(copy / "out"), "--sections", str(copy / "sections"),
                       "--pandoc", PANDOC, "--seed-file", str(copy / "seed.py"),
                       "--no-pdf", "6"]) == 0
    out = capsys.readouterr().out
    assert "SKIP  pdf: §6" in out
    assert "ok    html: §6 matches the book" in out and "ok    docx: §6 matches the book" in out


def test_hand_edited_book_fails(copy, capsys):
    book = copy / "out" / BOOK
    book.write_text(book.read_text().replace("The agent is now addressable", "The agent is addressable"))
    assert main(copy) == 1
    out = capsys.readouterr().out
    assert "FAIL  source: the book's §6 is not 06-operations-governance.md" in out
    assert "FAIL  source: the book differs from assemble(sections)" in out


def test_seed_row_mismatch_fails(copy, capsys):
    (copy / "seed2.py").write_text(SEED.replace("0.066, 4.9,", "0.067, 4.9,"))
    assert main(copy, "seed2.py") == 1
    assert "FAIL  seed: §6.2 row 2 (agt_03d9) price: table has '0.066'" in capsys.readouterr().out


def test_seed_row_missing_fails(copy, capsys):
    extra = '    ("agt_99zz", "new.one", ["x"], 0.001, 4.0, "online", 1, True),\n]'
    (copy / "seed3.py").write_text(SEED.replace("\n]", "\n" + extra))
    assert main(copy, "seed3.py") == 1
    assert "FAIL  seed: §6.2 has 2 rows" in capsys.readouterr().out


def test_seed_equal_values_in_other_spellings_pass(copy, capsys):
    # 4.90 in the table is 4.9 in Python; 18,420 is 18420; ✓ is True.
    assert main(copy) == 0


def test_pdf_text_normalises_ligatures_quotes_and_hyphenation():
    # What pypdf hands back from a Chrome PDF, against the book's words.
    pdf = check.words("The ﬁrst “settler” can’t move funds; multi-\nsig non-upgrad­eable")
    book = check.words('The first "settler" can\'t move funds; multisig non-upgradeable')
    assert check.first_divergence(book, pdf, loose=True) is None
    assert check.first_divergence(book, pdf) is not None  # only the PDF is loose on hyphens
    assert check.first_divergence(book, check.words("The first settler")) == (2, 2)
