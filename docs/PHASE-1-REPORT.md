# Phase 1 report — skeleton, UI, schema, migrations, sample data

Date: 2026-10-23 · Status: **complete and verified** · App runnable

## 1. What was built

| Area | Files |
| --- | --- |
| App skeleton | `app/layout.tsx`, `app/globals.css`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` |
| Centralised theme | all tokens as CSS variables in `app/globals.css`; Tailwind maps semantic names only (`bg-primary`, `text-warning`, `shadow-card`). Light + dark + `prefers-reduced-motion`, one focus treatment |
| UI primitives (free, no licence) | `components/ui/{button,card,badge,field,empty-state}.tsx` + `lucide-react` icons |
| Shell & nav | `components/layout/{app-shell,nav}.tsx`, `components/theme-toggle.tsx` (light/dark/system, pre-paint script, no flash) |
| Schema | `lib/data/schema.ts` — `users → products → policies → reminders`, FKs with cascade, 9 indexes, integer-minor-unit prices, `YYYY-MM-DD` dates |
| Migration | `db/migrations/0000_slippery_warlock.sql` via drizzle-kit; applied by `scripts/migrate.ts` (works on file **and** Turso) |
| Repository | `lib/data/repository.ts` — every function takes `userId`; CRUD, dashboard queries, reminders |
| Single-user seam | `lib/session.ts` + `getLocalOwner()` — the only place "who is the user" is decided |
| Deadline engine (foundation) | `lib/policy/deadline.ts` — UTC calendar math, month clamping, business days, inclusive/exclusive end |
| Pages | `/` dashboard, `/products`, `/products/[id]`, `/products/new`, `/reminders`, `/upload` (honest "Phase 2" state), `/privacy` |
| API | `POST /api/products`, `GET|DELETE /api/products/[id]`, `POST /api/reminders/[id]/dismiss`, `POST /api/demo/{load,clear}` |
| Demo data | `lib/data/demo.ts` — 3 synthetic products, idempotent, one-click load/clear, tagged `demo` |
| Validation | `lib/validation/product.ts` — Zod schema shared by the form and the API |
| Privacy plumbing | `lib/logger.ts` (redacting), `lib/env.ts` (server-only), `.env.example` |
| Tests | `tests/unit/deadline.test.ts` (19), `tests/integration/repository.test.ts` (14), `tests/e2e/smoke.spec.ts` (3) |
| Docs | `README.md`, `docs/{ARCHITECTURE,PRIVACY,DEPLOYMENT}.md`, this report, `docs/PHASE-0-REPORT.md` |

## 2. Verified, not assumed

```
npm run typecheck   → clean
npm run lint        → clean (no warnings)
npm run test        → 33 passed (2 files)
npm run build       → compiled successfully, 12 routes
npm run test:e2e    → 3 passed (Chromium, against a production build)
```

Runtime checks against the dev server:

- All six pages return **200**; every nav link resolves.
- `POST /api/products` → 201 + product id; detail page renders; `DELETE` → 200; repeat `DELETE` → **404** (authorisation + idempotency).
- Invalid payload → **422** with field errors (`name`, `price`).
- Demo clear → dashboard falls back to the real empty state; demo load → populated dashboards.
- Reminder dismiss → 200, reminder leaves "pending".
- Screenshots (light, dark, mobile 390px, product detail) inspected in `docs/*.png`.

### Bug found and fixed during verification

`upcomingDeadlines` originally built `date('${today}')`, which drizzle binds as a **parameter inside the quotes** → SQLite evaluates `date('?')` → `NULL` → empty dashboards. Caught by the "unverified policies stay out of dashboards" integration test. Fixed by binding properly: `date(${today})` / `date(${today}, ${offset})`. This is exactly the class of silent empty-state bug that would have shipped unnoticed.

## 3. Decisions taken (per the brief's "simplest safe option")

1. **`@libsql/client` for both modes** instead of `better-sqlite3` at runtime — one driver, one code path, one migration set, works locally and on Turso unchanged.
2. **Generated columns split**: `purchase_date` (a fact) and `policies.start_date` (a policy input) are separate, because delivery-based return windows are the norm.
3. **`user_id` on every table from day one**, with a single local owner. Multi-user auth later changes `lib/session.ts` only — no data migration.
4. **Verification gate is strict**: a manual duration is `needs_review` unless the user ticks the explicit confirmation box. Unticked policies compute a date but are excluded from dashboards and reminders.
5. **Upload page states plainly that extraction isn't wired yet** — no fake uploader, no decorative buttons.
6. **E2E runs against `next start` on port 3100**, not the dev server, so hydration timing matches production and tests don't flake.

## 4. Known limitations (deliberate, documented in-app)

- **No authentication yet** — single local owner. Hosted deployment is documented as blocked on auth (`docs/DEPLOYMENT.md`).
- Upload, PDF text extraction, OCR and the AI adapters are **not implemented**; the `/upload` page says so and points to manual entry.
- Business-day counting **ignores Indian public holidays**; the UI states this next to the control.
- `computeDeadline` returns `unsupported_convention` for business-day *month* arithmetic rather than approximating.
- `.ics` export and the policy review/edit screen belong to Phase 5.
- Temp-file cleanup cannot be tested until Phase 2 introduces temp files (its test is scheduled there with the implementation, not faked now).

## 5. Not done on purpose

- No `.ics`, no extraction, no OCR — building them without the processing pipeline would mean writing dead code.
- No destructive operations: no existing files were deleted, no schema dropped; `db:reset` only touches the git-ignored local database.

## 6. Next: Phase 2

Upload route (size/MIME/extension/signature validation) → temp file → native PDF text via `pdfjs-dist` → OCR fallback via `tesseract.js` → `finally` cleanup → cleanup tests for both success and failure paths. Say the word and I'll proceed, or review the running app first (`npm run dev`, demo data is already loaded).
