# Phase 2 report — upload, temporary processing, PDF text, OCR fallback, cleanup

Date: 2026-10-23 · Status: **complete and verified** · App runnable

## 1. What was built

| Concern | File(s) |
| --- | --- |
| Upload rules (one source of truth) | `lib/upload/constants.ts` — 10 MB, 10 pages, allowed extensions/MIME |
| Content sniffing | `lib/upload/signature.ts` — magic bytes, `%%EOF` completeness, extension parsing |
| Validation | `lib/upload/validate.ts` — size → extension → MIME → **actual bytes**, independent checks |
| Temp workspace | `lib/temp/workspace.ts` — `mkdtemp` (0700), files 0600, `basename()` sanitisation, `withTempWorkspace` guarantees cleanup in `finally` |
| PDF text | `lib/extraction/pdf-text.ts` + `pdfjs.ts` — native text layer, page cap, char cap, `isUsableText` quality gate |
| Rasterisation | `lib/extraction/rasterize.ts` — pages → PNG for image-only PDFs |
| OCR | `lib/extraction/ocr.ts` — injectable `OcrEngine` interface + lazy Tesseract implementation |
| Pipeline | `lib/extraction/service.ts` — validate → temp → native text → OCR fallback → **always clean up** |
| API | `app/api/extract/route.ts` — `Cache-Control: no-store`, header size pre-check, no persistence |
| UI | `components/upload-invoice.tsx` + `app/upload/page.tsx` — drag & drop, progress, errors, result, "Show extracted text" |
| Fixtures | `scripts/generate-fixtures.ts` — synthetic invoices generated in-process (`npm run fixtures`) |

## 2. Verified

```
typecheck → clean      lint → clean
vitest    → 69 passed, 1 skipped (opt-in real OCR)
  npm run test:ocr → 1 passed (real Tesseract, 95% confidence, 1.2 s)
playwright → 6 passed (incl. real OCR fallback in the browser)
build      → clean (native packages kept external)
```

End-to-end through `POST /api/extract`, against real fixtures:

| Fixture | Result |
| --- | --- |
| `invoice-text.pdf` | `pdf_text`, 246 chars, OCR never invoked |
| `invoice-scan.pdf` (image-only) | `ocr`, fallback reason `no_usable_text` |
| `invoice-scan.png` | `ocr`, 95% confidence |
| `mislabelled.pdf` (PNG bytes, .pdf name) | `content_mismatch`, 415 — rejected before processing |
| `malformed.pdf` | `pdf_unreadable`, 422 |
| `invoice.txt` | `unsupported_extension`, 415 |
| oversized body | 413 from the `content-length` header, before parsing |

Cleanup verified at three levels: unit tests (`finally` on success **and** throw, derived artifacts, file modes), integration tests (temp dir empty after every path), and a privacy test asserting extracted text never appears in logs.

## 3. Two bugs found by testing (and fixed)

1. **pdfjs segfaulted** on image-only PDFs — `@napi-rs/canvas` objects were being passed where pdfjs expected a `CanvasFactory`-provided canvas. Fixed with an explicit `NodeCanvasFactory`, plus `Path2D`/`DOMMatrix`/`ImageData` installed on `globalThis` before pdfjs loads.
2. **Next tried to bundle `skia.linux-x64-gnu.node`** and the production build failed. Fixed by adding `@napi-rs/canvas` to `serverExternalPackages`.

Also corrected during the work: `malformed.pdf` originally surfaced as a generic failure; it now maps to `pdf_unreadable` so the UI can say "corrupted or password-protected" instead of "no text".

## 4. Privacy behaviour, concretely

- The file is written to a `mkdtemp` directory (0700) for the duration of one request, then removed in a `finally` — success, throw, or early return. Tests assert the system temp dir is left empty.
- Errors go through `log` with event names and codes only (`extract.rejected`, `extract.completed` with **counts**). A test asserts `Aurora`, `SonicWave` and `8499` never appear in captured log output.
- The API persists nothing: no product, no invoice, no extracted text. Extracted text is returned to the browser because Phase 3's review screen needs it, and the UI states plainly that it lives only in that tab.
- `verbosity: 0` on pdfjs prevents it printing document fragments to stderr during warnings.

## 5. Deliberate limitations

- **10 pages / 10 MB / 200k chars** caps, enforced server-side; a 400-page PDF is refused rather than allowed to exhaust memory.
- OCR language data is fetched by Tesseract on first run unless cached (`TESSERACT_CACHE_PATH`). The app itself never downloads model weights; `RUN_OCR` keeps that dependency out of default CI.
- OCR confidence is reported, not used to gate acceptance — a low-confidence read still reaches the user, who reviews it.
- No password-protected PDF support (reported as `pdf_unreadable`).
- Nothing is saved yet **by design**: the review screen and field extraction are Phase 3.

## 6. Next: Phase 3

`ExtractionSchema` (Zod, with `missingFields[]` and per-field confidence), `MockAiProvider` + provider interface, `POST /api/extract-fields` that takes text and returns validated fields without storing it, and the editable review screen that finally writes a product — only on explicit confirmation.
