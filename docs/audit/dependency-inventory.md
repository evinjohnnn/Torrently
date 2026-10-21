# Dependency inventory

Inspected on 2026-10-22. GitHub API request `gh api --paginate "orgs/webtor-io/repos?per_page=100&type=public"` returned 63 public repositories. Pagination was enabled; all 63 fitted the first 100-item page. Full snapshot is in `upstream.lock.json`. The application imports no arbitrary collection of repositories.

## Components actually assembled by the selected all-in-one Dockerfile

Exact digest references are in `upstream.lock.json`. Source revisions below were read from the amd64 image configuration OCI labels, not inferred from the current branch name. All 16 component indexes include linux/amd64 and linux/arm64 manifests.

| Component | Role | Image source revision | Repository license |
|---|---|---|---|
| torrent-store | Torrent metadata store, gRPC | `a35922770703` | MIT |
| magnet2torrent | Magnet metadata discovery, gRPC | `232ed8a5be1a` | MIT |
| external-proxy | External media/subtitle fetch proxy | `1fca8d05d183` | MIT |
| torrent-web-seeder | BitTorrent pieces, HTTP Range reads, shared on-disk cache | `4249a2955547` | MIT |
| torrent-web-seeder-cleaner | Free-space cache cleaner | `c29aa026c8a0` | MIT |
| content-transcoder | Session-based FFmpeg/HLS worker | `152f4772fa6b` | MIT |
| content-prober | FFprobe media information | `030c8eee6d85` | MIT |
| torrent-archiver | Streaming resumable ZIP/TAR | `cf1375b7a6a6` | MIT |
| srt2vtt | SRT to WebVTT conversion | `844a294c8918` | MIT |
| subtitle-translate | Optional AI translation (disabled without key/switch) | `4bec97c15fd3` | MIT |
| video-info | Optional external subtitles/metadata | `cd8908fd44b3` | MIT |
| torrent-http-proxy | Signed content routing and request limits | `69a689317c94` | MIT |
| rest-api | Resource/list/export API (internal) | `096cb14b70f0` | MIT |
| web-ui | Authenticated /api/v1 gateway, upstream account/library schema | `5dc6629250f6` | MIT |
| nginx-vod | Codec-compatible HLS remux | `bfb9ef8533a3` | NOASSERTION |
| vault | Optional permanent content retention | `2b30266c09ad` | MIT |

The assembly additionally copies VersityGW (Apache-2.0), nats-server and NATS CLI (Apache-2.0), s6-overlay, and installs Alpine packages including PostgreSQL, Redis, FFmpeg, OpenSSL, PCRE and zlib. Dockerfile component digests are pinned; Alpine `3.22`, apk package resolution, and s6 release tarballs lack digest/checksum pinning in upstream. Therefore a source commit alone does not reproduce every final layer byte-for-byte. Preserve a built image digest and capture a package SBOM before distribution.

## Organization coverage

“Selected” means an assembled binary. “Dependency” means imported or investigated support code, not an extra container. “Outside assembly” means no service in this all-in-one build; no claim is made that hosted Webtor never uses it.

