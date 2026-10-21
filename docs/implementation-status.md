# Implementation status — 22 October 2026

The initially empty repository now contains a connected application and deployment/test suite. **The intended real-engine acceptance criteria are not yet met:** no Docker/Linux engine was available on this Mac, and the user confirmed the Predator laptop is unavailable. There is no claim of tested torrent playback or complete Webtor parity.

## 1. Architecture chosen

Approach A: React/TypeScript + Express server adapter + official Webtor self-hosted all-in-one, source pinned to `dbab88e695660d96073eb16ffd6738c57251d9e0`. Torrently user state is in a separate PostgreSQL database; local development uses persistent PGlite. One server retains all Bearer/signing secrets, authorizes files/media, rewrites HLS and streams Range downloads.

All 63 public Webtor organization repositories were enumerated. Sixteen deployed component images and their source revisions/platforms are recorded in `upstream.lock.json`. These include torrent-store, magnet2torrent, torrent-web-seeder, HTTP proxy, rest-api, web-ui, content-prober/transcoder, nginx-vod, archiver, video-info, srt2vtt, external-proxy, subtitle-translate, cleaner and Vault. No arbitrary collection of microservices was cloned into Torrently. Upstream base/package/SBOM license and byte-for-byte reproducibility gaps are explicitly recorded.

## 2. Important files created

| Area | Files |
|---|---|
| Frontend | `client/main.tsx`, `client/Player.tsx`, `client/api.ts`, `client/style.css`, `client/icons.tsx` |
| API/security | `server/app.ts`, `auth.ts`, `validation.ts`, `upstream.ts`, `media.ts`, `http.ts`, `config.ts` |
| Persistence/operations | `server/db.ts`, `storage.ts`, `index.ts`, `manage-user.ts`, `shared/contracts.ts` |
| Deployment | `compose.yaml`, `compose.admin.yaml`, `docker/Dockerfile`, `docker/Caddyfile`, `.env.example`, `scripts/` |
| Tests | `tests/api.test.ts`, `validation.test.ts`, `upstream.test.ts`, `persistence.test.ts`, `tests/engine.ts`, `tests/browser/`, `playwright.config.ts` |
| Evidence/docs | `docs/audit/`, `docs/api.md`, `architecture.md`, `security.md`, `features.md`, deployment/operations/migration/acceptance guides |
| Supply chain | `upstream.lock.json`, `package-lock.json`, `LICENSES/`, `THIRD-PARTY-NOTICES.md`, `.github/workflows/verify.yml` |

All working files were created on `feat/torrently-platform`. Existing code/history was not overwritten. Local `.env` secrets and `.data`/cache files are ignored by Git and excluded from the Docker build context. At initial delivery this branch was local only. Both Torrently and the pinned Webtor source are now included in the repository for the requested GitHub publication. No PR or public infrastructure was created.

## 3. Verified functionality

The app actually starts on the development Mac. Live health reports database `ok`, upstream `unconfigured` and status `degraded`. Browser sign-in, invalid magnet feedback, library navigation, reload/session restoration, logout, actual storage display and responsive 390px layout passed without mocked browser API responses. The preview shows an empty real workspace and explicitly identifies the unconfigured engine.

Automated local tests verified strict magnet/torrent parsing, infohash-preserving sanitation, safe paths/international attachment headers, profile-route readiness contract, cookie/CSRF/origin rules, owner checks, typed resource/file mapping, Range/HEAD transfer headers and bytes, encrypted HLS segment/URI rewriting, media ticket isolation, library/progress writes/removal, database close/reopen persistence and capacity rejection/renewal.

The adapter contract tests deliberately use an in-process controlled upstream HTTP fixture. Their bytes are not a torrent swarm or decoded video. They are not counted as real torrent E2E evidence.

Implemented but awaiting real-engine verification: metadata resolution, uploaded torrent data, direct/native audio/video, HLS remux, explicit CPU conversion with seek/cleanup, full downloads/ZIP, sidecar and embedded tracks, optional OpenSubtitles discovery, and lifecycle/backpressure under actual streaming load.

## 4. Executed checks

