# Current architecture audit

Audit started 2026-10-22 before implementation. `git status` reported an unborn `main` branch and the checkout contained only `.git`. The remote `https://github.com/evinjohnnn/Torrently.git` had no commits. There were no frameworks, UI assets, services, API clients, torrent/streaming code, database, authentication, Docker configuration, environment files, CI tests, browser extension or companion app to preserve. No placeholders or disconnected controls existed because there was no application.

## Decision: Approach A

Torrently's React/TypeScript client calls a same-origin Node/TypeScript adapter. The adapter owns authentication, user isolation, library metadata, rate limits, media authorization and origin validation. It calls the official Webtor self-hosted all-in-one container's authenticated `/api/v1`, using a credential retained on the server. The container reuses upstream torrent metadata discovery, seeding, content proxy, probing, HLS and archive infrastructure. No Kubernetes is required.

This keeps the BitTorrent and FFmpeg implementations upstream. Forking their behavior or assembling dozens of separate containers would increase laptop operations burden without solving the initial user workflow. Keeping Webtor's own web-ui binary internally is necessary because it supplies the authenticated public API; its branding and public pages are not Torrently's frontend.

The adapter has separate account/library tables because one upstream service credential identifies a single Webtor principal. Sharing that principal's upstream library among all Torrently accounts would violate isolation. Torrently does not write Webtor's tables or duplicate its cache schema. PGlite is the persistent local development database; production Compose uses PostgreSQL.

## Upstream assembly

Pinned source commit: `dbab88e695660d96073eb16ffd6738c57251d9e0`. `upstream.lock.json` records all 16 component image digests and the source revision from each image's OCI metadata. The assembly copies prebuilt binaries, uses s6-overlay v3 supervision, installs PostgreSQL/Redis/FFmpeg, and runs NATS and embedded VersityGW S3. Internal endpoints use loopback; nginx listens at 8080. Only adapter access should be allowed to this nginx port during normal operation.

Persistence: `/data` is disposable torrent/transcode cache; `/pgdata` contains upstream accounts/settings/library; `/storage` includes permanent user subtitle/Vault objects and disposable artwork. S3 uses extended attributes: named Docker volumes are required for cross-platform development, and backups must preserve xattrs. Torrently's own application database is permanent and separate.

## Evidence and limits

Source audit inspected Dockerfiles, s6 run/init scripts, nginx configuration, environment templates, REST models, external API handlers, selected media services and upstream smoke tests. Source inspection establishes contracts and intended behavior, not runtime proof. Upstream tests are not reported as executed by this audit. See the final implementation status and test output for actual runtime evidence.

The Acer Predator PH315 is a different machine from this development Mac. CPU, RAM, GPU, free disk, thermals, router configuration, public IP and ISP restrictions remain unmeasured until the laptop preflight scripts are run there. No Windows installation, partitions, firmware or router settings were changed.
