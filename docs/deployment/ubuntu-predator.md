# Predator Helios 300: Ubuntu Server deployment

The model family is known; its exact CPU, RAM, GPU, disk health and free space are **not measured**. Do not infer GPU capabilities from the Predator name. The laptop is currently Windows 11 and was not connected during development. Nothing here has repartitioned it, changed firmware, or exposed a port.

## Before installing anything

Run `scripts/preflight-windows.ps1` in PowerShell on the laptop. Retain the output privately; adapter/IP information can identify your LAN. Back up documents, browser profiles, password vaults, license/recovery keys, SSH keys and any application data to another physical disk. Export the BitLocker recovery key if enabled and make a Windows recovery USB. Open several backup files and test recovery before continuing. Record Wi-Fi/Ethernet drivers, BIOS version, boot mode and existing disk layout.

Installing Ubuntu and changing partitions require the owner's explicit approval at that time. The included scripts never perform installation or repartitioning. Prefer an Ubuntu Server 24.04 LTS USB from [Ubuntu](https://ubuntu.com/download/server), verify its checksum, boot in UEFI mode, and review every disk-selection screen. Do not disable Secure Boot automatically; Ubuntu normally supports it. On some Intel RST installations changing SATA mode can make Windows unbootable; record the existing mode and investigate before changing it. Encryption improves protection but requires an unlock strategy after unattended restarts.

## Storage and sizing

Start with the existing 1 TB HDD, after SMART and free-space checks. There is no assumed partition plan. Reserve at least 80–100 GB for Ubuntu, container images and upgrades **and** preserve a 25% free-space margin on the cache filesystem. Example planning allocation after Windows is deliberately replaced: 100 GB OS/container overhead, 50 GB permanent databases/library/subtitles, 500 GB disposable torrent/transcode cache, 100 GB local backup staging, remainder unallocated/reserve. These are estimates; calculate from the measured capacity and other services.

Default paths and ownership:

| Data | Default | Persistence |
|---|---|---|
| Application auxiliary data | Compose `app_data` volume | Permanent |
| Torrently library/accounts/progress | Compose `postgres_data` volume | Permanent |
| Webtor settings/credentials/database | `webtor_pgdata` volume | Permanent |
| Webtor embedded S3/subtitles | `webtor_storage` named volume | Permanent, preserve xattrs |
| Torrent pieces and generated transcodes | `./data/torrent-cache` bind mount | Disposable |
| Container logs | Docker logging driver, 3 × 10 MB per service | Rotated |
| Backups | Explicit path passed to backup script | Off-disk copy required |

`TORRENT_CACHE_PATH` can be an absolute Linux path such as `/srv/torrently/cache`, created before startup. It may be placed on a dedicated filesystem with a bounded allocation by the owner. The upstream cleaner is a free-space safeguard, not a hard global cache quota; for a strict ceiling use a filesystem/volume quota after reviewing the actual disk. It starts near 25% free and evicts eligible cache toward 35% free. `PER_TORRENT_CACHE_BUDGET=10GB` bounds an individual torrent cache, not all caches together. Cache eviction never removes Torrently's library records. Do not run blind `rm` jobs against active torrent pieces.

The upstream all-in-one directs transcoder output into `/data`; separate temporary transcoding storage requires an upstream run-script change and is not claimed here. The persistent library stores metadata, not a second copy of all media. Vault is disabled initially to avoid uncontrolled permanent media growth. Named storage volumes live under Docker's data root. If relocating that root, stop Docker and follow Docker's supported migration process; do not replace the embedded S3 volume with a macOS/Windows bind mount.

Estimated starting host: 4 modern CPU threads, 8 GB RAM minimum for experiments (16 GB preferred), healthy HDD, Ethernet. Container caps total roughly 5.3 GB plus the OS/page cache; reduce concurrency if RAM is smaller. Start at 2 direct streams, 2 downloads, 1 optional CPU transcode, 2 FFmpeg threads. These caps and performance are unbenchmarked. One CPU transcode may still be too slow. No GPU acceleration is configured or claimed. With 100 Mbps uplink, plan below 70–80 Mbps sustained egress until measured; actual viewer capacity depends on bitrate and random disk access.

