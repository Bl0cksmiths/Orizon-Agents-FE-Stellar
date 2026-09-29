#!/usr/bin/env python3
"""Book Mermaid blocks -> figures/figure-N.{mmd,png} and figures/html/figure-N.html.

N is the figure's caption number (see common.figure_blocks). Each block is
wrapped in build/figure.html, screenshotted by headless Chromium at 2x device
scale, and trimmed to 30 px of white margin with Pillow.

A PNG is re-rendered only when its .mmd changed or the PNG is missing, or when
FORCE names it (FORCE=all, or FORCE=2,5). The v0.4 PNGs came from Windows
Chrome and a re-render matches them in size but not byte for byte, so an
unchanged diagram keeps its PNG. A render whose content reaches the window
edge is refused: v0.4's Figure 2 was cut off that way.

Usage: figures.py OUT_DIR TMP_DIR
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops

from common import BOOK, ROOT, chrome, die, figure_blocks, local_mermaid

WINDOW = (1400, 5000)  # CSS px; figure 2 renders ~4000 px tall on this Chromium
SCALE = 2
PAD = 30


def trim(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGB")
    bbox = ImageChops.difference(img, Image.new("RGB", img.size, (255, 255, 255))).getbbox()
    if not bbox:
        die(f"{src.name} rendered blank (Mermaid failed?)")
    l, t, r, b = bbox
    if r >= img.size[0] - 1 or b >= img.size[1] - 1:
        die(f"{dst.name} is clipped at the window edge; raise WINDOW in build/figures.py")
    img.crop((max(0, l - PAD), max(0, t - PAD), min(img.size[0], r + PAD), min(img.size[1], b + PAD))).save(dst)


def main() -> None:
    out, tmp = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    force = os.environ.get("FORCE", "").strip()
    force_all = force == "all"
    forced = {int(x) for x in force.split(",") if x.strip().isdigit()}
    template = (ROOT / "build" / "figure.html").read_text(encoding="utf-8")
    figs = out / "figures"
    (figs / "html").mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)
    wanted = set()
    for n, mmd, _ in figure_blocks((out / BOOK).read_text(encoding="utf-8")):
        mmd_path, png = figs / f"figure-{n}.mmd", figs / f"figure-{n}.png"
        wrapper = template.replace("{{MERMAID}}", mmd)
        wanted |= {mmd_path.name, png.name, f"figure-{n}.html"}
        changed = not mmd_path.exists() or mmd_path.read_text(encoding="utf-8") != mmd
        mmd_path.write_text(mmd, encoding="utf-8")
        (figs / "html" / f"figure-{n}.html").write_text(wrapper, encoding="utf-8")
        if not (force_all or n in forced or changed or not png.exists()):
            print(f"figure-{n}: unchanged, kept {png.name}")
            continue
        page = tmp / f"figure-{n}.html"
        page.write_text(local_mermaid(wrapper), encoding="utf-8")
        shot = tmp / f"figure-{n}.raw.png"
        shot.unlink(missing_ok=True)
        chrome(
            [
                "--hide-scrollbars",
                f"--window-size={WINDOW[0]},{WINDOW[1]}",
                f"--force-device-scale-factor={SCALE}",
                "--virtual-time-budget=15000",
                f"--screenshot={shot}",
                page.as_uri(),
            ],
            tmp,
        )
        trim(shot, png)
        print(f"figure-{n}: rendered {png.name}")
    stale = [p for p in list(figs.glob("figure-*")) + list((figs / "html").glob("figure-*")) if p.name not in wanted]
    for p in stale:
        p.unlink()
        print(f"removed stale {p.relative_to(out)}")


if __name__ == "__main__":
    main()
