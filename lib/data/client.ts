import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databaseConfig } from "@/lib/env";
import { assertSafeDeployment } from "@/lib/security/deployment";
import * as schema from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

/**
 * One driver for both modes: @libsql/client speaks the SQLite file protocol
 * locally and the libSQL wire protocol against Turso when TURSO_DATABASE_URL is
 * set. Business logic never learns which one it is talking to.
 */
let singleton: Database | null = null;

export function createDatabase(opts?: { url?: string; authToken?: string }): Database {
  const cfg = opts?.url ? { url: opts.url, authToken: opts.authToken } : databaseConfig();

  // Local file mode: make sure the directory exists (it lives outside public/).
  if (cfg.url.startsWith("file:")) {
    const path = cfg.url.slice("file:".length);
    if (path && path !== ":memory:") {
      try {
        mkdirSync(dirname(path), { recursive: true });
      } catch {
        /* read-only FS in some hosted runtimes — Turso is the answer there. */
      }
    }
  }

  const client = createClient({ url: cfg.url, ...(cfg.authToken ? { authToken: cfg.authToken } : {}) });
  return drizzle(client, { schema });
}

export function db(): Database {
  assertSafeDeployment();
  singleton ??= createDatabase();
  return singleton;
}
