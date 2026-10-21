# Missing features and acceptance ledger

At the initial audit every feature in the brief was missing: the repository was empty. This file records the acceptance boundaries that must remain explicit after implementation; it is not a claim that source alone passes them.

| Requirement | Evidence required for completion |
|---|---|
| Real magnet to metadata/files | Successful authenticated request against local Webtor and a controlled lawful swarm; compare actual infohash and files |
| Uploaded torrent | Raw valid bencoded torrent accepted; malformed, oversized and unsafe-path cases rejected |
| Browser direct video and seeking | Real media decodes; browser currentTime advances; seek triggers valid Range/segment response |
| Direct download | Compare downloaded bytes/checksum to controlled fixture, test partial Range |
| ZIP archive | Download real archive, validate structure and fixture bytes |
| HLS/transcoding | Decodable manifest/segment from own backend, session lifecycle and seeking verified |
| User library/progress | Persist across process restart, account isolation tests |
| Storage limits | Actual filesystem free-space guard, bounded cache, upstream cleaner and stale-job cleanup |
| Capacity limits | Explicit refusal under configured active stream/download/transcode load |
| Linux recovery | Boot Compose on target-compatible Linux, restart services and verify health/data |
| Laptop sizing | Run Windows/Linux preflight on PH315; measure disk, RAM, CPU, thermals, network |
| Public access | Separate authorized deployment decision; TLS/auth/proxy/CGNAT path verified |

Upstream supports more than the first Torrently vertical slice: OpenSubtitles (OSDB_API_KEY), embedded subtitles/audio through transcoder, optional paid-key AI translation, Vault, WebDAV, and Stremio. These do not become Torrently features merely by running a container that contains them. Enable and integrate each only when supported and tested. No external paid key is mandatory.

Stremio's upstream manifest is public at `/stremio/manifest.json`; account content endpoints require a scoped `stremio:read` token. Its profile action `POST /stremio/url/generate` produces a short `/s/<code>/manifest.json` alias that proxies without redirecting raw credentials. Torrently accounts use separate library storage, so upstream Stremio would otherwise expose the engine principal's library rather than each Torrently user's library. A scoped Torrently addon adapter is therefore separate remaining work unless explicitly implemented and verified.

No full Webtor parity, GPU acceleration, unlimited streaming capacity, production security certification or successful physical laptop deployment should be claimed without the corresponding executed evidence.
