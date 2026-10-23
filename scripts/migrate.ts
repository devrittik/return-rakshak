/**
 * Applies db/migrations/*.sql in order. Works against the local SQLite file and
 * against Turso/libSQL when TURSO_DATABASE_URL is set; drizzle's libSQL migrator
 * keeps a __drizzle_migrations table so re-runs are no-ops.
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./data/returnrakshak.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url.startsWith("file:")) {
    const path = url.slice(5);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  }

  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  const database = drizzle(client);

  await migrate(database, { migrationsFolder: "./db/migrations" });
  await client.execute("PRAGMA foreign_keys = ON");
  console.log(`✔ migrations applied → ${url.startsWith("file:") ? url : "turso"}`);
  client.close();
}

main().catch((error) => {
  console.error("✖ migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
