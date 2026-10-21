# Move from the laptop to a dedicated Linux host

OVHcloud or Hetzner can later replace the laptop without changing frontend contracts. No instance is created and no expenditure is authorized by this guide. Select hardware and bandwidth only after measuring real stream/transcode load and checking the provider's torrent/media terms.

1. Inventory the current source commit, built image digests, `.env`, database versions, volume sizes and measured CPU/RAM/egress. Keep permanent metadata and `/storage` separate from disposable `/data`.
2. Prepare the destination with Docker Engine/Compose, private SSH and sufficient filesystem headroom. Use the same pinned images/source and conservative limits first. Do not expose databases or upstream workers.
3. Take an offline-consistent [backup](operations/backup-restore.md). Transfer it encrypted through an authenticated channel; preserve xattrs and secret permissions. Restore into empty destination volumes. Torrent cache can be skipped and re-fetched, costing bandwidth/time. Transferring it is optional and requires an approved maintenance window.
4. Change `TORRENT_CACHE_PATH`, `PUBLIC_ORIGIN`, TLS hostname/bind settings and any private backend routing. Keep `WEBTOR_URL=http://webtor:8080` inside Compose unless deliberately moving the engine separately. Keep API credentials server-side and preserve library/session secrets when continuity is wanted.
5. Run upstream and Torrently acceptance checks, including authenticated Range/HLS, library/progress and restart recovery. Measure actual disk/network/transcode behavior again.
6. After approval, switch DNS/TLS/traffic, verify from an external client, and retain the laptop as rollback until metadata is confirmed. Avoid writes to both databases during cutover.

The first deployment intentionally stays on one machine. A later separated engine can run behind private VPN networking; export origins and allowed proxy targets must be updated together. Horizontal scale needs shared durable state, explicit distributed concurrency reservations and a single scheduled-cleanup owner. Those systems are not implemented or claimed by the single-host configuration.
