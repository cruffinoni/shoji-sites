#!/usr/bin/env python3
"""Rebuild Momentum's public dist/ tree from web/."""
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "web"
TARGET = ROOT / "dist"
STAGING = ROOT / ".dist-staging"


def main() -> None:
    if not (SOURCE / "index.html").is_file():
        raise SystemExit("web/index.html is required")

    if STAGING.exists():
        shutil.rmtree(STAGING)
    shutil.copytree(SOURCE, STAGING)

    html = [path for path in STAGING.rglob("*") if path.is_file() and path.suffix.lower() in {".html", ".htm"}]
    if len(html) != 1 or html[0].parent != STAGING or html[0].name != "index.html":
        raise SystemExit("published site must contain exactly one root index.html")

    if TARGET.exists():
        shutil.rmtree(TARGET)
    STAGING.rename(TARGET)
    print(f"published {sum(1 for path in TARGET.rglob('*') if path.is_file())} files to {TARGET}")


if __name__ == "__main__":
    main()
