# Webtor integration evidence and upgrade notes

## Selected foundation

Use Approach A: own React frontend and authenticated server adapter, official Webtor self-hosted backend, one machine. Pin source and component digests from `upstream.lock.json`.

The snapshot self-hosted HEAD is `dbab88e695660d96073eb16ffd6738c57251d9e0` (2026-10-21). The most recent published release observed on GitHub was v2.1.2 (2026-10-20). Exact GitHub comparison `v2.1.2...dbab88e` shows HEAD fixes the arm64 video-info binary, optional OpenAI-only subtitle translation launchers, and updates archiver/proxy image pins. Prefer the exact selected source build for these fixes and retain the built image digest. An old CLAUDE.md paragraph says floating latest lacks export signing; that paragraph is stale relative to v2.1.2: fetching that release's rest-api run script confirmed `EXPORT_API_KEY` and `EXPORT_API_SECRET` are already present. Do not repeat the stale warning as a current release defect. Upstream separately pins each component image by digest. Source OCI revisions were fetched from anonymous read-only GHCR manifests/config blobs; actual rest-api and web-ui pins were then checked out and inspected.

## Internal organization

s6-overlay starts/restarts processes. `cont-init.d/01-generate-common-env` renders `etc/webtor/common.template.env`; service run scripts source it and override shared port/config variables. nginx provides the external UI/API port. gRPC metadata storage/resolution, Redis, PostgreSQL, NATS, S3, proxy, seeder, transcoder and helper workers communicate internally. No Docker socket or Kubernetes controller is needed with the Environment endpoint provider.

`rest-api` exports are signed with `EXPORT_API_KEY` and `EXPORT_API_SECRET` sourced from generated internal secrets. `EXPORT_PATH_PREFIX=/torrent-http-proxy/`; `EXPORT_DOMAIN=DOMAIN`; subdomains disabled. Public nginx routes `/torrent-http-proxy/` to the content proxy and `/` to web-ui, including `/api/v1`. `/rest-api/` has intentionally been removed.

`ENFORCE_SESSION_IP=false` is upstream's intentional default because web-ui makes server-side media probe/warmup requests with viewer tokens. This does not disable API authentication. Internal/external content calls are distinguished by TCP peer address, not client-controlled headers: nginx binds its public-to-proxy requests from `127.0.0.2`, internal workers call from `127.0.0.1`.

## Media behavior

Prefer a browser-supported direct file stream. The seeder handles seeking with HTTP Range. `~vod` is nginx-vod remuxing already compatible codecs, not an FFmpeg re-encode. Unsupported containers/codecs can use the session-based `~hls` transcoder, with explicit POST creation, POST seek and DELETE cleanup; old `~hls/index.m3u8` links are obsolete. Sessions near the same quantized seek time share a run. The transcoder supports CPU re-encoding up to 1080p on the old route; arbitrary 4K conversion is not promised. Hardware pass-through/encoding is not established on the Predator laptop.

Seeder code has shared torrent state, read-ahead, on-demand piece readers, hash-verified downloads, per-torrent cache budgets, mmap/file-descriptor budgets, idle cleanup and stale-read detection. Upstream cleaner starts at low free space and evicts safe idle torrent directories; permanent library metadata must not be stored in `/data`. These source properties do not substitute for laptop load/seek/cache measurements.

Confirmed controls include `CLEANER_KEEP_FREE`, `CLEANER_FREE`, `PER_TORRENT_CACHE_BUDGET`, `ESTABLISHED_CONNS_PER_TORRENT`, `HALF_OPEN_CONNS_PER_TORRENT`, `TOTAL_HALF_OPEN_CONNS`, `MAX_UNVERIFIED_BYTES`, `MAX_READAHEAD`, `MAX_OPEN_FILES_PER_TORRENT`, `MMAP_MAX_FILE_SIZE`, `MMAP_BUDGET_PER_TORRENT`, and `FFMPEG_THREADS`. `MAX_CONC_TOTAL`/`MAX_CONC_PER_PATH` in torrent-http-proxy are per session, not global laptop capacity limits. The adapter must apply its own global admission controls.

## Optional services and hosted differences

OpenSubtitles requires an operator's key. Translation needs an explicit feature switch and OpenAI/Anthropic key; defaults stay off. Metadata enrichment keys are optional. Self-hosted has no external paid claims provider and Vault points are unlimited; this is not permission to fill the physical disk. Hosted Webtor's distributed nodes, premium bandwidth, public catalogs, account infrastructure, CDN and billing are not part of this deployment. No proprietary branding/assets were copied.

## Validation and upgrade procedure

1. Review upstream commit changes and the selected Dockerfile pins; inspect OCI platform manifests/revision labels.
2. Read migration/config differences before rebuilding. Back up adapter data, `/pgdata` and `/storage` preserving xattrs.
3. Build a new local image from the new exact commit; retain old image and volumes for rollback.
4. Run upstream controlled-fixture smoke tests against the built image: `tests/run.sh <image>` in the selected upstream checkout. These cover boot, DDL, ZIP, HLS remux, real transcode, probe, VTT, persistence, API auth and optional service contracts. Do not label them passed unless executed.
5. Run Torrently's unit, real engine integration and real browser suites. Compare fixture bytes and actual playback; mocked APIs are not E2E proof.
6. Upgrade in a maintenance window, verify health/restarts/library/media, and record image digest and test output.

Upstream's own Dockerfile notes that its Alpine apk packages float. Digest-pinned component binaries therefore improve reproducibility but do not make a source build fully hermetic. Capture an SBOM for the actual built image, including FFmpeg codec and distro licenses, before redistributing the image.
