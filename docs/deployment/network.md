# LAN and public connectivity

Normal Compose binds Torrently to `127.0.0.1:3000`; Webtor has no host port. Use SSH tunnels first. LAN mode sets `BIND_ADDRESS=<measured LAN IP>` and matching `PUBLIC_ORIGIN`, with private router/firewall restrictions. An address is never hardcoded into the application.

Before public operation, compare the router's WAN address to an independently observed public IP. A private WAN address (`10/8`, `172.16/12`, `192.168/16`) or carrier-grade `100.64/10`, or a mismatch, suggests double NAT/CGNAT; ask the ISP about routed connectivity. Do not publish your address in an issue. Confirm ISP policy, upload stability, usable IPv6, router forwarding and any port restrictions. Do not probe unrelated networks. Dynamic DNS updates can follow a changing address after a domain/provider is chosen.

Two independent paths matter:

* Browser HTTP/HTTPS access uses Torrently's reverse proxy.
* BitTorrent connects to trackers and peers from Webtor. Outbound connections often work behind NAT; reachable inbound peer ports can improve connectivity. This deployment deliberately publishes no peer ports because the upstream listen-port configuration must be measured before forwarding. HTTP tunneling does not automatically carry peer TCP/UDP.

## Optional public profile

Enable only after the owner approves the hostname, router changes and public exposure. Configure:

```dotenv
PUBLIC_HOSTNAME=torrently.your-domain.example
PUBLIC_BIND_ADDRESS=0.0.0.0
PUBLIC_ORIGIN=https://torrently.your-domain.example
COOKIE_SECURE=true
TRUST_PROXY=true
BIND_ADDRESS=127.0.0.1
```

Then run `docker compose --profile public up -d --build`. Caddy handles TLS and forwards only to the authenticated Torrently app. Public A/AAAA DNS and inbound 80/443 must reach it for its default ACME flow. Do not copy the example hostname literally. Keep upstream/admin overrides disabled. Check HTTPS, redirects, cookie attributes, authenticated byte ranges, HLS rewriting, error handling and login rate limiting from a separate network. Use a strong unique password and maintain updates. Never proxy `/rest-api/` around Webtor's authenticated `/api/v1`.

For CGNAT, the initial recommendation is a private WireGuard/Tailscale-style network for invited users after checking bandwidth and account terms. For public access, a deliberately selected VPS with a WireGuard tunnel and an HTTPS reverse proxy can forward HTTP streaming to the laptop; this adds cost and transfer limits and is not provisioned here. Keep BitTorrent egress/peer connectivity separate. A media-capable ISP-routed address or IPv6 is another option after validating client reachability. No Cloudflare CDN or unrestricted Cloudflare Tunnel video proxy is assumed. Review the selected provider's media, torrent and transfer policies before use.

The public profile is configuration, not evidence of a working public endpoint. DNS, CGNAT status, port forwarding, certificates and residential throughput were not tested on the unavailable laptop.
