import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import type { User } from "../shared/contracts.js";
import { AppError } from "./errors.js";
const scrypt = promisify(scryptCallback);
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(value, salt, 64)) as Buffer).toString("hex")}`;
}
export async function checkPassword(value: string, stored: string) {
  const [salt, key] = stored.split(":");
  const hash = (await scrypt(value, salt, 64)) as Buffer;
  return key?.length === 128 && timingSafeEqual(hash, Buffer.from(key, "hex"));
}
export type AuthRequest = Request & {
  user: User;
  csrfToken: string;
  sessionId: string;
};
export async function seedAdmin(db: DB, config: Config) {
  const existing = await db.query("SELECT id FROM users WHERE email=$1", [
    config.ADMIN_EMAIL.toLowerCase(),
  ]);
  if (!existing.rows.length)
    await db.query(
      "INSERT INTO users(id,email,password_hash,admin) VALUES ($1,$2,$3,true)",
      [
        randomUUID(),
        config.ADMIN_EMAIL.toLowerCase(),
        await hashPassword(config.ADMIN_PASSWORD),
      ],
    );
}
export function auth(db: DB) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.torrently_session;
    if (typeof token !== "string" || token.length !== 64)
      throw new AppError(401, "UNAUTHORIZED", "Sign in to continue.");
    const result = await db.query<User & { csrf: string; sessionId: string }>(
      `SELECT u.id,u.email,u.admin,s.csrf,s.id AS "sessionId" FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()`,
      [digest(token)],
    );
    const user = result.rows[0];
    if (!user)
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Your session expired. Sign in again.",
      );
    Object.assign(req, {
      user: { id: user.id, email: user.email, admin: user.admin },
      csrfToken: user.csrf,
      sessionId: user.sessionId,
    });
    next();
  };
}
export async function createSession(
  db: DB,
  res: Response,
  userId: string,
  config: Config,
) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES ($1,$2,$3,$4)",
    [digest(token), userId, csrf, new Date(Date.now() + 7 * 86400000)],
  );
  res.cookie("torrently_session", token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400000,
  });
  return csrf;
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-CSRF-Token") !== (req as AuthRequest).csrfToken)
    throw new AppError(403, "CSRF", "Refresh the page and retry this action.");
  next();
}
export function admin(req: Request, _res: Response, next: NextFunction) {
  if (!(req as AuthRequest).user.admin)
    throw new AppError(403, "FORBIDDEN", "Administrator access required.");
  next();
}
