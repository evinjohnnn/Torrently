#!/usr/bin/env bash
# Read-only hardware report. No partition, firewall, BIOS or package changes.
set -euo pipefail
printf '\nOS and CPU\n'
uname -a
cat /etc/os-release
lscpu
printf '\nMemory\n'
free -h
printf '\nBlock devices and mounted free space\n'
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL
df -hT
printf '\nGPU and network adapters\n'
if command -v lspci >/dev/null; then lspci | grep -Ei 'vga|3d|display|ethernet|network' || true; fi
ip -brief address
printf '\nPower and temperature sensors (if installed)\n'
if command -v sensors >/dev/null; then sensors; fi
printf '\nDocker and Compose (if installed)\n'
if command -v docker >/dev/null; then docker version; docker compose version; fi
printf '\nFFmpeg encoders are reported only if FFmpeg is installed\n'
if command -v ffmpeg >/dev/null; then ffmpeg -hide_banner -encoders 2>/dev/null | grep -Ei '264|265|nvenc|qsv|vaapi' || true; fi
printf '\nNo benchmark or hardware encoder validation has been performed by this report.\n'
