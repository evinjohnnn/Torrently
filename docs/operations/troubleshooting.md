# Operations and troubleshooting

Use `scripts/health.sh` for service state, sanitized health and resource counters. `docker compose logs --tail=100 app webtor` exposes service-prefixed logs; review privately because filenames and signed query strings can be sensitive. Do not share `.env`, full Compose rendered configuration, cookies, keys or raw stream URLs.

* **App offline:** inspect app/DB health, ensure `DATABASE_URL` points to the separate PostgreSQL service, verify migration output and restart policy. Do not delete the volume to clear a migration failure.
* **Backend unavailable or missing key:** complete private bootstrap. Profile API credentials are distinct from internal signing secrets. `/api/v1` requires Bearer authentication. Never restore obsolete unauthenticated `/rest-api/` proxy routes.
* **Metadata never resolves:** validate the exact infohash, fixture seeder and trackers; inspect outbound DNS/TCP/UDP and ISP policy. A valid magnet can have no live peers. Readiness of the login page does not imply swarm reachability.
* **Files resolve, video fails:** verify export-signature-compatible upstream assembly, correct `DOMAIN` and URL rewriting, content-prober service and actual codecs. Inspect CPU/transcoder logs. Direct MP4 working does not prove MKV/HLS transcoding.
* **HLS seeks fail:** inspect manifest/segment proxy paths, Range/206 behavior, cookie authorization, token expiry and piece availability. Do not buffer entire media into Node memory.
* **Embedded S3 idles:** inspect `[s3]` logs and confirm `/storage` is a named volume with working xattrs. Restore metadata with GNU `tar --xattrs`; ordinary recursive copies are insufficient.
* **Storage pressure:** run `scripts/check-disk.sh`, inspect per-filesystem `df` and volume growth, verify cleaner logs. Pause new work. Cache `/data` is disposable; databases and `/storage` are not. Cleaner cannot compensate for permanent storage outside its managed area or other services filling the disk.
* **Memory/CPU pressure:** lower stream/download/transcode caps, disable video transcoding temporarily with the documented upstream flag if needed, then investigate measured load. A Compose memory cap can still trigger OOM and interrupt playback; it is a last containment boundary, not a performance guarantee.
* **Public login loops:** verify `PUBLIC_ORIGIN`, HTTPS, `COOKIE_SECURE`, proxy Host/forwarded headers and clock. Do not disable authentication to make a proxy work.

Lightweight monitoring uses built-in app counters plus Docker/kernel tools. Use an external uptime check only after public exposure is approved. Logs are capped at 30 MB/service, but container image/build caches are separate: inspect `docker system df`; do not run indiscriminate prune commands. Backups, SMART status, thermals, disk reserve and security updates need periodic owner review.
