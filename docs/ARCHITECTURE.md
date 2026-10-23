# Architecture

## Boundaries

```
app/(pages)                 server components — read via repository only
app/api/*/route.ts          thin handlers: validate → call service → revalidate
components/                 presentational; imports types, never the database
lib/data/                   drizzle schema · client (one driver, two modes) · repository
lib/policy/deadline.ts      deterministic date math, pure functions
lib/validation/             zod schemas shared by client forms and API handlers
lib/env.ts                  server-only env parsing (secrets never cross to the client)
lib/session.ts              the only "who is the user" decision point
lib/logger.ts               redacting structured logger
scripts/                    migrate · seed · reset
db/migrations/              generated SQL, applied by drizzle's libSQL migrator
```

The rule enforced throughout: **the LLM proposes, code decides.** Model output is validated by Zod, reviewed by the user, and then handed to the deadline engine as plain numbers — never as a date.

## Why one driver for both modes

`@libsql/client` speaks the SQLite file protocol locally and libSQL over the wire against Turso. Choosing `drizzle-orm/libsql` instead of `better-sqlite3` for the runtime means the same code path, the same migrations and the same repository run in both environments. (`better-sqlite3` is present only as a convenience for ad-hoc inspection.)

## Authorisation shape

Every repository function takes `userId` as its first data argument and filters on it. There is no query that can accidentally return another owner's rows:

```ts
getProduct(database, userId, productId)   // WHERE id = ? AND user_id = ?
deleteProduct(database, userId, productId)
```

Integration tests assert the negative cases: another user cannot read, delete, or dismiss anything owned by the first. When sessions land, `currentUserId()` starts returning the authenticated id and nothing else changes.

## Verification model

```
extraction (AI)  →  user review  →  confirmation
   unverified        editable        verified + verifiedAt
```

`policies.verificationStatus` is the single source of truth. Dashboard queries filter on `verified` by default; `includeUnverified` exists for the review screen and tests. `DeadlineLine` refuses to render a confirmed-looking date for an unverified policy.

## Date handling

Dates are `YYYY-MM-DD` strings, arithmetic is done in UTC. `purchase_date` is a fact; `start_date` is a policy input — they are separate columns because they are frequently different (delivery-based returns, extended warranties).

## Failure modes

| Failure | Behaviour |
| --- | --- |
| AI unavailable / timeout | Manual entry stays available; extraction returns a typed error, no partial writes |
| Malformed model JSON | Zod validation error surfaced to the user, nothing persisted |
| Invalid date | `computeDeadline` returns `{ ok: false, reason }`; the policy saves with a `NULL` deadline and `needs_review` |
| Temp cleanup failure | Logged by event name only; the request still fails closed |

## Explicit non-goals (MVP)

Microservices, queues, Redis, Docker, background workers, PDF retention, "secure erase" claims.
