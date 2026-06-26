#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/extension/edge-companion"
OUT_DIR="$ROOT/backend/app/extension_dist"
UNPACKED_DIR="$OUT_DIR/startboard-edge-companion"
ZIP_PATH="$OUT_DIR/startboard-edge-companion.zip"

[[ -d "$SRC_DIR" ]] || { echo "Missing extension source at $SRC_DIR" >&2; exit 1; }

rm -rf "$UNPACKED_DIR" "$ZIP_PATH"
mkdir -p "$OUT_DIR"
cp -R "$SRC_DIR" "$UNPACKED_DIR"

python3 - <<'PY' "$UNPACKED_DIR" "$ZIP_PATH"
from pathlib import Path
import sys
import zipfile

src = Path(sys.argv[1])
zip_path = Path(sys.argv[2])
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(src.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(src))
PY

echo "Packaged Edge extension:"
echo "  unpacked: $UNPACKED_DIR"
echo "  zip:      $ZIP_PATH"
