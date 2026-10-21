import "dotenv/config";
import { configuration } from "./config.js";
import { database, migrate } from "./db.js";
import { seedAdmin } from "./auth.js";
import { createApp } from "./app.js";
const config = configuration(),
  db = await database(config);
await migrate(db);
await seedAdmin(db, config);
const { app } = createApp(config, db);
const server = app.listen(config.PORT, "0.0.0.0", () =>
  console.log(
    JSON.stringify({
      event: "listening",
      port: config.PORT,
      engineConfigured: Boolean(config.WEBTOR_API_KEY),
    }),
  ),
);
const cleanup = setInterval(() => {
  void db
    .query("DELETE FROM sessions WHERE expires_at<now()")
    .catch(() =>
      console.warn(
        JSON.stringify({ event: "cleanup_failed", table: "sessions" }),
      ),
    );
  void db
    .query("DELETE FROM media_tickets WHERE expires_at<now()")
    .catch(() =>
      console.warn(
        JSON.stringify({ event: "cleanup_failed", table: "media_tickets" }),
      ),
    );
}, 300000);
cleanup.unref();
async function stop() {
  clearInterval(cleanup);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
