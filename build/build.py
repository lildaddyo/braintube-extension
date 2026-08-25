#!/usr/bin/env python3
"""Dual-target build for the BrainTube extension.

Assembles dist-chrome/ and dist-firefox/ from one shared source tree. The
two outputs differ ONLY in manifest.json — every other file is copied
byte-for-byte identically into both targets from the same source files.

    python build/build.py
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SHARED_FILES = [
    "popup.html",
    "sidepanel.html",
    "auth.html",
]
SHARED_DIRS = [
    "icons",
    "fonts",
    "scripts",
    "styles",
]

TARGETS = {
    "chrome": ROOT / "manifest.json",
    "firefox": ROOT / "manifest.firefox.json",
}


def build(target: str, manifest_src: pathlib.Path) -> pathlib.Path:
    dist = ROOT / f"dist-{target}"
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir(parents=True)

    shutil.copy2(manifest_src, dist / "manifest.json")

    for name in SHARED_FILES:
        shutil.copy2(ROOT / name, dist / name)

    for name in SHARED_DIRS:
        shutil.copytree(ROOT / name, dist / name)

    return dist


def main() -> int:
    for target, manifest_src in TARGETS.items():
        if not manifest_src.exists():
            print(f"ERROR: missing {manifest_src}", file=sys.stderr)
            return 1
        dist = build(target, manifest_src)
        n_files = sum(1 for p in dist.rglob("*") if p.is_file())
        print(f"built {target}: {dist} ({n_files} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
