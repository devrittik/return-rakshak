# Deployment

## Local mode (default)

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

- Database: `data/returnrakshak.db` (git-ignored, outside `public/`).
- Temp uploads: OS temp directory, deleted per request.
- AI: `AI_PROVIDER=mock` by default — deterministic, offline, no keys.
- No account required.

## Hosted mode (Vercel + Turso)

1. Create a Turso database and token:
   ```bash
   turso db create returnrakshak
   turso db show returnrakshak --url
   turso db tokens create returnrakshak
   ```
2. Set environment variables in Vercel (server-side only, never `NEXT_PUBLIC_*`):
   ```
   TURSO_DATABASE_URL=libsql://...
   TURSO_AUTH_TOKEN=...
   AI_PROVIDER=openai-compatible
   AI_BASE_URL=https://your-inference-endpoint/v1
   AI_MODEL=your-open-weight-model
   ```
3. Apply migrations against the hosted database from CI or locally:
   ```bash
   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate
   ```
4. Do **not** set `DATABASE_URL=file:...` on Vercel — the filesystem is ephemeral and the file will vanish.

### Authentication gate

The hosted deployment is single-user until authentication ships. Records are already scoped by `user_id`, and `lib/session.ts` is the only place that resolves the current user, so the change is contained.

Production will not open `TURSO_DATABASE_URL` unless you set:

```
RR_ALLOW_UNAUTHENTICATED_HOST=1
```

That flag means the host is private and still has one owner. It is not a password. Leave it unset and the process throws before the first query; the error does not contain the database URL or token. A local SQLite file does not need the flag, including `next start` on your own machine.

Do not put this deployment on the public internet and rely on the flag. Anyone who can reach it shares the one record set.

### Inference

Any OpenAI-compatible endpoint works: llama.cpp `llama-server`, Ollama (`/v1`), vLLM, LM Studio, or a hosted open-weight provider. Keys are read only inside `lib/env.ts`, which is marked `server-only`.

Leave `AI_PROVIDER=mock` (the default) when no model is configured. Manual entry at `/products/new` does not call the model. If `AI_PROVIDER=openai-compatible` and the URL or model is missing, extraction returns "not configured" and does not fall back to the mock.

### Backup and restore

Stop the server before copying a live SQLite file.

Local:

```bash
# backup
cp data/returnrakshak.db data/returnrakshak.db.bak
# restore
cp data/returnrakshak.db.bak data/returnrakshak.db
```

`npm run db:reset` deletes the local file. It does not touch Turso.

Hosted, with the Turso CLI:

```bash
turso db dump returnrakshak > backup.sql
```

Restore by creating a new database and applying that dump, then pointing `TURSO_DATABASE_URL` at it. Run `npm run db:migrate` afterwards so the migration table matches.

### Checks before a deploy

```bash
npm run check
```

That is typecheck, lint, Vitest, and a production build. Playwright is separate, because it needs the Chromium binary:

```bash
npx playwright install chromium
npm run test:e2e
```

### Response headers

Every response sets `nosniff`, denies framing, sends `Referrer-Policy: no-referrer`, and a content-security policy limited to this origin. Details are in `docs/PRIVACY.md`.
