# Phase 4 report — open-weight adapter

Date: 2026-10-24 · Status: **complete and verified** · App runnable on the mock provider

## 1. What was built

| Concern | File(s) |
| --- | --- |
| Adapter | `lib/ai/openai-compatible.ts` — `OpenAiCompatibleProvider` posts to `{AI_BASE_URL}/chat/completions` |
| Selection | `lib/ai/index.ts` — `AI_PROVIDER=openai-compatible` no longer falls through to the mock |
| Route copy | `app/api/extract-fields/route.ts` — one static message per failure code, issues that quote the invoice are dropped |
| Tests | `tests/integration/openai-compatible-provider.test.ts`, `tests/integration/extract-fields-errors.test.ts` |

The adapter speaks the same `AiProvider` contract as the mock. llama.cpp `llama-server`, Ollama, vLLM, LM Studio, and a hosted open-weight endpoint are the same code path: set `AI_BASE_URL` and `AI_MODEL`. No model is downloaded. No paid SDK was added.

## 2. Behaviour

- JSON mode (`response_format: json_object`) on the first attempt. If the server answers 400/422 and names `response_format`, one retry goes out without that field. Anything else is not retried.
- Timeout is `AbortSignal.timeout(AI_TIMEOUT_MS)` (default 30s) and covers both attempts.
- Replies are recovered when they are fenced, preceded by a short preamble, double-encoded, nested under `data` / `extraction` / `result` / `fields`, or sent as an array of text parts. What remains is validated with `extractionSchema` and `checkConsistency`.
- A missing URL, a missing model, a non-http(s) URL, or a URL with embedded credentials returns `not_configured` and does not open a connection. Manual entry stays available.
- Redirects use `redirect: "error"`, so the invoice text is not forwarded to a second host.
- Logs record provider, model, failure code, and duration. Prompts, replies, and invoice text are not logged. The route never forwards the provider's own message, which might quote the document.

## 3. Assumption

Price stays an integer in minor units, as the schema already required. The prompt says so. A model that returns `84.50` is rejected and the user types the amount. The adapter does not multiply by 100, because it cannot tell a major-unit decimal from a value that was already in paise.

## 4. Verified

```
typecheck → clean
lint      → clean
build     → clean
vitest    → 129 passed, 1 skipped
```

The adapter tests run against a local fake HTTP server. Nothing is downloaded and no external endpoint is called.

The production server on port 3100, with `AI_PROVIDER=mock`, still answers `POST /api/extract-fields` for a synthetic invoice (`provider: mock`, product "Aurora ANC Headphones", `Cache-Control: no-store`). `/privacy` shows that a configured endpoint receives the extracted text of that one request and does not store it. `/upload` still renders the intake form.

Two temp-workspace assertions were failing on Windows only: `os.tmpdir()` is `...\Temp` (the check looked for lowercase `tmp`), and `stat` does not report Unix mode bits. The tests now skip the mode check on Windows. The code still calls `chmod(0o700)` and writes files with mode `0o600`. Vitest runs files one at a time (`fileParallelism: false`) because the leftover-directory checks share the OS temp dir and were flaking under parallel files.

Playwright could not launch here: the Chromium binary is not installed in this environment (`npx playwright install` has not been run). The review-spec file was not executed.

## 5. Deliberate limitations

- No live model was started. That is the point of the fake server.
- A saved product still cannot be edited. That remains Phase 5, with reminders and `.ics` export.
- `malformed_json` is now reachable; the mock still cannot produce it.

## 6. Next: Phase 5

Verified policy handling on an existing product, deterministic deadlines already in `lib/policy`, dashboards, reminders, and `.ics` export. The review screen for a saved `needs_review` record is part of that phase.
