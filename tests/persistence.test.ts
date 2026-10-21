import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { database, migrate } from "../server/db.js";
import { Capacity } from "../server/media.js";
import { configuration } from "../server/config.js";
test("PostgreSQL library metadata survives database close and reopen", async () => {
  const path = await mkdtemp(join(tmpdir(), "torrently-persist-"));
  const config = { DATABASE_URL: "", DATA_DIR: path };
  let db = await database(config);
  try {
    await migrate(db);
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES('user','user@localhost.test','hash')",
    );
    await db.query(
      "INSERT INTO resources(id,name,metadata) VALUES('resource','Fixture','{}')",
    );
    await db.query(
      "INSERT INTO library(id,user_id,resource_id,name,favorite,progress) VALUES('saved','user','resource','Fixture',true,'{\"fileId\":\"file\",\"position\":12,\"duration\":60}')",
    );
    await db.close();
    db = await database(config);
    await migrate(db);
    const saved = await db.query<{
      favorite: boolean;
      progress: { position: number };
    }>("SELECT favorite,progress FROM library WHERE id='saved'");
    assert.equal(saved.rows[0].favorite, true);
    assert.equal(saved.rows[0].progress.position, 12);
  } finally {
    await db.close();
    await rm(path, { recursive: true, force: true });
  }
});
test("capacity rejects excess work and releases slots", () => {
  const c = new Capacity({ stream: 1 });
  c.acquire("first", "stream");
  assert.throws(() => c.acquire("second", "stream"), /capacity/);
  c.acquire("first", "stream");
  assert.equal(c.count("stream"), 1);
  c.release("first");
  c.acquire("second", "stream");
  assert.equal(c.count("stream"), 1);
});
test("public HTTP and insecure production settings fail closed; LAN HTTP allowed", () => {
  const env = {
    ADMIN_PASSWORD: "a-long-test-password",
    SESSION_SECRET: "a-secure-session-secret-32-characters-long",
  };
  assert.throws(
    () =>
      configuration({
        ...env,
        PUBLIC_ORIGIN: "http://localhost.attacker.example",
      }),
    /HTTPS/,
  );
  assert.throws(
    () => configuration({ ...env, NODE_ENV: "production" }),
    /PostgreSQL/,
  );
  assert.equal(
    configuration({
      ...env,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://db",
      PUBLIC_ORIGIN: "http://192.168.1.50:3000",
    }).COOKIE_SECURE,
    "false",
  );
});
test("activity renews capacity beyond the original expiry while retaining backpressure", () => {
  const real = Date.now;
  let now = 0;
  Date.now = () => now;
  try {
    const c = new Capacity({ download: 1 });
    c.acquire("ongoing", "download", 10);
    now = 8;
    c.acquire("ongoing", "download", 10);
    now = 15;
    assert.equal(c.count("download"), 1);
    assert.throws(() => c.acquire("extra", "download", 10), /capacity/);
    c.release("ongoing");
    c.acquire("extra", "download");
  } finally {
    Date.now = real;
  }
});
