#!/usr/bin/env python3
"""Book .md -> Orizon-Agents-Litepaper-docx.md -> .docx via pandoc.

The intermediate is the book with each Mermaid block swapped for
`![Figure N](figures/figure-N.png)` (N = caption number). The date metadata is
the cover's date, and SOURCE_DATE_EPOCH (default: that date, midnight UTC)
pins the timestamps pandoc writes into the .docx zip and docProps.

Usage: docx.py OUT_DIR PANDOC
"""
import os
import subprocess
import sys
from pathlib import Path

from common import BOOK, DOCX, DOCX_MD, TITLE, cover_date, docx_markdown, source_date_epoch


def main() -> None:
    out, pandoc = Path(sys.argv[1]).resolve(), sys.argv[2]
    book = (out / BOOK).read_text(encoding="utf-8")
    (out / DOCX_MD).write_text(docx_markdown(book), encoding="utf-8")
    env = dict(os.environ, SOURCE_DATE_EPOCH=str(source_date_epoch(book)))
    subprocess.run(
        [
            pandoc, DOCX_MD,
            "-o", DOCX,
            "--metadata", f"title={TITLE}",
            "--metadata", "author=The Blocksmiths",
            "--metadata", f"date={cover_date(book)}",
        ],
        cwd=out,
        env=env,
        check=True,
    )


if __name__ == "__main__":
    main()
