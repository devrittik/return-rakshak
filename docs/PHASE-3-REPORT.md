# Phase 3 report — mock AI adapter, schema validation, review screen

Date: 2026-10-23 · Status: **complete and verified** · App runnable

## 1. What was built

| Concern | File(s) |
| --- | --- |
| Provider contract | `lib/ai/types.ts` — `AiProvider`, typed failure codes (`timeout`, `unavailable`, `invalid_output`, `malformed_json`, `not_configured`) |
| Extraction schema | `lib/ai/schema.ts` — every field carries `value`, `provenance`, `confidence`, `evidence`; policy claims carry `startBasis`; `missingFields[]`; `uncertaintyNotes[]` |
| Consistency rules | `checkConsistency()` and `requiredGaps()` in the same file |
| Offline provider | `lib/ai/mock.ts` — deterministic rule-based extractor (`MockAiProvider`) |
| Proposal → form mapping | `lib/ai/to-form.ts` — never fills a start date the invoice doesn't support |
| Provider selection | `lib/ai/index.ts` — one seam; mock today, open-weight adapter in Phase 4 |
| API | `app/api/extract-fields/route.ts` — text in, validated proposal out, nothing stored |
| Review UI | `components/review-extraction-form.tsx` + wiring in `components/upload-invoice.tsx` |
| Save provenance | `app/api/products/route.ts` now accepts a constrained `source` (`invoice_ai` / `manual_entry`) |

## 2. Verified

```
typecheck → clean      lint → clean      build → clean
vitest    → 104 passed, 1 skipped
playwright → 8 passed
```

The full journey is now tested in a browser: upload a synthetic PDF → extract text → extract fields → review →
fill the two dates the extractor deliberately refused to guess → confirm → save → **deadline 29 Oct 2026**
(2026-10-14 + 15 days, computed in code) → delete.

The negative path is tested too: saving the same extraction **without** ticking the confirmation boxes produces
`needs_review`, and that product is asserted to be **absent from both dashboard deadline lists** while still
appearing in the "needs review" section.

## 3. The rules this phase enforces

- **Missing stays missing.** `missingFields` is derived from the values, never hand-written, and
  `checkConsistency` rejects any response where the two disagree.
- **A duration is not a policy.** Extracted policies arrive `confirmed: false`; only the user's tick sets
  `verified`. A test asserts the model can never mark its own output verified.
- **Start dates are not guessed.** "Return accepted within 15 days of delivery" yields
  `startBasis: "delivery_date"` and an **empty** start-date field with an explanation. The app cannot know the
  delivery date, so it asks.
- **Ambiguity is surfaced, not resolved silently.** `03/04/2026` is read day-first (the Indian convention) but
  flagged `medium` confidence with a note telling the user to check it.
- **Impossible values are rejected.** `31/02/2026` produces `null`, not a coerced date.

## 4. Bugs found by testing (and fixed)

1. **Greedy label capture.** PDF text flattens to one line, so `Seller: X Buyer: Y Product: …` was captured as the
   seller's name. Fixed with a `FIELD_LABELS` boundary so extraction stops at the next label.
2. **False `delivery_date` basis for warranty.** The warranty inherited "delivery" from a neighbouring sentence.
   Fixed by scoping the basis decision to the claim's own sentence.
3. **Warranty start was silently dropped.** Submitting with an empty warranty start failed validation with no
   visible message — a genuine a11y/UX dead end. The form now explains the field and offers unticking Track.
4. **Self-contradicting copy.** The return card headed "Starts on the delivery date" while its empty field said
   "the invoice doesn't say where this starts". Now context-aware.

## 5. Deliberate limitations

- The mock extractor is a **rule engine, not a language model**. It handles labelled invoices well and will miss
  unusual layouts; that is the honest trade for a zero-dependency default. Free-text invoices are what Phase 4's
  open-weight adapter is for.
- No streaming: the review screen appears when the proposal is ready.
- The review screen cannot yet edit an *existing* saved product — that arrives with the policy review work in
  Phase 5.
- `malformed_json` is part of the provider contract but not reachable from the mock; it is exercised by the
  Phase 4 adapter tests.

## 6. Next: Phase 4

`OpenAiCompatibleProvider` (llama.cpp `llama-server`, Ollama, vLLM, LM Studio, hosted open-weight endpoints):
strict JSON-mode prompt, timeout via `AbortSignal`, malformed-JSON recovery, the same Zod validation on the way
out, and a clean fallback to manual entry when the endpoint is down. Tests run against a local fake HTTP server —
no model download, no paid API.
