#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RAW_DIR="$ROOT_DIR/data/raw"
VERSION="${CADASTRE_VERSION:-2025-12-01}"
BASE_URL="https://cadastre.data.gouv.fr/data/etalab-cadastre/${VERSION}/geojson/departements"

mkdir -p "$RAW_DIR"

if [ "$#" -gt 0 ]; then
  DEPARTMENTS=("$@")
else
  DEPARTMENTS=(75 69 13)
fi

echo "Cadastre version: $VERSION"
echo "Departments: ${DEPARTMENTS[*]}"

for dep in "${DEPARTMENTS[@]}"; do
  gz_file="$RAW_DIR/cadastre-${dep}-batiments.json.gz"
  json_file="$RAW_DIR/cadastre-${dep}-batiments.json"
  url="$BASE_URL/$dep/cadastre-${dep}-batiments.json.gz"

  echo "Downloading $url"
  curl -fL "$url" -o "$gz_file"

  echo "Extracting -> $json_file"
  gunzip -c "$gz_file" > "$json_file"

  size="$(du -h "$json_file" | awk '{print $1}')"
  echo "Ready: $json_file ($size)"
done
