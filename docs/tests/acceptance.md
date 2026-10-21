# Target-host acceptance checklist

This is a runbook and results template, not a passing report. Record actual commands, timestamps, commit/image digests and observations. The app build/tests and config-only checks on macOS cannot establish Linux engine or media behavior. The selected pinned upstream commit includes multiarch video-info and optional subtitle-launcher fixes plus newer compatible component pins. The latest observed release v2.1.2 already includes export signing; an upstream CLAUDE note saying otherwise is stale.

## Establish the environment

- [ ] Save `scripts/preflight-linux.sh` output privately; record CPU model, thread count, total RAM, GPU model, HDD model/health, filesystem sizes/free bytes and Docker/Compose versions.
- [ ] Record Torrently Git commit, `upstream.lock.json` SHA and immutable built image digests.
- [ ] Validate `docker compose config --quiet`; no `.env` or credential output in logs.
- [ ] Execute `npm ci`, `npm run typecheck`, `npm test`, `npm run build`; save actual result counts.
- [ ] `docker compose build` and `docker compose up -d` complete; all required services healthy.
- [ ] Provision a real profile-generated upstream API key using the loopback bootstrap; remove the temporary operator mapping afterward.

## Verify the engine with controlled content

In an isolated host/project, clone the exact upstream self-hosted SHA, build `torrently-webtor:dbab88e` and execute its `tests/run.sh torrently-webtor:dbab88e`. The harness synthesizes media with FFmpeg and its own HTTP webseed. Save each scenario's output. Its teardown deletes **its test project's** volumes, so keep that project isolated from permanent data. This proves upstream behavior only; repeat the user workflows through Torrently's authenticated API and actual browser.

- [ ] Magnet resolves to a known fixture infohash; decoded files and byte lengths match expected metadata. An unknown/no-peer hash reports an accurate timeout without fabricated files.
- [ ] `.torrent` upload resolves the same resource. Invalid bencode, unsafe names and oversize upload rejected.
- [ ] Nested folders render real files; selecting a file opens the correct one.
- [ ] Browser video `currentTime` advances while actual frames decode; record browser/codec.
- [ ] Seek near beginning, midpoint and end; record each recovery latency and piece availability.
- [ ] Direct audio playback advances; mute/volume/speed and keyboard/fullscreen controls behave as exposed.
- [ ] Download Range request `bytes=0-1023` returns HTTP 206 and valid Content-Range; bytes match fixture. Full file hash matches expected hash. Client disconnect aborts the upstream read.
- [ ] Archive download unzips into safe expected paths; every file hash matches the originals.
- [ ] HLS manifests and segments stay on Torrently's authorized origin; no internal hostname/key appears in browser responses. Do not count MP4-only playback as proof of transcode.
- [ ] Embedded/uploaded subtitles tested where exposed. Optional OpenSubtitles/translation remain disabled without deliberate configuration; do not spend third-party API credit for this checklist.

## Verify persistence and isolation

- [ ] Sign-in, sign-out, failed login/rate limit and expired/revoked cookie tested.
- [ ] Unauthenticated metadata/library/media/archives rejected.
- [ ] Two users cannot access one another's saved library/progress or unauthorized resources; administrator-only storage/cleanup endpoints rejected for ordinary users.
- [ ] Cross-origin mutation is rejected; client bundles and error responses contain no secrets.
- [ ] Save/favorite/resume state survives browser reload, app restart and PostgreSQL restart.
- [ ] Cache eviction leaves permanent library metadata intact.
- [ ] Over-capacity stream/download/transcode requests fail explicitly and release slots on cancellation/expiry.
- [ ] Low disk reserve/new cache admission limit rejects new work without deleting permanent data.
- [ ] Offline engine, unavailable peers, malformed export and media failure show useful recoverable states.
- [ ] Mobile viewport and keyboard navigation tested in actual browser.
- [ ] Approved normal service restart/host reboot recovers services; a backup is restored into a fresh destination and re-tested.

Only features with retained executed evidence should be reported complete. Stremio, automatic external subtitle selection, durable media Vault, public routing and hardware acceleration each need their own integration evidence before claiming parity.

## Benchmark record

Use [performance procedures](../operations/verification.md). Keep tests on owned, controlled fixtures; never load-test Webtor.io. Repeat the same fixture/bitrate/browser at each stage. Do not run heavy load on an active household network without an agreed window.

| Scenario | Startup to first frame | Seek recovery p50/p95 | Rebuffer count/time | CPU peak | RAM peak | Disk I/O wait | Egress Mbps | Errors |
|---|---|---|---|---|---|---|---|---|
| 1 direct stream, cold cache | pending | pending | pending | pending | pending | pending | pending | pending |
| 1 direct stream, warm cache | pending | pending | pending | pending | pending | pending | pending | pending |
| 2 direct streams, same file | pending | pending | pending | pending | pending | pending | pending | pending |
| 2 direct streams, different files | pending | pending | pending | pending | pending | pending | pending | pending |
| 1 CPU transcode | pending | pending | pending | pending | pending | pending | pending | pending |
| 1 download | n/a | n/a | n/a | pending | pending | pending | pending | pending |
| 2 downloads + random video seeks | pending | pending | pending | pending | pending | pending | pending | pending |

Record cache physical allocated bytes (sparse logical lengths overstate usage), free bytes, peer rates, stream/request cancellation, failed jobs and thermal readings. An encoder appearing in `ffmpeg -encoders` is discovery only. A successful explicit encode, measured startup/playback and container device access are required before enabling a hardware option. Keep conservative defaults until results justify a change.
