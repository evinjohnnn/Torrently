# Torrently

A self-hosted React torrent workspace with a secure TypeScript adapter for Webtor's real torrent, download, HLS and conversion services.

**Current status:** the application builds and its local API/database/browser checks pass. The real Webtor containers and BitTorrent playback have **not** been run on this development Mac. This is an implemented integration awaiting Linux engine acceptance, not a claim of complete Webtor parity. The Predator laptop was unavailable. See [implementation status](docs/implementation-status.md), [feature boundaries](docs/features.md), and the [target acceptance checklist](docs/tests/acceptance.md).

## Run the application locally

Use Node 24.10 or newer (below 26). From this checkout:

```bash
npm ci
node scripts/init-env.mjs
npm run build
npm run dev
```

If `.env` already exists, skip initialization; the helper deliberately refuses to overwrite it. Open http://localhost:3000. Use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the private `.env` file. Credentials never belong in client source, screenshots or shared logs. The initial account is created once; changing those environment variables does not reset an existing password.

Without `DATABASE_URL`, development uses real embedded PostgreSQL (PGlite) persisted in `.data/postgres`. Without `WEBTOR_API_KEY`, the workspace and library work, but torrent submissions return an explicit engine-configuration error. No demo metadata is substituted. Setting up Webtor requires the private bootstrap below.

For separate Vite hot reload, set `PUBLIC_ORIGIN=http://localhost:5173`, run `npm run dev:client` in another terminal, and open port 5173. The ordinary single-server preview uses the last `npm run build` output.

## Deploy on Ubuntu

Read the [Predator guide](docs/deployment/ubuntu-predator.md) before installing Ubuntu or changing disks. CPU, RAM, GPU and available disk allocation must be measured there; no laptop changes were performed.

```bash
npm ci
node scripts/init-env.mjs
# Review paths, reserve/concurrency limits and private .env locally.
docker compose config --quiet
docker compose build
docker compose up -d
```

Configure the engine's separate profile-issued API key using [private Webtor bootstrap](docs/deployment/webtor-bootstrap.md); its internal `API_KEY` is a different credential. Then recreate the app. The default HTTP listener is loopback. [LAN/public access](docs/deployment/network.md) explains LAN binding, SSH tunnels, TLS, CGNAT and peer connectivity. No public deployment was performed.

Compose runs Torrently, a separate PostgreSQL database for Torrently user state, and the source-pinned official Webtor all-in-one image. The engine contains its own database and supervised workers. Its UI/API, both databases and workers are private. Caddy is an optional public HTTPS profile, not a video CDN. No Kubernetes or commercial storage is required.

## Verify

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Playwright can use the installed macOS Chrome automatically; Linux/CI uses its pinned Chromium installation. The default browser checks exercise the actual application with no API interception. Engine playback is explicitly skipped until `WEBTOR_API_KEY` and lawful `TEST_MAGNET` are provided. The API contract fixture is not a torrent engine.

After the real engine is provisioned, configure lawful media seeded for your own deployment, then run:

```bash
npm run test:engine
npm run test:browser
```

Set `TEST_MAGNET` and optionally `TEST_VIDEO_NAME` privately through the environment. `TEST_ARCHIVE=true` checks initial ZIP bytes in the API smoke; full ZIP integrity and decoding/seeking/recovery are separate target checks. See [verification and benchmarks](docs/operations/verification.md). No load tests against webtor.io are included.

## Accounts and operations

The built CLI creates/resets a local account and revokes its sessions. The optional `--admin` gives admin rights; omit it for a viewer. Supply the password through stdin rather than command arguments. On Ubuntu Bash, for example:

```bash
read -r -s -p 'New password: ' torrently_password; echo
printf '%s' "$torrently_password" | docker compose exec -T app node dist/server/manage-user.js viewer@example.org
unset torrently_password
```

This is an operator action; the application has no open registration, invitation or recovery flow. [Backup/restore](docs/operations/backup-restore.md), [troubleshooting](docs/operations/troubleshooting.md), and [dedicated-server migration](docs/migration.md) cover ongoing operation. Cache eviction never deletes Torrently's permanent library metadata. `MAX_CACHE_BYTES` is an admission threshold; a bounded cache filesystem is required for a hard disk cap.

## Source and contracts

- [API](docs/api.md), [architecture](docs/architecture.md), [security and retention](docs/security.md)
- [Initial audit](docs/audit/current-architecture.md), [connections](docs/audit/frontend-backend-connections.md), [missing features](docs/audit/missing-features.md), [dependency inventory](docs/audit/dependency-inventory.md)
- [Upstream source investigation](docs/upstream.md), [immutable source/image lock](upstream.lock.json), [third-party notices](THIRD-PARTY-NOTICES.md)
- [Future network companion design](docs/future-networking.md)

Torrently has its own visual identity. No hosted Webtor content, proprietary artwork or credentials were copied. Third-party license texts are retained in `LICENSES/` and published with the built client at `/licenses/`; full upstream image SBOM/binary license closure remains a release check documented in the notices.
