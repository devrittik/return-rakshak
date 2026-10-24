import { z } from "zod";

/**
 * Server-only environment. Importing this from a client component is a bug:
 * secrets (DB tokens, AI keys) must never cross the network boundary.
 * Validation is lazy so `next build` without a database still succeeds.
 */
const schema = z.object({
  DATABASE_URL: z.string().optional(),
  TURSO_DATABASE_URL: z.string().url().optional(),
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),

  AI_PROVIDER: z.enum(["mock", "openai-compatible"]).default("mock"),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),

  RR_LOCAL_USER_EMAIL: z.string().email().default("local@returnrakshak.invalid"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Tests use this to vary `process.env` between cases. Production never calls it. */
export function resetEnvCache(): void {
  cached = null;
}

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Never echo values — only the offending keys.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration for: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export type DatabaseMode = "turso" | "local-file" | "memory";

export function databaseConfig(): { mode: DatabaseMode; url: string; authToken?: string } {
  const e = env();
  if (e.TURSO_DATABASE_URL) {
    return { mode: "turso", url: e.TURSO_DATABASE_URL, authToken: e.TURSO_AUTH_TOKEN };
  }
  return { mode: "local-file", url: e.DATABASE_URL ?? "file:./data/returnrakshak.db" };
}