| Repository | License reported by GitHub | Selection | Archived |
|---|---|---|---|
| [mediaelement-plugins](https://github.com/webtor-io/mediaelement-plugins) | NOASSERTION | Outside assembly | false |
| [chrome-ext](https://github.com/webtor-io/chrome-ext) | MIT | Outside assembly | false |
| [torrent-web-seeder](https://github.com/webtor-io/torrent-web-seeder) | MIT | Selected | false |
| [content-transcoder](https://github.com/webtor-io/content-transcoder) | MIT | Selected | false |
| [magnet2torrent](https://github.com/webtor-io/magnet2torrent) | MIT | Selected | false |
| [torrent-store](https://github.com/webtor-io/torrent-store) | MIT | Selected | false |
| [torrent-http-proxy](https://github.com/webtor-io/torrent-http-proxy) | MIT | Selected | false |
| [content-prober](https://github.com/webtor-io/content-prober) | MIT | Selected | false |
| [helm-charts](https://github.com/webtor-io/helm-charts) | MIT | Outside assembly | true |
| [platform-sdk-js](https://github.com/webtor-io/platform-sdk-js) | MIT | Outside assembly | true |
| [gracenet](https://github.com/webtor-io/gracenet) | MIT | Outside assembly | false |
| [common-services](https://github.com/webtor-io/common-services) | MIT | Dependency / support inspected | false |
| [srt2vtt](https://github.com/webtor-io/srt2vtt) | MIT | Selected | false |
| [node-dns-syncer](https://github.com/webtor-io/node-dns-syncer) | MIT | Outside assembly | false |
| [embed-sdk-js](https://github.com/webtor-io/embed-sdk-js) | MIT | Dependency / support inspected | false |
| [external-proxy](https://github.com/webtor-io/external-proxy) | MIT | Selected | false |
| [torrent-archiver](https://github.com/webtor-io/torrent-archiver) | MIT | Selected | false |
| [video-info](https://github.com/webtor-io/video-info) | MIT | Selected | false |
| [platform-sdk-php](https://github.com/webtor-io/platform-sdk-php) | MIT | Outside assembly | false |
| [platform-sdk-php-example](https://github.com/webtor-io/platform-sdk-php-example) | MIT | Outside assembly | true |
| [balancer-excluder](https://github.com/webtor-io/balancer-excluder) | NOASSERTION | Outside assembly | false |
| [job-cleaner](https://github.com/webtor-io/job-cleaner) | NOASSERTION | Outside assembly | false |
| [torrent-web-cache](https://github.com/webtor-io/torrent-web-cache) | MIT | Outside assembly | false |
| [torrent-cache-cleaner](https://github.com/webtor-io/torrent-cache-cleaner) | MIT | Outside assembly | false |
| [webtorrent-tracker](https://github.com/webtor-io/webtorrent-tracker) | NOASSERTION | Outside assembly | false |
| [video-thumbnails-generator](https://github.com/webtor-io/video-thumbnails-generator) | MIT | Outside assembly | false |
| [image-transformer](https://github.com/webtor-io/image-transformer) | MIT | Outside assembly | false |
| [dnslb](https://github.com/webtor-io/dnslb) | MIT | Outside assembly | false |
| [nginx-vod](https://github.com/webtor-io/nginx-vod) | NOASSERTION | Selected | false |
| [go-jackett](https://github.com/webtor-io/go-jackett) | MIT | Outside assembly | false |
| [transcode-web-cache](https://github.com/webtor-io/transcode-web-cache) | MIT | Outside assembly | false |
| [webhook](https://github.com/webtor-io/webhook) | NOASSERTION | Outside assembly | false |
| [download-progress](https://github.com/webtor-io/download-progress) | NOASSERTION | Outside assembly | false |
| [abuse-store](https://github.com/webtor-io/abuse-store) | MIT | Dependency / support inspected | false |
| [url-store](https://github.com/webtor-io/url-store) | NOASSERTION | Outside assembly | false |
| [lazymap](https://github.com/webtor-io/lazymap) | MIT | Outside assembly | false |
| [mediaelement](https://github.com/webtor-io/mediaelement) | MIT | Outside assembly | false |
| [p2p-media-loader](https://github.com/webtor-io/p2p-media-loader) | Apache-2.0 | Dependency / support inspected | false |
| [job-pooler](https://github.com/webtor-io/job-pooler) | MIT | Outside assembly | false |
| [content-enhancer](https://github.com/webtor-io/content-enhancer) | MIT | Outside assembly | false |
| [retry-proxy](https://github.com/webtor-io/retry-proxy) | MIT | Outside assembly | false |
| [wordpress-plugin](https://github.com/webtor-io/wordpress-plugin) | NOASSERTION | Outside assembly | false |
| [node-manager](https://github.com/webtor-io/node-manager) | MIT | Outside assembly | false |
| [blog](https://github.com/webtor-io/blog) | NOASSERTION | Outside assembly | false |
| [web-ui-v1](https://github.com/webtor-io/web-ui-v1) | NOASSERTION | Outside assembly | true |
| [rest-api](https://github.com/webtor-io/rest-api) | MIT | Selected | false |
| [rapidapi-gateway](https://github.com/webtor-io/rapidapi-gateway) | MIT | Outside assembly | false |
| [nordvpn-config-fetcher](https://github.com/webtor-io/nordvpn-config-fetcher) | MIT | Outside assembly | false |
| [torrent-web-seeder-cleaner](https://github.com/webtor-io/torrent-web-seeder-cleaner) | MIT | Selected | false |
| [web-ui](https://github.com/webtor-io/web-ui) | MIT | Selected | false |
| [stoplist](https://github.com/webtor-io/stoplist) | MIT | Outside assembly | false |
| [torrent](https://github.com/webtor-io/torrent) | MPL-2.0 | Dependency / support inspected | false |
| [claims-provider](https://github.com/webtor-io/claims-provider) | MIT | Dependency / support inspected | false |
| [self-hosted](https://github.com/webtor-io/self-hosted) | MIT | Selected | false |
| [.github](https://github.com/webtor-io/.github) | MIT | Outside assembly | false |
| [community](https://github.com/webtor-io/community) | NOASSERTION | Outside assembly | false |
| [vault](https://github.com/webtor-io/vault) | MIT | Selected | false |
| [utp](https://github.com/webtor-io/utp) | MPL-2.0 | Dependency / support inspected | false |
| [s3-cache](https://github.com/webtor-io/s3-cache) | NOASSERTION | Dependency / support inspected | false |
| [api-sdk-go](https://github.com/webtor-io/api-sdk-go) | MIT | Dependency / support inspected | false |
| [webtor-cli](https://github.com/webtor-io/webtor-cli) | MIT | Outside assembly | false |
| [homebrew-tap](https://github.com/webtor-io/homebrew-tap) | NOASSERTION | Outside assembly | false |
| [subtitle-translate](https://github.com/webtor-io/subtitle-translate) | MIT | Selected | false |

## Additional dependency findings

- The seeder and magnet resolver use Webtor's anacrolix/torrent fork through Go module replacement. The torrent fork and its `utp` fork have MPL-2.0 licenses, not MIT. No changes to their source were made by Torrently. Preserve source links and make covered source available if redistributing their binaries.
- `common-services` provides configuration, PostgreSQL, Redis, HTTP lifecycle and observability helpers. `lazymap` and Go pseudo-version dependencies are locked by upstream go.mod/go.sum, not separately deployed.
- `abuse-store` and `claims-provider` are hosted policy/account services absent from the single-container assembly. Torrently must enforce its own authorization; it must not depend on hosted paid claims.
- `s3-cache` has no root license file in the inspected tree and no Dockerfile service stage. Do not copy its source as though it were MIT.
- `api-sdk-go` / `embed-sdk-js` are not needed for the server-side adapter. `p2p-media-loader` is Apache-2.0; it is not enabled in Torrently and would change browser peer/privacy semantics.
- `net-merge` is outside the Webtor org and is not required or installed.
- `nginx-vod` wrapper repository has no root license file; its OCI license label is empty. Its Dockerfile compiles NGINX 1.26.2, Kaltura nginx-vod-module `26f06877b0f2a2336e59cda93a3de18d7b23a3e2` and nginx-secure-token-module `24f7b99d9b665e11c92e585d6645ed6f45f7d310`. Component licenses are separate from the wrapper's unresolved license.

Read scope: README, Dockerfile, root configuration/module manifests, source entry points, routes/model definitions, relevant service implementations, test filenames and selected tests, and latest commit metadata were inspected for every assembled Webtor repository. This is not an exhaustive security audit or full transitive license certification.
