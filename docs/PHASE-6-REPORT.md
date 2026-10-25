# Phase 6 report — security checks, docs, and the deploy gate

Date: 2026-10-25 · Status: **complete and verified** · App runnable on the mock provider with a local SQLite file

## 1. What was built

| Concern | File(s) |
| --- | --- |
| Response headers | `lib/security/headers.mjs`, wired from `next.config.mjs` |
| Hosted-database gate | `lib/security/deployment.ts`, called from `instrumentation.ts` and `db()` |
| Tests | `tests/unit/security.test.ts` — the gate, the headers, and a calendar filename that cannot inject a header |
| Docs | `docs/PRIVACY.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `README.md`, `.env.example` |
| Privacy page | `app/privacy/page.tsx` — states the gate and the response headers |

Migrations are unchanged and do not pass through the gate. Applying a schema is not the same as serving the database.

## 2. Behaviour

- Every response sends `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a locked-down permissions policy, and a content-security policy whose default is `'self'`. Inline scripts stay allowed because the theme snippet and Next's bootstrap are inline. Production does not allow `unsafe-eval`. The browser may only connect to this origin.
- Production with `TURSO_DATABASE_URL` set throws before the database is opened, unless `RR_ALLOW_UNAUTHENTICATED_HOST=1`. The error does not contain the URL or the token. Local SQLite does not need the flag. The flag is an acknowledgement that the host is private and still single-user. It is not a login.
- A product name with quotes or newlines cannot break `Content-Disposition`. The calendar filename is a slug.

## 3. Verified

```
typecheck → clean
lint      → clean
vitest    → 139 passed, 1 skipped
build     → clean
```

`next start` on `http://127.0.0.1:3100` returned those headers on `/privacy`, including `connect-src 'self'` and no `unsafe-eval`. The privacy page shows the gate and the header note. Opening the dashboard from that page produced no content-security-policy violation, and the dashboard rendered.

## 4. Deliberate limitations

- Multi-user authentication is not implemented. A public deploy is still the wrong configuration, even with the acknowledgement flag.
- The content-security policy allows inline scripts. Removing that would require nonces for the theme snippet and Next's bootstrap.
- Playwright was not re-run for this phase. The last full Chromium run, after the review-spec wording fix, was 8 passed.

## 5. Next

Authentication, so a hosted database can be reached by more than one person without sharing one record set.
