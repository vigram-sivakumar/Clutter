#!/usr/bin/env python3
"""Compare two app bundle trees without following symbolic links.

This checks entry types, directory membership, regular file bytes and literal
symlink targets. It complements, rather than replaces, codesign verification.
"""
import filecmp
import os
from pathlib import Path
import stat
import sys


def compare(source: Path, copy: Path) -> None:
    a, b = source.lstat(), copy.lstat()
    kind = stat.S_IFMT(a.st_mode)
    if kind != stat.S_IFMT(b.st_mode):
        raise ValueError(f"Bundle entry type mismatch: {source}")
    if stat.S_ISLNK(kind):
        if os.readlink(source) != os.readlink(copy):
            raise ValueError(f"Bundle symlink mismatch: {source}")
    elif stat.S_ISDIR(kind):
        names = {p.name for p in source.iterdir()}
        if names != {p.name for p in copy.iterdir()}:
            raise ValueError(f"Bundle directory entries mismatch: {source}")
        for name in sorted(names):
            compare(source / name, copy / name)
    elif stat.S_ISREG(kind):
        if not filecmp.cmp(source, copy, shallow=False):
            raise ValueError(f"Bundle file mismatch: {source}")
    else:
        raise ValueError(f"Unsupported bundle entry: {source}")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: compare-bundles.py ORIGINAL.app COPY.app")
    source, copy = map(Path, sys.argv[1:])
    try:
        if not all(stat.S_ISDIR(p.lstat().st_mode) for p in (source, copy)):
            raise ValueError("Both bundle roots must be actual directories")
        compare(source, copy)
    except (OSError, ValueError) as error:
        raise SystemExit(str(error)) from None
    print("Verified app bundle bytes and symlink targets")


if __name__ == "__main__":
    main()
