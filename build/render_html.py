#!/usr/bin/env python3
"""Book .md -> self-contained .html via pandoc, exactly as v0.4 was built.

The one change from the recorded command: mermaid-init.html loads Mermaid from
the floating `mermaid@10` CDN URL, which pandoc inlines at build time. That
pulled 10.9.6 for v0.4 and pulls 10.9.8 today, so the build swaps the URL for
the vendored 10.9.6 copy: no network, and the same bytes every run.

Usage: html.py OUT_DIR PANDOC TMP_DIR
"""
import subprocess
import sys
from pathlib import Path

from common import BOOK, HTML, ROOT, TITLE, local_mermaid

PAGEBREAK_DIV = '<div style="page-break-before: always; break-before: page; height: 0;"></div>'


def main() -> None:
    out, pandoc, tmp = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve()
    tmp.mkdir(parents=True, exist_ok=True)
    src = tmp / "litepaper-html-src.md"
    src.write_text((out / BOOK).read_text(encoding="utf-8").replace("<!-- pagebreak -->", PAGEBREAK_DIV), encoding="utf-8")
    init = tmp / "mermaid-init.html"
    init.write_text(local_mermaid((ROOT / "mermaid-init.html").read_text(encoding="utf-8"), uri=False), encoding="utf-8")
    subprocess.run(
        [
            pandoc, str(src),
            "-o", str(out / HTML),
            "--from=markdown+raw_html+definition_lists+pipe_tables+fenced_code_attributes",
            "--to=html5",
            "--standalone",
            "--embed-resources",
            "--css=litepaper.css",
            f"--include-after-body={init}",
            "--metadata", f"title={TITLE}",
            "--metadata", "lang=en",
        ],
        cwd=ROOT,
        check=True,
    )


if __name__ == "__main__":
    main()
