#!/usr/bin/env bash
# No credentials or configuration dumps. Logs can still contain torrent names.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose ps
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(JSON.stringify(await r.json()));process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}'
df -h .
du -sh data/torrent-cache 2>/dev/null || true
