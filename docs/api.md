# Torrently HTTP API

All JSON success responses are `{ "data": ... }`; errors are `{ "error": { "code": "...", "message": "..." } }`. Shared browser types live in `shared/contracts.ts`. Routes are Torrently contracts, not invented Webtor endpoints. The source mapping is in the audit and `docs/upstream.md`.

Use the HTTP-only SameSite=Strict session cookie after `POST /api/login` with JSON `{email,password}`. The response and `GET /api/session` return `{user,csrfToken}`. All authenticated mutations require `X-CSRF-Token`. Foreign Origin headers are refused; no permissive CORS is installed. Media tickets also require the owning cookie and resource grant; a copied URL is not public access.

| Method and route | Request / result |
|---|---|
| GET `/api/health` | Database check plus authenticated upstream profile readiness; `status:ok/degraded`, database/upstream states. HTTP 200 can mean application alive with engine unconfigured. |
| POST `/api/login` | JSON email/password; returns session and sets cookie. |
| GET `/api/session` | User and CSRF token. |
| POST `/api/logout` | Revokes current session and clears cookie. |
| POST `/api/torrents` | JSON `{magnet}` or raw `application/x-bittorrent` bytes; waits for actual metadata, returns `Torrent` with files, 201. No external URL upload. |
| GET `/api/torrents/:id` | Owner's persisted real metadata, safe file paths and upstream IDs. |
| GET `/api/torrents/:id/files?offset=0&limit=200` | Paginated `{items,total,offset,limit}`; maximum limit 1000. |
| GET `/api/torrents/:id/status` | Metadata readiness only. Does not fabricate swarm completion or peer metrics. |
| DELETE `/api/torrents/:id` | Removes this account's resource/library/tickets and releases its conversion sessions. Shared engine cache expires independently. |
| GET `/api/torrents/:id/files/:fileId/playback?mode=direct` | Native original delivery; `hls` uses remux, `transcode` explicitly creates a conversion session. Returns ticket URL, type, subtitles and optional session/duration. |
| GET `/api/torrents/:id/files/:fileId/subtitles` | Optional OpenSubtitles discovery; `{configured,pending,tracks}` with proxied URLs. Requires upstream OSDB configuration; no provider key in browser. |
| POST `/api/playback/:ticket/seek` | Conversion-only JSON `{position}`; returns actual upstream `{offset}`. Reload playlist and position relative to offset. |
| DELETE `/api/playback/:ticket` | Revokes ticket, aborts active proxy transfers and closes an owned conversion session. |
| GET/HEAD `/api/media/:ticket[/encryptedAsset]` | Owner-authenticated media bytes or rewritten HLS. Signing material never returned. |
| GET/HEAD `/api/torrents/:id/files/:fileId/download` | Streaming attachment; forwards Range/If-Range and Content-Range/Accept-Ranges/length/type. |
| GET/HEAD `/api/torrents/:id/archive` | Real upstream ZIP of root directory where available. Single-file roots without a directory export return unavailable. |
| GET `/api/library` | Up to 500 newest owner entries; grant limit is lower by default. |
| POST `/api/library` | JSON `{resourceId,name,favorite?}`; resource must belong to caller; actual resource name is authoritative. |
| PATCH `/api/library/:itemId` | `{favorite?,progress?:{fileId,position,duration}}`; file must belong to resource and timing must be valid. |
| DELETE `/api/library/:itemId` | Removes saved entry, retains resource access. |
| GET `/api/recent` | Fifty most recently opened owner resources. |
| POST `/api/abuse` | `{resourceId?,reason}`; reason 10–4000 characters, stored privately for administrator. |
| GET `/api/admin/storage` | Actual filesystem/cache/process counters and configured admission/concurrency limits. Unknown cache is null. |
| GET `/api/admin/reports` | Latest 100 reports, admin only. |
| DELETE `/api/admin/resources/:id` | Revokes all Torrently resource grants/tickets, library metadata and active conversion access. Engine bytes follow separate retention policy. |

Relevant statuses: 400 invalid input, 401 missing/expired session, 403 CSRF/admin/origin, 404 unknown or unowned resource, 409 user quota, 413 metadata too large, 422 unsupported/unsafe torrent or media, 429 rate limit, 502 upstream failure, 503 engine unconfigured/capacity/storage unknown, 504 timeout, 507 low reserve/admission cap. Logging includes request ID, route template, method, duration and status, never magnet payloads, cookies or signed URLs. Large download bodies are streamed; playlist/metadata bodies are bounded.

A metadata request is cancelled on browser disconnect. Conversion creation follows the response lifecycle and cleans up a known session/ticket if delivery is cancelled. Unknown engine-side sessions also expire upstream. Limits are conservative; do not treat HTTP response success as proof that a browser decoded media. Run the separate real-engine/browser suite.
