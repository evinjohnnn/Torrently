import { z } from "zod";
const integer = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const value = z
    .object({
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      PORT: integer(3000),
      PUBLIC_ORIGIN: z.string().url().default("http://localhost:3000"),
      WEBTOR_URL: z.string().url().default("http://127.0.0.1:8080"),
      WEBTOR_API_KEY: z.string().default(""),
      DATABASE_URL: z.string().default(""),
      DATA_DIR: z.string().default(".data"),
      CACHE_DIR: z.string().default(""),
      ADMIN_EMAIL: z.string().email().default("admin@localhost.test"),
      ADMIN_PASSWORD: z.string().min(12),
      SESSION_SECRET: z.string().min(32),
      COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
      MAX_STREAMS: integer(2),
      MAX_DOWNLOADS: integer(2),
      MAX_TRANSCODES: integer(1),
      MAX_TORRENTS: integer(20),
      MAX_TORRENT_BYTES: integer(2_000_000),
      MAX_RESOURCE_BYTES: integer(200_000_000_000),
      MAX_CACHE_BYTES: integer(300_000_000_000),
      MIN_FREE_BYTES: integer(50_000_000_000),
      METADATA_TIMEOUT_MS: integer(90_000),
      TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    })
    .parse(env);
  const origin = new URL(value.PUBLIC_ORIGIN);
  const privateHost =
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})$/.test(
      origin.hostname,
    ) ||
    origin.hostname.endsWith(".local");
  if (value.NODE_ENV === "production" && !value.DATABASE_URL)
    throw new Error("Production requires PostgreSQL");
  if (
    !privateHost &&
    (origin.protocol !== "https:" || value.COOKIE_SECURE !== "true")
  )
    throw new Error("Public access requires HTTPS and secure cookies");
  if (value.COOKIE_SECURE === "true" && origin.protocol !== "https:")
    throw new Error("Secure cookies require an HTTPS origin");
  const url = new URL(value.WEBTOR_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("WEBTOR_URL must be an HTTP origin without credentials");
  return value;
}
export type Config = ReturnType<typeof configuration>;
