#!/usr/bin/env python3
"""Self-contained .html -> .pdf via headless Chromium --print-to-pdf.

--virtual-time-budget gives Mermaid time to render its SVGs before the print
snapshot. Chrome stamps the wall-clock time into /CreationDate and /ModDate;
both are rewritten in place (same byte length, so the xref table stays valid)
to SOURCE_DATE_EPOCH, which defaults to midnight UTC on the cover's date.

Chrome also names each tagged-PDF structure element after its DOM node,
`(node00004895)`, in its /ID, in a table cell's /Headers and in the
StructTreeRoot's /IDTree. The node numbers can shift from run to run while
the text does not, so they are renumbered 1, 2, 3... in their numeric order,
zero-padded to the same width: same byte length, same sort order, so the
xref table and the /IDTree stay valid.

Usage: pdf.py OUT_DIR TMP_DIR
"""
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from common import BOOK, HTML, PDF, chrome, die, source_date_epoch

DATE_RE = re.compile(rb"/(CreationDate|ModDate) \(D:(\d{14})([^)]*)\)")
NODE_ID_RE = re.compile(rb"\(node(\d+)\)")


def pin_dates(pdf: bytes, epoch: int) -> bytes:
    stamp = datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y%m%d%H%M%S").encode()

    def fix(m: re.Match) -> bytes:
        tz = b"+00'00'"
        if len(m.group(3)) != len(tz):
            die(f"unexpected PDF date suffix {m.group(3)!r}")
        return b"/" + m.group(1) + b" (D:" + stamp + tz + b")"

    out, n = DATE_RE.subn(fix, pdf)
    if n != 2:
        die(f"expected a /CreationDate and a /ModDate in the PDF, found {n} dates")
    return out


def pin_node_ids(pdf: bytes) -> bytes:
    ids = sorted({int(m.group(1)) for m in NODE_ID_RE.finditer(pdf)})
    rank = {n: i + 1 for i, n in enumerate(ids)}

    def fix(m: re.Match) -> bytes:
        digits = m.group(1)
        new = str(rank[int(digits)]).zfill(len(digits)).encode()
        if len(new) != len(digits):
            die(f"cannot renumber (node{digits.decode()}) at the same length")
        return b"(node" + new + b")"

    return NODE_ID_RE.sub(fix, pdf)


def main() -> None:
    out, tmp = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    pdf = out / PDF
    pdf.unlink(missing_ok=True)
    chrome(
        [
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=40000",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf}",
            (out / HTML).as_uri(),
        ],
        tmp,
    )
    if not pdf.exists():
        die("chrome did not write the PDF")
    epoch = source_date_epoch((out / BOOK).read_text(encoding="utf-8"))
    pdf.write_bytes(pin_node_ids(pin_dates(pdf.read_bytes(), epoch)))


if __name__ == "__main__":
    main()
