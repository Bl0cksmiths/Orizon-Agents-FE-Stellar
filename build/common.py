"""Shared helpers for the litepaper build scripts."""
from __future__ import annotations

import glob
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOK = "Orizon-Agents-Litepaper.md"
DOCX_MD = "Orizon-Agents-Litepaper-docx.md"
HTML = "Orizon-Agents-Litepaper.html"
PDF = "Orizon-Agents-Litepaper.pdf"
DOCX = "Orizon-Agents-Litepaper.docx"
TITLE = "The Orizon Agents Protocol Litepaper"

MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
MERMAID_JS = ROOT / "build" / "vendor" / "mermaid-10.9.6.min.js"
MERMAID_RE = re.compile(r"```mermaid\n(.*?)\n```", re.DOTALL)

# Fonts the v0.4 PDF and figures were rendered with (Windows Chrome): Segoe UI
# for text, Consolas for code. On WSL they are read from the Windows install so
# a Linux render matches; elsewhere Chrome falls back to the system fonts.
# Glyphs Segoe UI lacks (✓, ✗) still fall back to a Linux font (DejaVu Sans)
# rather than Windows' Segoe UI Symbol: fontconfig's fallback ranks charset
# coverage above family preference, and a strong family rule would override
# explicit families such as Consolas.
DEFAULT_FONT_DIRS = ["/mnt/c/Windows/Fonts"]


def die(msg: str) -> None:
    sys.exit(f"build: {msg}")


def cover_date(book_text: str) -> str:
    m = re.search(r"^\*\*Version\*\* \S+ · \*\*Date\*\* (\d{4}-\d{2}-\d{2})$", book_text, re.M)
    if not m:
        die("the cover has no '**Version** X · **Date** YYYY-MM-DD' line")
    return m.group(1)


def source_date_epoch(book_text: str) -> int:
    """SOURCE_DATE_EPOCH if set, else midnight UTC on the cover's date."""
    if os.environ.get("SOURCE_DATE_EPOCH"):
        return int(os.environ["SOURCE_DATE_EPOCH"])
    d = datetime.strptime(cover_date(book_text), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(d.timestamp())


def find_chrome() -> str:
    """$CHROME, else the newest Playwright headless shell or Chromium, else PATH."""
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    # chrome-headless-shell first: the full Chromium hangs on --print-to-pdf
    # under WSL (even for a one-line page), the headless shell does not.
    pw = Path.home() / ".cache/ms-playwright"
    for pattern in ("chromium_headless_shell-*/chrome-*/chrome-headless-shell", "chromium-*/chrome-linux*/chrome"):
        found = glob.glob(str(pw / pattern))
        found.sort(key=lambda p: int(re.search(r"-(\d+)/", p).group(1)))
        if found:
            return found[-1]
    for name in ("chromium", "chromium-browser", "google-chrome", "chrome"):
        if shutil.which(name):
            return shutil.which(name)
    die("no Chrome/Chromium found; set CHROME=/path/to/chrome")
    return ""


def chrome_env(tmp: Path) -> dict:
    """Environment for Chrome: a fontconfig that adds the Windows fonts dir."""
    env = dict(os.environ)
    dirs = os.environ.get("FONT_DIRS")
    dirs = dirs.split(":") if dirs is not None else DEFAULT_FONT_DIRS
    dirs = [d for d in dirs if d and Path(d).is_dir()]
    if dirs:
        conf = tmp / "fonts.conf"
        tmp.mkdir(parents=True, exist_ok=True)
        conf.write_text(
            '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
            '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
            + "".join(f"  <dir>{d}</dir>\n" for d in dirs)
            + f"  <cachedir>{tmp / 'fontcache'}</cachedir>\n</fontconfig>\n"
        )
        env["FONTCONFIG_FILE"] = str(conf)
    return env


def chrome(args: list[str], tmp: Path, timeout: int = 180) -> None:
    profile = tmp / "chrome-profile"
    shutil.rmtree(profile, ignore_errors=True)
    cmd = [
        find_chrome(),
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        f"--user-data-dir={profile}",
        *args,
    ]
    r = subprocess.run(cmd, env=chrome_env(tmp), capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        die(f"chrome failed ({r.returncode}):\n{r.stderr[-2000:]}")


def local_mermaid(html: str, uri: bool = True) -> str:
    """Point a page at the vendored Mermaid runtime instead of the CDN.

    `uri` gives a file:// URL (for Chrome); otherwise a plain path (for pandoc).
    """
    if MERMAID_CDN not in html:
        die(f"expected the Mermaid CDN URL {MERMAID_CDN} to swap for the vendored copy")
    return html.replace(MERMAID_CDN, MERMAID_JS.as_uri() if uri else str(MERMAID_JS))
