#!/usr/bin/env bash
# Read-only alert for filesystem reserve. Webtor's own cleaner performs eviction.
set -euo pipefail
cache_path="${1:-./data/torrent-cache}"
reserve_percent="${2:-25}"
if ! [[ "$reserve_percent" =~ ^[0-9]+$ ]] || (( reserve_percent < 1 || reserve_percent > 99 )); then echo 'Reserve must be 1..99 percent.' >&2; exit 2; fi
used=$(df -P "$cache_path" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if (( used >= 100 - reserve_percent )); then
  echo "Storage reserve reached: ${used}% used on cache filesystem. Pause new work, inspect upstream cleaner logs and persistent storage." >&2
  exit 1
fi
printf 'Cache filesystem %s%% used; reserve %s%% available.\n' "$used" "$reserve_percent"
