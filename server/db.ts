import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import type { Config } from "./config.js";
export interface DB {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}
export async function database(
  config: Pick<Config, "DATABASE_URL" | "DATA_DIR">,
): Promise<DB> {
  if (config.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    return {
      query: async <T>(s: string, p?: unknown[]) => ({
        rows: (await pool.query(s, p)).rows as T[],
      }),
      close: () => pool.end(),
    };
  }
  await mkdir(config.DATA_DIR, { recursive: true, mode: 0o700 });
  const db = new PGlite(`${config.DATA_DIR}/postgres`);
  await db.waitReady;
  return {
    query: async <T>(s: string, p?: unknown[]) => db.query<T>(s, p),
    close: () => db.close(),
  };
}
export async function migrate(db: DB) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  const applied = await db.query(
    "SELECT version FROM schema_migrations WHERE version=1",
  );
  if (applied.rows.length) return;
  // Each statement is idempotent so an interrupted initial migration is safe to retry.
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY,email text UNIQUE NOT NULL,password_hash text NOT NULL,admin boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf text NOT NULL,expires_at timestamptz NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS resources (id text PRIMARY KEY,name text NOT NULL,metadata jsonb NOT NULL,updated_at timestamptz DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS resource_access (user_id text REFERENCES users(id) ON DELETE CASCADE,resource_id text REFERENCES resources(id) ON DELETE CASCADE,opened_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,resource_id))`,
    `CREATE TABLE IF NOT EXISTS library (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,resource_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,name text NOT NULL,favorite boolean NOT NULL DEFAULT false,progress jsonb,updated_at timestamptz DEFAULT now(),UNIQUE(user_id,resource_id))`,
    `CREATE TABLE IF NOT EXISTS media_tickets (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,resource_id text NOT NULL REFERENCES resources(id) ON DELETE CASCADE,url text NOT NULL,type text NOT NULL,expires_at timestamptz NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS abuse_reports (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),resource_id text,reason text NOT NULL,created_at timestamptz DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
    `CREATE INDEX IF NOT EXISTS tickets_expiry ON media_tickets(expires_at)`,
    `INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING`,
  ];
  for (const statement of statements) await db.query(statement);
}
