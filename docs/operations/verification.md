# Verification and performance acceptance

Local development checks can validate TypeScript, request validation and database behavior without a torrent engine. They do not establish streaming parity. This development Mac has Node and FFmpeg but no Docker/Go, and the Predator laptop was not connected. No Linux container boot, swarm traffic, hardware transcode or residential bandwidth result should be inferred from unit/UI tests.

On the target-compatible Docker host:

```sh
docker compose config --quiet
docker compose build
docker compose up -d
scripts/health.sh
scripts/check-disk.sh "./data/torrent-cache" 25
```

Use the privately provisioned Webtor API key. In a sibling checkout of the pinned `webtor-io/self-hosted` SHA, execute `tests/run.sh torrently-webtor:dbab88e` to verify upstream boot, real controlled torrent fixture, DDL/Range, ZIP, direct HLS, transcode, subtitles, S3 and restart persistence. Read its fixture scripts first. Tests create and tear down their own containers; use an isolated Docker project/host and unused ports. These are own-deployment tests, never load against Webtor.io. Preserve test output with secrets removed.

For Torrently acceptance, use its tests and browser checklist against the deployed stack:

| Check | Required evidence |
|---|---|
| Authentication | Unauthenticated torrent/media/library rejected; login cookie isolated and logout revokes access |
| Magnet | Locally controlled lawful fixture resolves to measured infohash/name/files |
| Upload | Same fixture `.torrent` yields same file listing; invalid/oversized bencode rejected |
| Media | Actual browser decode, duration/progress advance and seek to an available later piece |
| Download | Range `bytes=0-1023` returns 206, Content-Range and byte-identical expected data |
| Archive | Download completes; unzip lists safe original paths and file hashes match |
| Library | Save/favorite/progress persists after reload, app restart and database restart |
| Authorization | Different account cannot read saved content/media of another user |
| Limits | Over-capacity work returns explicit capacity response; memory/disk remain bounded |
| Mobile/errors | Narrow viewport, invalid magnet, dead peer timeout, worker offline and cancellation |
| Secrets | No admin/upstream key in built client or browser URLs/responses |

Record actual output in `docs/verification-results.md`; do not mark these passed based on mocked responses. If the upstream smoke fails, stop and investigate before exposing the app.

## Measure before tuning

Start with one direct stream and zero CPU transcodes. Log time from submit to metadata, first media byte, first decoded frame, and seek recovery. Measure with `docker stats`, `iostat -xz 2`, `pidstat 2`, `free -h`, `df -h`, and authenticated API/health metrics. Browser buffering events are measurable only while playing; raw HTTP transfer is not a playback benchmark.

Then test 2 direct streams of the same file (shared cache), 2 different files, repeated random seeks, one direct download, 2 concurrent downloads, and one CPU transcode using local seeded lawful media. Use the same known files and record bitrates/checksums. Monitor CPU, RSS/cgroup memory, HDD I/O wait, egress and errors for at least several minutes. Stop on sustained thermal throttling, memory pressure, disk reserve threshold or buffering. Do not increase the defaults until measured.

Check the actual CPU/GPU and `docker compose exec webtor ffmpeg -hide_banner -encoders`. Seeing `h264_nvenc`, `h264_qsv` or VAAPI in the list does **not** prove access to a device or a successful encode. Test CPU first, then an explicit short hardware encode if the owner wants acceleration. No GPU mounts/drivers are enabled by default.

For a 100 Mbps uplink, estimate usable concurrency as measured safe egress divided by stream bitrate, then reduce for headroom and disk/CPU limits. This arithmetic is capacity planning, not an observed stream count. Keep a dedicated host/fixtures for load tests; avoid saturating the user's active household connection without an agreed window.
