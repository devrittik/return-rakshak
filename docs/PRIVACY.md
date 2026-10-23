# Privacy & data retention

This document describes what the code actually does. Where a guarantee is weaker than it sounds, that is stated.

## 1. What is never stored

- The uploaded invoice in any form (PDF, JPEG, PNG bytes).
- Rendered page images or OCR output.
- Full extracted invoice text.
- Model prompts or raw model responses.

Enforcement points:

- `lib/logger.ts` redacts keys matching `invoice|ocr|raw|content|prompt|token|secret|key|password` and truncates strings, so an accidental `log.info({ text })` cannot dump a document.
- The schema (`lib/data/schema.ts`) has no column capable of holding invoice content; an integration test asserts this against `PRAGMA table_info(products)`.
- The upload path (Phase 2) writes to `os.tmpdir()` only, never to `public/`.

## 2. Temporary file lifecycle (Phases 2+)

1. `File` arrives at the route handler; size, MIME type, extension **and file signature** are validated.
2. Bytes are written to a uniquely named file under the OS temp directory.
3. PDF text extraction, or OCR fallback, runs against that file.
4. A `finally` block deletes the file **and any derived artifacts** — on success, on validation failure, and on timeout.
5. Tests cover cleanup after both success and failure.

### What "delete" means here

Deleting unlinks the path. On most filesystems the blocks are reclaimed lazily and are not overwritten. **This is not a cryptographic secure erase**, and the app never claims it is — including on the `/privacy` page, where the limitation is shown in a warning box.

## 3. What is stored

| Table | Fields | Why |
| --- | --- | --- |
| `users` | id, email, display name, timestamps | Ownership scoping until auth ships |
| `products` | name, seller, purchase date, price (minor units), currency, category, notes, source, timestamps | The record you asked to keep |
| `policies` | kind, duration, unit, start date, counting convention, inclusive flag, computed deadline, source, short evidence, verification status, timestamps | Needed to justify and recompute a deadline |
| `reminders` | kind, label, remind date, lead days, status, timestamps | Nudges you scheduled |

`evidence` is capped at ~400 characters and is intended to be a one-or-two-line quote the user confirmed — not a document. The UI asks for exactly that.

## 4. Logging

Structured JSON events only: `product.created`, `product.deleted`, `upload.rejected`… with identifiers, counts and durations. No free text from invoices, no prompts, no responses. In production, `debug` is suppressed entirely.

## 5. Third parties

- **AI provider:** optional. Default is a local mock with no network access. If an open-weight endpoint is configured, the extracted invoice *text* is sent to it for the duration of one request — that is the entire purpose of the feature and should be documented for end users. No invoice file is sent.
- **Hosted database:** Turso/libSQL stores the same structured fields described above. The AI provider never receives database credentials.

## 6. User controls

- Deleting a product cascades to its policies and reminders in one statement.
- Deleting `data/returnrakshak.db` removes everything in local mode — nothing is mirrored elsewhere.
- Manual entry works with no model, no network and no account.

## 7. Multi-user

Records are scoped by `user_id` today, with a single local owner. Real authentication and authorization are required before any hosted deployment serves more than one person — an unauthenticated shared database is explicitly out of scope. `lib/session.ts` is the only function that will change.
