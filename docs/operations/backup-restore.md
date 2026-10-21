# Backup, restore and upgrades

Permanent: Torrently PostgreSQL, Webtor embedded PostgreSQL, auxiliary app data, embedded S3 (subtitles and object metadata), `.env`, and the source/image version record. Disposable: torrent pieces/transcoder output in `/data`, generated posters where safely regenerable, rotated logs. Back up the whole S3 volume because mixing disposable and permanent prefixes makes selective recovery fragile. Preserve filesystem extended attributes; upstream's S3 gateway requires them.

## Back up

Run `scripts/backup.sh /absolute/private/backup-folder`. This intentionally stops Torrently/Webtor during the snapshot, leaves the separate library database running for `pg_dump`, archives all permanent volumes with GNU tar's xattr/ACL support, copies the private env and records the Git commit/checksums. Services are restarted by an EXIT trap. Check the restart succeeds, validate checksums and test the archive. The script never removes cache or volumes. It requires free space at the destination; prefer an external disk. A backup on the same HDD is only staging, not protection against drive failure.

The archive contains passwords, API credentials and user data. Keep it mode 600 inside a private directory; encrypt it using your established backup system before off-device transfer. Never attach it to a public issue. Do not print `docker compose config` or environment dumps into support logs. A plain `cp -r` of the S3 directory loses required metadata.

## Restore into a fresh instance

Restore is an operator action, not an automated deletion. Verify checksums and recover the source commit recorded in `source-commit.txt`. Stop the old service and reserve it for rollback. On a **new project/destination** with empty Compose volumes:

1. Securely copy `environment.private` to `.env`, mode 600. Preserve session/upstream/S3 secrets; change origins and host paths as appropriate. Do not overwrite an unrelated live deployment.
2. Create containers/volumes with `docker compose create postgres webtor app`. Ensure the named volumes are truly empty. Restore `persistent.tar.gz` to `app_data`, `webtor_pgdata` and `webtor_storage` using GNU tar as root with `--xattrs --acls --numeric-owner`. The archive's top directories are `app-data`, `webtor-pgdata`, `webtor-storage`; mount each target volume under those exact names in a temporary helper. Use the same pinned Node Debian image as Compose's backup helper, with writable mounts for this restore only. Do not mount the cache over a permanent-data path.
3. Start `postgres`; wait for `pg_isready`. Load `torrently.pgdump` using `docker compose exec -T postgres pg_restore -U torrently -d torrently --exit-on-error < /private/path/torrently.pgdump`. This assumes a fresh database. Never add `--clean` against a working database merely to clear a restore error.
4. Start Webtor, then the app. Embedded Webtor PostgreSQL raw data must be restored into the matching major version; upgrade that database through PostgreSQL's supported process if the upstream image changed. Check `PG_VERSION` before proceeding.
5. Re-run health, sign-in, library/progress, real fixture, Range and media playback checks. Verify embedded S3 object round-trip/xattrs with upstream's self-hosted smoke suite. Only then switch traffic. Retain the prior instance until verified.

Restore commands are intentionally tied to measured volume names and empty destinations. `docker volume ls` and `docker compose config --volumes` show names without exposing secrets. Never run `down -v` on the original system. A periodic restore rehearsal on a spare machine is required; archive creation alone does not prove recoverability.

## Upgrade and rollback

Create a backup and note the current Git commit plus `docker compose images`. Read upstream migration/release notes. Update `upstream.lock.json` and the Compose source SHA together; keep component digest provenance. Rebuild on a staging host, run the upstream smoke suite against the built image and Torrently's acceptance tests, then schedule downtime and deploy. The current assembly pins component digests but upstream Alpine/apk and s6 downloads are not completely locked; after a verified build, record and deploy the resulting immutable registry digest for stronger reproducibility. Do not substitute `latest`.

Migrations may prevent an old app/image from opening a newer database. Rollback uses the matching image/source plus pre-upgrade database/storage backup, restored into fresh volumes. Do not simply point old services at migrated files. No unattended image-updater is included; Ubuntu security updates and explicit image upgrades are distinct processes.
