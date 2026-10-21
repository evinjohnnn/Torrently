# Feature parity and verification boundaries

Implementation inventory, 2026-10-22. “Present” identifies a connected code path; it is not a claim of a passed BitTorrent or browser playback test. See executed test output and the implementation status report for verification. The initial repository was empty.

| Feature | Torrently path | Boundary / remaining verification |
|---|---|---|
| Magnet submission | Authenticated typed API, v1 hex/base32 normalization, real Webtor submission | Public DHT/peer availability; v2-only and private-tracker torrents deliberately unsupported |
| .torrent upload | Bounded strict bencode parser, raw info preservation, outer tracker/web-seed stripping | Submits real metadata; validate controlled swarm on deployed engine |
| Real file browser | Paginated flat upstream file listing reconstructed by full paths | Bounded to 10,000 files / 30,000 total listing entries |
| Direct video/audio | Authorized same-origin byte proxy, browser native controls | Browser codec support; test actual decoding and seeking against own engine |
| HLS remux | Upstream stream export, rewritten manifest/segment URLs, Hls.js/native fallback | Supported codecs; proxy child references retain server-only signing material |
| CPU transcoding | Explicit user-selected session creation, session seek and cleanup paths | Limited laptop CPU; real FFmpeg session test required, GPU acceleration unverified |
| Downloads | Actual streaming HTTP proxy and Range headers | Compare fixture checksum and partial bytes against real engine |
| ZIP archives | Upstream root directory download export | Real ZIP structure/bytes must be verified; not reconstructed by frontend |
| Subtitle sidecars | .srt/.ass/.ssa through upstream VTT export, .vtt direct | Track availability depends on source; ASS/SSA styling is lost by text conversion |
| Uploaded subtitles | Browser-session SRT/VTT file selection and sync control | Not permanent backend subtitle storage; not a complete multi-user subtitle library |
| Embedded subtitles/audio | HLS track selectors when Hls.js advertises them | Transcoder master must contain tracks; bitmap PGS/VobSub not promised; Safari native track UI differs |
| Personal library | Own per-user PostgreSQL tables, saved items, favorites, progress/resume/removal | Local PGlite close/reopen persistence test passes; production PostgreSQL service restart still pending |
| Authentication | Password hashing, secure sessions, CSRF, resource ownership | Initial administrator bootstrap; account invitation/recovery/OIDC are separate future work |
| Downloads screen | Browser download launch history | Browser owns download progress; do not show invented percentage/finished state |
| Storage/admin | Actual filesystem/cache/process metrics and configured limits | Worker CPU/network/torrent rates require further instrumentation |
| OpenSubtitles | Upstream capability researched; optional OSDB_API_KEY | Optional `subtitles` export JSON is read through bounded authenticated discovery and proxied tracks; no configured-key live verification yet |
| AI subtitle translation | Present in upstream container, off without key and explicit switch | Not complete in Torrently until track translation API and UI are integrated and tested; no mandatory expense |
| Vault permanent media | Present in upstream container, optional | Torrently library metadata is not permanent media storage; Vault user scoping/quota/UI not integrated |
| Stremio addon | Upstream scoped addon investigated | Upstream library belongs to engine credential; Torrently per-user addon remains separate integration work |
| WebDAV/S3 account exports | Present in upstream web-ui | Not exposed as Torrently user features; no shared upstream credentials in browser |
| Discovery/catalog/AI recommendations | Available in hosted/upstream ecosystem | Outside initial vertical slice; no fake media catalog |
| Chrome extension/embeds | Separate upstream repositories | Not installed, branded or exposed as Torrently features |
| Laptop/public production | Compose, private engine, deployment/preflight/backup guides | Physical laptop/Ubuntu install, network/CGNAT/TLS/hardware/load verification remain operator/deployment work |

## Exact optional subtitle contract

At the selected source version, `GET /api/v1/resource/:resource/export/:file` can include `exports.subtitles.url`. The self-hosted launch script omits this exporter when `OSDB_API_KEY` is absent. When configured, that URL ends in `<file>~vi/subtitles.json` with the signed media query.

The JSON is an array of `{srclang,label,src,format,id,source,moviehash_match,release?,fps?,hi?,downloads?}`. `src` is `/opensubtitles/<id>.vtt`, relative to the internal **video-info chain**, not the instance root. Mirror web-ui `makeSubtitleURL`: remove `/subtitles.json` from the listing URL's pathname, append `src`, preserve its signed query, validate the configured engine origin/resource path, then mint a user-bound subtitle ticket. Never send this signed URL, API key or external provider key to the browser. Bound response size/track count and request deadline. A 200 with `Retry-After` means search is pending; it must not be permanently cached as “no subtitles.”

Embedded tracks are separate. The export's `stream.html_tag.tracks` represents same-directory subtitle files sharing the video's basename; it does not enumerate container-embedded tracks. Embedded text subtitles and alternative audio are exposed in a transcoder HLS master when available. Hls.js track events and selection should reflect that manifest. Track availability must not be invented.

## Transcoder seeking

Create with `POST <file>~hls/session?signed-query`, retain returned `id` and `duration`, and play `<file>~hls/session/:id/index.m3u8?signed-query`. Seek with `POST .../session/:id/seek?t=<movie-seconds>`. Upstream quantizes by 30 seconds and exposes actual start through `#EXT-X-SESSION-OFFSET`; reload the playlist, use that returned offset for displayed movie time and resuming, and never confuse media-element relative time with movie time. `DELETE .../session/:id` closes the session. Upstream additionally releases an idle run after 60 seconds and removes a session after 10 minutes; these are safety fallbacks, not substitutes for cleanup. No hardware encoder is assumed.
