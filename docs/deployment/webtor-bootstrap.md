# Private Webtor bootstrap

Torrently uses the official all-in-one source at the exact SHA in `compose.yaml`. Its external API is `/api/v1`, authenticated with a **profile-generated API credential**. The upstream `API_KEY`/`API_SECRET` are internal signing keys and cannot be used as that credential. Never place any of them in `VITE_*` variables.

1. Install Docker Engine and Compose; run `node scripts/init-env.mjs`. Set your administrator email and a password you know in `.env` using a private local editor. The generated random passwords and secrets stay in that private file. Keep the Webtor administrator password distinct from Torrently's.
2. Build and start the private upstream and the library database:

   ```sh
   docker compose -f compose.yaml -f compose.admin.yaml up -d --build webtor postgres
   ```

3. From the server itself, open `http://localhost:18080`. From your Mac, use a tunnel:

   ```sh
   ssh -L 18080:127.0.0.1:18080 youruser@predator-lan-ip
   ```

   Open `http://localhost:18080` on the Mac. Sign in with the Webtor password in `.env`, go to Profile, and generate an API credential. Paste that credential into `WEBTOR_API_KEY` in the server `.env` via an editor. Do not paste it in chat, command arguments or screenshots.
4. Remove the temporary operator port and restore the internal export origin:

   ```sh
   docker compose up -d --build --force-recreate webtor app
   docker compose ps
   ```

   Always omit `compose.admin.yaml` in normal operation. This recreates Webtor with `DOMAIN=http://webtor:8080`; its database and persistent S3 volumes survive. Credentials set in `.env` remain stable across replacement. Do not run `down -v`.
5. Open Torrently at `http://localhost:3000` (or use a separate SSH tunnel). Sign in using Torrently's administrator email/password. Test the controlled fixture and real Range download before LAN/public access.

The admin override binds only to loopback. It is deliberately not part of the normal Compose service. API export links are server-side URLs: Torrently must proxy and rewrite them so browsers never need to reach `webtor:8080` or receive the credential.

Configuration and startup have been inspected against upstream source. This workstation has no Docker runtime; successful image build, credential provisioning and media playback must be verified on a Linux or Docker host. A login-page health check establishes HTTP readiness only, not complete worker readiness; the full stack smoke test is required.
