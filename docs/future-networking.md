# Future networking: net-merge evaluation

Inspected upstream `rohit267/net-merge` source commit `fe343c69b2020bed415e8ed669cee5a7f34d8918` on 2026-10-22: README, LICENSE, THIRD-PARTY-NOTICES, docs/DEVELOPING.md, CLI and SOCKS5 implementation. No binary was installed or executed and no network routes changed.

Source: [net-merge](https://github.com/rohit267/net-merge/tree/fe343c69b2020bed415e8ed669cee5a7f34d8918). Root license is MIT, copyright 2026 Rohit Mahto. Its dependencies include MIT, Apache-2.0 and BSD code; Windows Wintun binaries use a separate prebuilt-binaries license. Preserve the project's notices if distributing it.

The project supports Windows, macOS and Linux. Its system-wide mode creates a TUN/utun/Wintun adapter, adds two `/1` routes for each IP family and distributes newly created flows among physical interfaces. Linux needs network capabilities/admin privileges; this affects host networking and is not part of Torrently's normal container configuration. Ubuntu Server would use the console mode rather than a desktop tray.

A lower-impact mode is `net-merge socks`: a loopback SOCKS5 proxy at `127.0.0.1:1080`, with per-application opt-in. The inspected `internal/engine/socks5.go` accepts SOCKS CONNECT only; UDP ASSOCIATE is explicitly refused (`TestUDPAssociateRefusedCleanly`). System-wide TUN mode supports TCP/UDP, but this does not mean SOCKS mode carries UDP trackers, DHT or uTP. Webtor's `HTTP_PROXY` setting is not a verified whole-engine SOCKS routing solution; do not assume it proxies every BitTorrent peer socket. Container loopback also is not host loopback, so merely configuring `127.0.0.1:1080` inside Webtor would point to the container itself.

This is connection scheduling, not packet-level bonding. One TCP connection stays on one physical uplink. Multiple torrent peer connections might spread over independent uplinks, but one user's direct HTTP download or a long-lived stream cannot add all uplinks into one faster flow. Wi-Fi and Ethernet attached to the same 100 Mbps residential WAN do not create independent internet capacity. A phone data link may add independent capacity, at the cost of metered data and carrier restrictions.

It does not solve residential inbound CGNAT, create port forwarding, provide HTTPS, conceal the server's IP from peers, or turn a private LAN service into a public endpoint. HTTP client access and BitTorrent peer connectivity remain separate deployment decisions.

Keep it optional and off initially. First measure Ethernet performance, disk throughput, CPU cost and real stream startup/seek behavior. Only then test a pinned net-merge release on the laptop with controlled traffic, inspect chosen interfaces using `net-merge list/status`, prove which torrent transports use each link, and compare useful throughput/CPU/packet loss. Retain console access and a rollback plan before any authorized route/capability changes. No speed claims from the upstream README were reproduced on the Predator.
