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

## AI boundary

```
text ──► AiProvider.extractFields ──► Zod (extractionSchema) ──► checkConsistency ──► review screen
           │                              │                        │
        mock | openai-compatible      rejects bad shapes     rejects self-contradiction
```

- One interface (`lib/ai/types.ts`): the mock and `OpenAiCompatibleProvider` (`lib/ai/openai-compatible.ts`) are
  interchangeable. Business logic imports the interface, never an SDK. The adapter posts to
  `{AI_BASE_URL}/chat/completions` (llama.cpp, Ollama, vLLM, LM Studio, or any other open-weight server).
- Selection is `getAiProvider()`. `AI_PROVIDER=openai-compatible` without `AI_BASE_URL` and `AI_MODEL` returns
  `not_configured`. It does not quietly switch back to the mock.
- `POST /api/extract-fields` re-validates whatever the provider returned. A provider is not trusted just because
  it is ours. User-facing errors are static strings, so a model reply cannot be echoed back.
- `checkConsistency` rejects a response where a field has a value *and* is listed in `missingFields` — that kind
  of self-contradiction means the rest of the answer is unreliable too.
- Raw prompts and raw responses are never logged; only counts, provider name, failure code and duration.
  Redirects are refused, so the invoice text cannot be forwarded to a second host.

## Verification model

```
extraction (AI)  →  user review  →  confirmation
   unverified        editable        verified + verifiedAt
```

`policies.verificationStatus` is the single source of truth. Dashboard queries filter on `verified` by default; `includeUnverified` exists for the review screen and tests. `DeadlineLine` refuses to render a confirmed-looking date for an unverified policy.

A saved policy is edited on the product page. The confirmation checkbox is the only way to set `verified`. `computeDeadline` is the only writer of `deadlineDate`. Saving a verified policy deletes that policy's pending reminders and creates one: 2 days before a return deadline, 14 days before a warranty deadline. Moving the policy back to `needs_review` deletes the pending reminder. A dismissed reminder is left in place.

`GET /api/products/[id]/calendar` builds an all-day `.ics` (`VALUE=DATE`, exclusive `DTEND`) from verified policies only. Unverified policies are omitted, and the route answers 404 when nothing verified remains.

## Date handling

Dates are `YYYY-MM-DD` strings, arithmetic is done in UTC. `purchase_date` is a fact; `start_date` is a policy input — they are separate columns because they are frequently different (delivery-based returns, extended warranties). Business-day counting skips weekends only. Indian public holidays are not modelled, and the form says so.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| AI unavailable / timeout / not configured | Manual entry stays available; extraction returns a typed error, no partial writes |
| Malformed model JSON | Fences, a short preamble, and a double-encoded string are recovered. Anything still unreadable is a typed error, nothing persisted |
| Invalid date | `computeDeadline` returns `{ ok: false, reason }`; the policy saves with a `NULL` deadline and `needs_review` |
| Temp cleanup failure | Logged by event name only; the request still fails closed |
| Production + hosted database, no acknowledgement | `assertSafeDeployment` throws before the connection is used. Local SQLite is unaffected. `RR_ALLOW_UNAUTHENTICATED_HOST=1` is an explicit private-host exception, not a login |

## Response headers

Every response sets `nosniff`, `DENY` framing, `no-referrer`, and a content-security policy whose default is `'self'`. Inline scripts stay allowed because the theme snippet and Next's bootstrap are inline. `unsafe-eval` is added only when `NODE_ENV` is not production. The browser's `connect-src` is this origin, so a configured model endpoint is reached by the server, not by the page.

## Explicit non-goals (MVP)

Microservices, queues, Redis, Docker, background workers, PDF retention, "secure erase" claims.
