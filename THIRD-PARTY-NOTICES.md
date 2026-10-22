# Third-party notices

Torrently uses the official Webtor self-hosted container through its authenticated API. It does not copy Webtor logos, hosted content or commercial credentials. Source and image provenance is recorded in `upstream.lock.json`; detailed component roles and all 63 organization repositories are in `docs/audit/dependency-inventory.md`.

Unmodified selected Webtor repository license texts are preserved in `LICENSES/`. Those repositories use MIT, except the anacrolix/torrent and utp forks, which use MPL-2.0, and p2p-media-loader, which uses Apache-2.0. p2p-media-loader is investigated only and not enabled. Copyright notices remain in the license files; do not replace all upstream notices with Torrently's project license.

The container includes independently licensed third-party software: NGINX and Kaltura modules, PostgreSQL, Redis, FFmpeg and codec libraries, NATS, VersityGW, OpenSSL, zlib, PCRE, s6-overlay, and Alpine packages. An MIT label on the Webtor assembly is not a license for every component. Exact distro package versions/configuration must be captured from the final built image. In particular FFmpeg obligations depend on its compiled codecs and flags; Redis licensing depends on its installed version and selected license. Capture the actual package SBOM, license texts and corresponding source locations before distributing a binary/image bundle.

The selected `nginx-vod` wrapper repository has no root LICENSE file and an empty OCI license label. Its Dockerfile pins upstream NGINX 1.26.2 plus Kaltura nginx-vod-module `26f06877b0f2a2336e59cda93a3de18d7b23a3e2` and nginx-secure-token-module `24f7b99d9b665e11c92e585d6645ed6f45f7d310`. Retain their separate copyright/license terms. No blanket “all MIT” or complete transitive license-compliance assertion is made. The investigated `s3-cache` repository likewise had no root LICENSE and is not copied or deployed independently.

Covered MPL source is unmodified and available from the exact upstream Go module revisions used by the image source:

- Torrent seeder fork: `github.com/webtor-io/torrent` at `be58dc6815b7`.
- Magnet resolver fork: `github.com/webtor-io/torrent` at `8104a10a32f8`.
- uTP fork: `github.com/webtor-io/utp` at `24e7018d4f71`.

Source URLs: https://github.com/webtor-io/torrent and https://github.com/webtor-io/utp . If redistributing covered binaries, include the required source availability notice and make the exact covered source available under MPL-2.0; preserve any notices from other linked modules as well. This inventory is an engineering record, not a completed legal review.

Application npm dependencies are pinned in `package-lock.json`. Their own package license files must accompany redistributed packages/bundles where required. The actual final application dependency manifest and image SBOM are the sources of truth, rather than a guessed list based on the architecture.
