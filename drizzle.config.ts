import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit always generates plain SQLite migrations, which both the local
 * file database and Turso/libSQL apply identically.
 */
export default defineConfig({
  schema: "./lib/data/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL ?? "file:./data/returnrakshak.db" },
  strict: true,
  verbose: true,
});