## Ubuntu baseline

After approved installation, create a non-root administrator and use Ethernet. Configure a DHCP reservation on the router rather than guessing a static address. Run `scripts/preflight-linux.sh` and record CPU/RAM, `lsblk`, filesystem availability and GPU model. Install packages from supported repositories:

```sh
sudo apt update
sudo apt install ca-certificates curl git openssh-server ufw unattended-upgrades smartmontools lm-sensors sysstat
sudo systemctl enable --now ssh
```

Install Docker Engine and its Compose plugin using the [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Review existing Docker installations first; do not remove working packages blindly. Docker's convenience script is not embedded here. Verify:

```sh
sudo docker run --rm hello-world
sudo docker compose version
sudo systemctl enable --now docker
```

Use `sudo docker` unless you deliberately grant Docker-group membership: that group is root-equivalent. All following `docker` commands assume an authorized Docker account. Install the same Node 24 runtime used in `docker/Dockerfile` only if running npm and the env helper directly; it is unnecessary for the built app container. Alternatively generate `.env` from a trusted development computer and securely transfer it with mode 600.

Before enabling a firewall, allow SSH from your actual management subnet and verify a second SSH connection. Example only, substitute the real LAN subnet:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Docker published ports can bypass UFW's normal input rules. The default Compose bind is loopback; retain that for initial setup. For LAN mode bind to the specific LAN IP and use router/VLAN controls or Docker's documented firewall integration to restrict access. Never publish PostgreSQL, Redis, NATS or worker ports.

## Power, lid and thermal behavior

Review cooling and battery condition first; keep vents unobstructed on a hard surface. An old/swollen battery needs service rather than continuous charging. Ubuntu Server generally avoids desktop sleep, but verify `systemctl status sleep.target suspend.target hibernate.target hybrid-sleep.target` and `loginctl show-session` if relevant.

After owner approval of continuous-running behavior, create `/etc/systemd/logind.conf.d/torrently.conf` with:

```ini
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
```

Apply during a maintenance window (`sudo systemctl restart systemd-logind` may interrupt sessions). Where sleep is still scheduled, the owner can run `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`; undo with `systemctl unmask` on the same targets. Do not override critical low-battery shutdown or thermal protections. Check BIOS/UEFI for a supported "power on after AC loss" option; many laptops lack it. Do not flash firmware or alter BIOS automatically.

Inspect `sensors`, `sudo smartctl -a /dev/sdX` (substitute the measured disk), `iostat -xz 2`, `free -h` and `docker stats`. Schedule SMART tests during quiet hours after verifying device support. Stop and investigate rising reallocated/pending sectors or thermal throttling before increasing load. Keep automatic Ubuntu security updates enabled; plan reboots and image upgrades explicitly.

## Deploy and access

Clone Torrently into `/srv/torrently` or another approved location. Use a feature/release commit, preserve `.env`, and follow [private bootstrap](webtor-bootstrap.md). No cloud account, commercial object storage or Kubernetes is required. Set the cache path before build; create it with restricted permissions. Do not issue `docker compose down -v`.

For private local access from macOS:

```sh
ssh -L 3000:127.0.0.1:3000 youruser@predator-lan-ip
```

For LAN access, set `BIND_ADDRESS` to the server's LAN IP, `PUBLIC_ORIGIN=http://that-ip:3000` and `COOKIE_SECURE=false`; recreate the app. Authentication stays on. LAN HTTP transmits credentials without TLS, so restrict it to a trusted private LAN or use an SSH tunnel. Public operation uses the separate [network guide](network.md).

Docker restart policies recover services after process failure and boot once Docker is enabled. Verify with an approved normal restart and then with a host reboot. Run [acceptance checks](../operations/verification.md) before declaring deployment functional, and take an off-device backup.
