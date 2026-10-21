# Architecture

Approach A: React + a secure Node/TypeScript adapter + the official Webtor self-hosted backend. There was no existing application in the initial checkout, so no working code was replaced. Work is isolated on `feat/torrently-platform`; no remote main changes were made.

| Component | Responsibility | State |
|---|---|---|
| React + Vite | Authenticated workspace, actual resources/files, library, media controls | Browser session state; no fake media catalog |
| Express adapter | Authentication/CSRF, validation, ownership, quotas, private upstream API, byte/HLS proxy | Own PostgreSQL schema and short-lived server-side media tickets |
| PostgreSQL | Users, hashed sessions, resource metadata/access, library/progress, reports | Separate production database; local PGlite for development |
| Webtor all-in-one | Torrent resolution/store/seeding, HTTP media delivery, remux, conversion, ZIP | Its own supervised service processes, embedded PostgreSQL/S3/cache |
| Optional Caddy | Public HTTPS reverse proxy | TLS/hostname configuration |

A submission accepts a v1 magnet or bounded raw torrent. Tracker/webseed inputs are removed; the original info dictionary is retained for uploads, preserving its hash. The adapter POSTs the verified external `/api/v1/resource` endpoint with a server-side Bearer credential, enumerates its paginated flat list, validates paths/IDs/sizes and persists real metadata. User access is granted only following successful submission. Content IDs come from upstream; file selection never guesses list indices.

The browser requests playback through Torrently. Direct playback uses the real download export; HLS uses the real stream export; explicit conversion creates an upstream `~hls/session`, retains duration, and supports upstream seek/cleanup. Media URLs and signing queries remain in the database. Browser tickets are scoped to the logged-in owner and resource and expire after six hours. HLS segment and URI-attribute references are rewritten to encrypted asset references under the ticket. No arbitrary upstream URL endpoint is exposed.

Downloads pass bytes, Range/conditional requests and representation headers without full-file buffering. Archives use an upstream directory download export. HTML and other non-media files cannot be opened as player documents; media responses carry a restrictive sandbox CSP and nosniff. Direct downloads have safe attachment filenames.

The initial deployment is one application instance. Capacity leases, API rate limits and measured admission thresholds live in that instance; multiple app replicas would require shared capacity/rate state. Database metadata is shared per infohash, but access/library/progress are per user. Engine media cache reuse is delegated to upstream and not duplicated in Torrently.

## Persistent and disposable data

The schema migration is versioned and idempotent in `server/db.ts`. Passwords use salted scrypt; session tokens are hashed at rest. Resource metadata and library/progress survive cache eviction and application restarts. Media tickets contain sensitive signed engine URLs and belong in private database backups. Expired sessions/tickets are removed periodically. Conversion cleanup is explicit on player close/mode switch; upstream inactivity expiry is an additional fallback.

The adapter owns no torrent piece store. Webtor cache is disposable; its embedded database/S3 metadata and Torrently PostgreSQL are backed up separately. See the backup guide before choosing which volumes to exclude. Long-term Vault storage and per-user Stremio/WebDAV/S3 are not wired as Torrently features.

## Hardware and bounds

Defaults: two stream leases, two active downloads, one explicit conversion, two metadata resolutions, twenty resource grants per user, 10,000 files per torrent, 2 MB upload metadata, 200 GB resource size, 300 GB cache admission threshold and 50 GB free reserve. These are conservative starting configuration values, not laptop benchmarks. The engine cleaner maintains free-space percentages; an appropriately sized filesystem/volume or project quota is needed for a hard cache ceiling. Sparse cache occupancy is measured in allocated blocks, not logical file lengths; a bounded/failed scan returns unknown and blocks new submission when a cache path is configured.

Actual laptop CPU/RAM/GPU and CGNAT status remain unknown. No hardware acceleration, unlimited-viewer claim or measured throughput is implied.
