# Phase 5 report — verified policies, reminders, calendar export

Date: 2026-10-24 · Status: **complete and verified** · App runnable on the mock provider

## 1. What was built

| Concern | File(s) |
| --- | --- |
| Reminder schedule | `lib/policy/reminders.ts` — 2 days before a return, 14 days before a warranty |
| Calendar file | `lib/calendar/ics.ts` — all-day `VALUE=DATE`, exclusive `DTEND`, unverified policies omitted |
| Persistence | `lib/data/repository.ts` — `insertPolicy` / `updatePolicy` sync the pending reminder |
| Demo data | `lib/data/demo.ts` — reminders come from confirmed policies, not hand-inserted rows |
| Edit a saved policy | `components/policy-editor.tsx`, `PATCH /api/products/[id]/policies/[policyId]` |
| Edit product facts | `components/product-facts-form.tsx`, `PATCH /api/products/[id]` |
| Download | `GET /api/products/[id]/calendar` |
| Product page | `app/products/[id]/page.tsx` — editor under each policy, calendar link only when a deadline is verified |
| Reminders page | `app/reminders/page.tsx` — calendar link on a policy reminder |

`computeDeadline` remains the only writer of a deadline. The confirmation checkbox is the only way a policy becomes `verified`.

## 2. Behaviour

- Saving a verified policy with a valid deadline deletes that policy's pending reminders and creates one. `needs_review` deletes the pending reminder and does not create another. A dismissed reminder is kept.
- The dashboard and the `.ics` file include verified deadlines only. An unverified date stays labelled unverified and is absent from both.
- The calendar event is all-day. `DTSTART` is the deadline. `DTEND` is the next day, because calendar end dates are exclusive. The description carries the duration, the counting rule, whether the last day counts, and the short evidence quote. It does not carry invoice text.
- Business-day counting still skips weekends only. Indian public holidays are not modelled, and the form says so.
- Editing the product name, seller, purchase date, or price does not recompute a policy. Policy dates change only when the policy itself is saved.

## 3. Bug fixed while verifying

The manual-entry "End day" select stores a boolean, but React Hook Form was handing the default `true` to `setValueAs: (v) => v === "true"`. That comparison is false for a boolean, so a window left on "Include the last day" was saved as exclusive. The converter now accepts both `true` and `"true"`.

The policy editor had the same mismatch on a `<select>` of the strings `"true"` / `"false"`. It is a checkbox, "Include the last day", bound to the boolean directly.

## 4. Verified

```
typecheck → clean
lint      → clean
vitest    → 134 passed, 1 skipped
```

In the browser, against `next dev` on `http://127.0.0.1:3000`:

- A 7-day return from 24 Oct 2026 saved without the confirmation box stayed **Unverified** with the date kept off the dashboard, and offered no calendar download.
- Ticking "Include the last day" and the confirmation box moved that policy to **Verified**, deadline **31 Oct 2026**, "end day included".
- `GET /api/products/{id}/calendar` returned `text/calendar` with `DTSTART;VALUE=DATE:20261031`, `DTEND;VALUE=DATE:20261101`, a folded evidence line, and `Content-Disposition: attachment`.
- The product appeared under upcoming returns. The reminder read "29 Oct 2026" (two days before the deadline) and linked to the same calendar.
- A second product created from the manual form with "Include the last day" left on the default stored **end day included**, deadline 31 Oct 2026.
- Changing the seller to "Corner Shop" and saving details updated the purchase block.
- Both test products were deleted afterwards. Their pages now 404.

Playwright still cannot launch here: Chromium is not installed (`npx playwright install` has not been run).

## 5. Deliberate limitations

- Holidays are not a calendar. A business-day window can land on a public holiday.
- Reminder lead times are fixed (2 and 14). There is no per-policy offset.
- An existing local database can still hold a reminder that an older demo load inserted by hand. New loads do not insert one for an unverified policy. Dismissed rows are not rewritten.

## 6. Next: Phase 6

Hardening and deployment notes: threat model already in `docs/PRIVACY.md`, backup and restore, and the checks that keep mock mode and manual entry working when no model is configured.
