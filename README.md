# ReturnRakshak

**Privacy-first return & warranty tracker.** Upload an invoice, review what was extracted, confirm the policy, and get a deadline you can actually rely on — without the invoice ever being stored.

> Status: **Phase 5 complete.** Upload → extract → review → confirm → deadline, including correcting a saved policy and downloading a verified deadline as a calendar file. Hardening and deployment notes land in Phase 6.

---

## Why this exists

Return windows and warranty periods expire silently. The usual fix — uploading invoices to some cloud service — trades one problem for a worse one. ReturnRakshak keeps the useful part (dates, product facts, evidence) and discards the sensitive part (the document).

## Privacy guarantees, stated precisely

| Never stored | Always |
| --- | --- |
| Invoice PDFs, JPEGs, PNGs | Validated before processing |
| OCR output, rendered page images | Held in an OS temp dir during the request |
| Full extracted invoice text | Deleted in a `finally` block, success or failure |
| Model prompts and raw responses | Only confirmed fields and a short evidence quote are persisted |

Deletion here means **unlinking a temp file**. It is not a cryptographic erase — we say so on `/privacy` and in `docs/PRIVACY.md` rather than implying otherwise.

## The rules the deadline engine follows

Deadlines are computed **in code**, never by the model:

- A return window does not necessarily start on the purchase date — the start date is explicit and editable.
- Counting convention is stored per policy: `calendar` or `business` days, end day `inclusive` or `exclusive`.
- Month arithmetic clamps to month end: `31 Jan + 1 month → 28/29 Feb`.
- Business-day counting skips weekends; **Indian public holidays are not modelled** and that gap is surfaced in the UI.
- A policy is `verified` only when the user explicitly confirms it. Anything else is `needs_review`, keeps its computed date, and is **excluded from the dashboards**.
- A model-proposed duration is a claim, not a fact. It can never mark itself verified.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind (single token file) · React Hook Form + Zod · Drizzle ORM · libSQL/SQLite local, Turso hosted · Vitest + Playwright.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run db:migrate      # applies db/migrations to data/returnrakshak.db
npm run db:seed         # optional: 3 synthetic demo products
npm run dev             # http://localhost:3000
```

No account, no API key, no model download. The app is fully usable with **manual entry** (`/products/new`).

### Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run db:migrate` | Apply migrations (local file or Turso) |
| `npm run db:seed` | Insert synthetic demo data (idempotent) |
| `npm run db:reset` | Delete the local database file |
| `npm run test` | Vitest: deadline engine + repository/authz |
| `npm run test:e2e` | Playwright against a production build |
| `npm run lint` · `npm run typecheck` | Static checks |
| `npm run check` | typecheck → lint → tests → build |

## Modes

**Local (default).** SQLite file at `data/returnrakshak.db` — outside `public/`, git-ignored. Temporary files live in the OS temp dir.

**Hosted.** Set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`; the same repository layer talks to libSQL over the wire. Never point `DATABASE_URL` at a local file on Vercel. `docs/DEPLOYMENT.md` walks through it.

> Hosted deployment is **blocked on authentication**. Records are already scoped by `user_id` and every query filters on it, so switching on real auth changes one function (`lib/session.ts`) — but until then, do not expose a shared database.

## Data model

`users → products → policies → reminders`, all foreign keys with `ON DELETE CASCADE`, all indexed on the queries actually used (`policies_user_deadline_idx`, `reminders_user_status_idx`, …). Prices are integer minor units; dates are `YYYY-MM-DD` calendar strings to avoid timezone drift; no column anywhere holds invoice content.

## AI extraction

The default provider is an **offline rule engine** (`MockAiProvider`) — no model, no key, no network. It finds
*labelled* values only (`Seller:`, `Purchase date:`, `Total:`, "…within 15 days of delivery") and returns
`missingFields` for everything else. The same input always gives the same output, which is what makes
"never invent a value" testable.

Every returned field carries `provenance` (`invoice` / `inferred` / `missing`) and `confidence`. The review screen
shows those as badges, so "Check this" and "Not on the invoice" are visible rather than buried.

## Enabling local open-weight inference

```bash
# llama.cpp
llama-server -m ./models/qwen2.5-7b-instruct-q4_k_m.gguf --port 8080 --ctx-size 8192

# or Ollama (its OpenAI route is http://127.0.0.1:11434/v1, model e.g. qwen2.5:7b)
ollama serve && ollama pull qwen2.5:7b
```

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://127.0.0.1:8080/v1
AI_MODEL=qwen2.5-7b-instruct
AI_TIMEOUT_MS=30000
```

`AI_BASE_URL` and `AI_MODEL` are both required in this mode. If either is missing, extraction returns "not configured" and manual entry stays available — the app does not silently fall back to the mock, because that would hide a broken setup. Leave `AI_PROVIDER=mock` when you want the offline extractor.

Keys stay server-side; nothing in the client bundle reads them. No model is downloaded automatically, and no paid API is required at any point. The adapter speaks `POST /v1/chat/completions` with JSON mode, a timeout, and a second attempt without `response_format` when a local server rejects that field.

## Layout

```
app/                 routes: dashboard, products, upload, reminders, privacy, api/
components/          ui primitives + app components (tokens only, no hardcoded colour)
lib/data/            drizzle schema, client, repository, demo data
lib/ai/              provider interface, offline mock, open-weight adapter, schema
lib/policy/          deterministic deadline engine
lib/validation/      zod schemas shared by forms and API
lib/session.ts       the single "who is the user" seam
lib/logger.ts        redacting logger (no payloads)
db/migrations/       generated SQL migrations
docs/                privacy, architecture, deployment, phase reports
tests/               unit · integration · e2e
```

## Documentation

- `docs/ARCHITECTURE.md` — boundaries and why they exist
- `docs/PRIVACY.md` — the retention policy in detail
- `docs/DEPLOYMENT.md` — local vs hosted, Turso setup, auth gate
- `docs/PHASE-1-REPORT.md` — what was built, verified, and what is still open
- `docs/PHASE-4-REPORT.md` — open-weight adapter, failure modes, and what is still open

## Roadmap

Phase 2 upload + PDF text + OCR + cleanup · Phase 3 mock AI + review screen · Phase 4 open-weight adapter · Phase 5 policy review, reminders, and `.ics` export · **next:** Phase 6 hardening · **then multi-user auth**.

License: MIT.
