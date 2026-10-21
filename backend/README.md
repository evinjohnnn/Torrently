# Torrently torrent engine

`webtor/` contains the complete tracked source tree of [webtor-io/self-hosted](https://github.com/webtor-io/self-hosted) at commit `dbab88e695660d96073eb16ffd6738c57251d9e0`. It is vendored as regular files so cloning this Torrently repository also retrieves its Webtor backend source without submodule initialization.

Torrently's website lives in `../client/`, and its authenticated API adapter in `../server/`. Run the full stack from the repository root with the root Compose deployment and private environment/bootstrap procedure. Root Compose builds Webtor from `./backend/webtor` rather than fetching a separate Git repository.

The upstream directory is preserved unchanged, including its MIT LICENSE, README, Dockerfile, s6 process definitions, initialization scripts, nginx configuration, tests and upstream CI files. Nested `.github/workflows` are retained for provenance; only this repository's root workflows execute here. The upstream source has no nested `.git` directory.

Webtor's all-in-one Dockerfile assembles its engine from separately published component images with pinned digests. It does not contain the Go source of every worker repository, and a build still requires access to those image registries and package repositories. Exact component/source provenance and license boundaries are recorded in `../upstream.lock.json` and `../THIRD-PARTY-NOTICES.md`.

## Update deliberately

Select and inspect an exact upstream commit, import its tracked tree while preserving notices and executable modes, and update `upstream.lock.json` and provenance documentation together. Review upstream changes, image versions, environment contracts and licenses before replacing this snapshot. Run application tests plus the real controlled-fixture engine suite on Linux before deploying the update. Do not update from a floating branch during normal deployment.
