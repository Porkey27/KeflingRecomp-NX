#!/usr/bin/env python3
"""validate_manifest.py — Sanity-check the prepared game/ directory.

Usage:
    python3 validate_manifest.py <game_dir> <title_id>

Exits 0 on success, 1 on failure.
"""

import sys
import os
import hashlib

TITLE_ID = "584109DE"

# Minimum required paths relative to game_dir
REQUIRED = [
    "default.xex",
    "media",
]

# Optional but warn if missing
OPTIONAL = [
    "audio_opus",
    "shaders_spv",
]

# Known XEX header magic
XEX2_MAGIC = b"XEX2"


def check_xex(path: str) -> bool:
    with open(path, "rb") as f:
        magic = f.read(4)
    if magic != XEX2_MAGIC:
        print(f"[validate] FAIL: {path} does not look like a valid XEX2 binary "
              f"(magic={magic!r}, expected {XEX2_MAGIC!r})")
        return False
    print(f"[validate] OK  : XEX2 magic confirmed")
    return True


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <game_dir> <title_id>")
        sys.exit(1)

    game_dir = sys.argv[1]
    title_id = sys.argv[2].upper()

    if title_id != TITLE_ID:
        print(f"[validate] WARN: title ID {title_id} does not match expected "
              f"{TITLE_ID} — this may not be A World of Keflings")

    ok = True

    for rel in REQUIRED:
        full = os.path.join(game_dir, rel)
        if not os.path.exists(full):
            print(f"[validate] FAIL: missing required path: {full}")
            ok = False
        else:
            print(f"[validate] OK  : {rel}")

    for rel in OPTIONAL:
        full = os.path.join(game_dir, rel)
        if not os.path.exists(full):
            print(f"[validate] WARN: optional path missing: {rel} "
                  f"(audio/shader fallbacks will be used)")

    xex_path = os.path.join(game_dir, "default.xex")
    if os.path.isfile(xex_path):
        ok = check_xex(xex_path) and ok

    if ok:
        print("[validate] All checks passed.")
        sys.exit(0)
    else:
        print("[validate] One or more checks failed — see above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