| Command/check | Result |
|---|---|
| `npm run typecheck` | Pass: server and client TypeScript |
| `npm test` | 25 passed, zero failed/skipped; real app/database + controlled upstream contract tests |
| `npm run build` | Pass: server/client output and runtime license inventory for 91 packages |
| `npm run test:browser` | 3 passed; 1 real-engine playback test explicitly skipped because engine/key/swarm unavailable |
| `npm audit --omit=dev` | Zero reported advisories at this run; not an upstream image/SBOM security certification |
| Official Compose v5.6.1 `config --quiet`, base and admin override | Both pass schema/interpolation; no daemon used |
| `bash -n scripts/*.sh`, Node script syntax | Pass |
| Secret generator fixture | Random secrets, mode 600, overwrite refusal verified |
| Disk warning script | Correctly returned alert for this nearly full development filesystem |
| Manual browser | Public Webtor inspection; local login, validation, final workspace screenshot |

The player is lazy loaded: initial client JS approximately 249 KB raw/77 KB gzip, optional player/Hls.js approximately 585 KB/182 KB gzip. Vite reports the optional player chunk exceeds its 500 KB advisory threshold; this does not fail the build. No performance tuning or media throughput claim follows from bundle sizes.

`npm run test:engine`, real Webtor smoke suite, Docker image boot, restore/reboot tests, full archive integrity, actual browser decoding/seeking and load benchmarks were not executed. CI definitions are authored and action SHAs verified, but CI has not been dispatched from this unpublished branch.

## 5. Server requirements

Actual Predator CPU/RAM/GPU, available HDD capacity, thermals and broadband behavior remain unknown. Read-only Windows and Linux preflight scripts are supplied. Working estimate: at least four modern CPU threads, 8 GB RAM for experiments/16 GB preferred, healthy HDD and Ethernet. Container caps start near 5.3 GB total plus the operating system/page cache. These are estimates, not measurements of the laptop.

Initial configurable limits: two streams, two downloads, one explicit CPU conversion, twenty torrents/user, 2 MB metadata uploads, 200 GB resource size, 300 GB cache admission threshold and 50 GB free reserve. Upstream peer/read-ahead/mmap/FFmpeg settings are conservative and configurable. One CPU conversion may still be too slow; no GPU mounts or verified hardware acceleration are enabled. Cache occupancy uses allocated blocks. Hard cache containment requires a measured bounded filesystem/project quota; the application threshold plus reserve cleaner is not a strict whole-disk quota.

The connection was specified by the user as approximately 100 Mbps each way. No network benchmark was run. Keep egress headroom and measure bitrate, HDD random I/O, CPU, thermal throttling and rebuffering before increasing concurrency.

## 6. Run and deploy

Existing local checkout:

```bash
npm ci
# Only if .env does not already exist:
node scripts/init-env.mjs
npm run build
npm run dev
```

Open http://localhost:3000. Read the local admin credentials privately from `.env`. The generated account is not a public/default password. The preview server is a development process, not an installed background service.

On prepared Ubuntu, review the hardware/storage/backup guide, initialize secrets, privately bootstrap Webtor's separate profile API credential, then:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
scripts/health.sh
```

Follow `docs/deployment/webtor-bootstrap.md` exactly; its temporary admin port is loopback-only and removed afterward. Normal operation exposes only authenticated Torrently. LAN/public/TLS/CGNAT paths are documented but unexecuted. No Windows erasure, partition/BIOS/router/DNS change, paid capacity or public port exposure was performed.

## 7. Remaining gaps

The largest gap is executed real Webtor + Torrently engine/media acceptance on Linux. The app is not certified production-ready or parity-complete. Actual cache eviction, worker restart recovery, memory/concurrency bounds, full backup restore and external-network behavior need the target tests.

Stremio remains deferred until core playback is verified; a shared upstream principal's library must not leak across Torrently users. AI subtitle translation, permanent Vault media storage, WebDAV/S3 account exports, discovery/recommendation/catalog and a native networking companion are not integrated Torrently features. Invitation/recovery/OIDC and general multi-replica capacity accounting remain separate work. OpenSubtitles is wired optionally but no API key was configured or charged. Bitmap subtitles are not promised. The upstream image license/SBOM closure and private-network egress policy need review before public distribution/access.

## 8. Next engineering priorities

1. Run PH315 preflight, back up Windows, obtain explicit approval before any destructive OS/disk work, and prepare Ubuntu/Docker.
2. Provision the pinned private engine and profile credential; execute its controlled-fixture suite.
3. Run Torrently real magnet/upload/file/Range/ZIP/browser decode/seek tests with lawful seeded media; fix any observed source/runtime mismatch.
4. Verify database/container restarts and full restore; measure storage/thermal/network limits and enforce a hard cache filesystem budget.
5. Complete public egress/TLS/abuse/license release checks only if public access is wanted. Then implement scoped Stremio and remaining optional capabilities.
