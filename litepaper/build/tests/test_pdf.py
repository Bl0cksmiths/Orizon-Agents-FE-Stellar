"""Tests for build/pdf.py's normalisation of Chrome's run-to-run PDF bytes."""
import sys
from pathlib import Path

BUILD = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BUILD))

from pdf import pin_node_ids  # noqa: E402


def tagged(a: int, b: int, c: int) -> bytes:
    """A struct-tree fragment as Chrome writes it, with DOM node ids a < b < c."""
    return (
        b"<</Type /StructElem\n/S /TH\n/ID (node%08d)>>\n"
        b"<</Type /StructElem\n/S /TH\n/ID (node%08d)>>\n"
        b"<</O /Table\n/Headers [(node%08d) (node%08d)]>>\n"
        b"<</Names [(node%08d) 1 0 R (node%08d) 2 0 R (node%08d) 3 0 R]>>\n"
    ) % (a, b, a, b, a, b, c)


def test_renumbers_node_ids_the_same_whatever_chrome_numbered_them():
    assert pin_node_ids(tagged(35, 36, 4895)) == pin_node_ids(tagged(41, 902, 4930))


def test_keeps_the_byte_length_and_the_order():
    before = tagged(35, 36, 4895)
    after = pin_node_ids(before)
    assert len(after) == len(before)
    assert after == tagged(1, 2, 3)


def test_leaves_a_pdf_without_node_ids_alone():
    pdf = b"%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj\n"
    assert pin_node_ids(pdf) == pdf
