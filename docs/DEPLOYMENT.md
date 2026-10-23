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

The hosted deployment is single-user until authentication ships. Records are already scoped by `user_id`, and `lib/session.ts` is the only place that resolves the current user, so the change is contained — but until that lands, deploying for real users risks exposing one shared record set. Keep the deployment private.

### Inference

Any OpenAI-compatible endpoint works: llama.cpp `llama-server`, Ollama (`/v1`), vLLM, LM Studio, or a hosted open-weight provider. Keys are read only inside `lib/env.ts`, which is marked `server-only`.
