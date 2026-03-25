#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEP="${1:-75}"
SRC="$ROOT_DIR/data/raw/cadastre-${DEP}-batiments.json"

if [ ! -f "$SRC" ]; then
  echo "Missing source file: $SRC"
  echo "Run: ./scripts/download_data.sh $DEP"
  exit 1
fi

TARGETS=(
  "$ROOT_DIR/apps/next-map/public/data"
  "$ROOT_DIR/apps/nuxt-map/public/data"
  "$ROOT_DIR/apps/angular-map/public/data"
  "$ROOT_DIR/apps/streamlit-map/static/data"
)

for dir in "${TARGETS[@]}"; do
  mkdir -p "$dir"
  cp "$SRC" "$dir/cadastre-batiments.json"
  echo "Copied to $dir/cadastre-batiments.json"
done
