import "dotenv/config";
import { randomUUID } from "node:crypto";
import { configuration } from "./config.js";
import { database, migrate } from "./db.js";
import { hashPassword } from "./auth.js";
import { z } from "zod";
const email = z.string().email().parse(process.argv[2]).toLowerCase(),
  admin = process.argv[3] === "--admin";
let password = "";
for await (const chunk of process.stdin) {
  password += chunk.toString();
  if (password.length > 1024) throw new Error("Password is too long");
}
password = password.replace(/\r?\n$/, "");
if (password.length < 12)
  throw new Error("Supply a password of at least 12 characters through stdin.");
const db = await database(configuration());
try {
  await migrate(db);
  const result = await db.query<{ id: string }>(
    `INSERT INTO users(id,email,password_hash,admin) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,admin=excluded.admin RETURNING id`,
    [randomUUID(), email, await hashPassword(password), admin],
  );
  await db.query("DELETE FROM sessions WHERE user_id=$1", [result.rows[0].id]);
  console.log("Account saved; existing sessions revoked.");
} finally {
  password = "";
  await db.close();
}
