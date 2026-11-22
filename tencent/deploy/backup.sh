#!/usr/bin/env bash
# Consistent online backup of the SQLite DB (safe while the service is running).
set -euo pipefail
OUT="${1:-/opt/pixelhoops/backup}"; mkdir -p "$OUT"
F="$OUT/pixelhoops-$(date +%Y%m%d-%H%M%S).db"
sqlite3 /opt/pixelhoops/data/pixelhoops.db ".backup '$F'"
gzip -f "$F"; ls -1t "$OUT"/*.gz | tail -n +15 | xargs -r rm -f   # keep the 14 newest
echo "$F.gz"
