# ReturnRakshak — Phase 0 Report

Date: 2026-10-23 · Status: **complete, awaiting go-ahead for Phase 1**

## 1. Repository inspection

The workspace at `/home/user` contains **no existing code** — only `uploads/ReturnRakshak.md`
(the brief). There is no `package.json`, lockfile, git repository, or installed dependency to
inspect, so this is a **greenfield build** rather than a modification of an existing project.

Implication: all stack versions are chosen by me, from scratch, with a lockfile committed so
builds are reproducible.

## 2. Environment & constraints found

| Item | Value | Consequence |
|---|---|---|
| Node.js | v20.20.2 | Next.js 15.x (App Router) is the safe LTS-compatible target; Next 16 is available but not required by the brief. |
| npm | 10.8.2 | registry reachable (`npm ping` 275 ms, `next@16.4.2` resolvable) — dependencies can be installed. |
| CPU / RAM | 2 vCPU / ~2 GB RAM | **No local LLM weights can be run here.** Confirms the brief's mock-mode-first design; llama.cpp/Ollama is documented as an optional, externally supplied local endpoint. |
| Disk | ~21 GB free | Fine for `node_modules` + SQLite. |
| Network | Outbound HTTPS works | npm install and (optionally) Tesseract.js language data download are possible. |
| Runtime | Linux sandbox, ephemeral-ish filesystem | SQLite lives outside `public/` as mandated; production persistence must go through Turso/libSQL adapter. |

Not available / not used: Docker, Redis, queues, microservices — all explicitly out of scope.

## 3. Stack decisions (to be locked in Phase 1)

- **App**: Next.js 15 App Router + TypeScript `strict`, Tailwind CSS 3.4, React 19.
- **Forms/validation**: React Hook Form + Zod (Zod schema shared by API and client).
- **DB**: Drizzle ORM; `better-sqlite3` driver locally (`./data/returnrakshak.db`, outside `public/`),
  `@libsql/client` (Turso) when `TURSO_DATABASE_URL` is set. One repository layer, two drivers.
- **Extraction**: `pdfjs-dist` (native PDF text), `tesseract.js` (OCR fallback for scanned PDFs,
  JPEG, PNG).
- **AI**: `AiProvider` interface → `MockAiProvider` (default, offline, deterministic) and
  `OpenAiCompatibleProvider` pointed at any open-weight endpoint (llama.cpp server / Ollama / hosted).
  Chosen via env; never any paid-API dependency.
- **Tests**: Vitest (+ Node environment) for units, Playwright for the critical end-to-end flow.

## 4. Privacy architecture (the "Rakshak" invariant)

Hard rules encoded in the design, not just the README:

1. Uploads are written to an OS temp dir (`os.tmpdir()`), never to `public/` or the repo.
2. No invoice bytes, OCR text, prompts, or raw model responses are ever written to the DB or logs.
3. Cleanup runs in a `finally` block (success *and* failure) and is covered by tests.
4. The DB stores only: product fields the user confirmed, policy records + evidence, reminders.
5. Logging goes through a redaction helper — no free-text payload logging.
6. Docs will state plainly that temp-directory deletion is *not* a cryptographic secure erase.

## 5. Deadline engine stance

Deterministic, LLM-free. Every stored policy carries `source`, `evidence`, `startDate`,
`countingConvention` (`calendar_days` | `business_days`, inclusive/exclusive), and
`verificationStatus` (`verified` | `needs_review`). Unverified → rendered as "Unverified —
needs review", never as a confirmed date. LLM-proposed warranty text is treated as a *claim*
requiring user confirmation.

## 6. Phase plan (unchanged from the brief, with checkpoints)

| Phase | Deliverable | Exit check |
|---|---|---|
| 1 | Skeleton, Tailwind UI shell, Drizzle schema + migrations, seed data | `npm run build` + dev server renders |
| 2 | Upload route, validation, PDF text extract, OCR fallback, temp cleanup | unit + integration tests green |
| 3 | Mock AI adapter, Zod extraction schema, review screen, save flow | e2e "upload → review → save" green |
| 4 | Configurable open-weight adapter (llama.cpp/Ollama/OpenAI-compatible), timeout + fallback | adapter tests with fake server |
| 5 | Policy engine, dashboards, reminders, `.ics` export, delete cascade | deadline edge-case test suite green |
| 6 | Tests, security hardening, privacy + deployment docs, README | lint + typecheck + test + build all clean |

Each phase ends with: files changed, commands run, results, and any unresolved issues.
The app stays runnable after every phase; nothing destructive happens without approval.

## 7. Open questions (blocking Phase 1)

1. Proceed to Phase 1 now, or review this plan first?
2. Auth: implement a minimal single-user local auth + hosted session guard, or ship local-mode
   unauthenticated and document auth as a gate before hosted use?
3. Default demo experience: seed synthetic invoices/products so the dashboards look alive on first
   run, or start from empty states only?
