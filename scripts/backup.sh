#!/usr/bin/env bash
# Writes an offline-consistent backup; briefly stops app and Webtor.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# != 1 ]]; then echo 'Usage: scripts/backup.sh /absolute/private/backup-directory' >&2; exit 2; fi
case "$1" in /*) ;; *) echo 'Use an absolute backup path.' >&2; exit 2;; esac
umask 077
backup_dir="$1/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
# Pre-pull so downtime does not include image downloads.
docker compose --profile maintenance pull backup
running_services=()
while IFS= read -r service; do
  case "$service" in app|webtor) running_services+=("$service");; esac
done < <(docker compose ps --services --status running)
restore_running_services() {
  if (( ${#running_services[@]} )); then docker compose start "${running_services[@]}" >/dev/null; fi
}
trap restore_running_services EXIT
# Stop writers first. No cache is deleted; previously stopped services stay stopped.
if (( ${#running_services[@]} )); then docker compose stop "${running_services[@]}"; fi
docker compose exec -T postgres pg_dump -U torrently -d torrently -Fc > "$backup_dir/torrently.pgdump"
docker compose --profile maintenance run --rm --no-deps -T backup --xattrs --acls --numeric-owner -czf - -C /snapshot app-data webtor-pgdata webtor-storage > "$backup_dir/persistent.tar.gz"
cp .env "$backup_dir/environment.private"
chmod 600 "$backup_dir/"*
git rev-parse HEAD > "$backup_dir/source-commit.txt"
( cd "$backup_dir"; shasum -a 256 torrently.pgdump persistent.tar.gz environment.private source-commit.txt > SHA256SUMS )
printf 'Backup completed at %s; contains secrets. Encrypt and copy off this disk.\n' "$backup_dir"
