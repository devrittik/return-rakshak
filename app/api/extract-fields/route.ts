import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { checkConsistency, extractionSchema } from "@/lib/ai/schema";
import type { AiFailureCode } from "@/lib/ai/types";
import { log } from "@/lib/logger";
import { MAX_EXTRACTED_CHARS } from "@/lib/upload/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const STATUS: Record<AiFailureCode, number> = {
  timeout: 504,
  unavailable: 503,
  not_configured: 503,
  malformed_json: 422,
  invalid_output: 422,
};

/** Static copy. The provider's own message is never forwarded — it might quote the invoice. */
const ERROR_TEXT: Record<AiFailureCode, string> = {
  timeout: "The extractor took too long. Try again, or enter the details manually.",
  unavailable: "The model endpoint is unavailable. Enter the details manually.",
  not_configured: "No model endpoint is configured. Enter the details manually.",
  malformed_json: "The model didn't return valid JSON. Enter the details manually.",
  invalid_output: "The extractor returned data we couldn't trust. Enter the details manually.",
};

/**
 * POST /api/extract-fields — extracted text → structured candidate fields.
 *
 * The request body carries text, never a file. Nothing is persisted: the
 * response is a *proposal* for the review screen, and the user decides what
 * survives. Raw model output is never logged.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request", error: "Invalid JSON body." }, { status: 400 });
  }

  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : "";
  if (text.trim().length < 20) {
    return NextResponse.json(
      { ok: false, code: "no_text", error: "There isn't enough text to read fields from." },
      { status: 400 },
    );
  }
  if (text.length > MAX_EXTRACTED_CHARS) {
    return NextResponse.json(
      { ok: false, code: "too_long", error: "That document is too long to process." },
      { status: 413 },
    );
  }

  const provider = getAiProvider();
  const startedAt = Date.now();

  let result;
  try {
    result = await provider.extractFields({ text });
  } catch {
    log.error("ai.failed", { provider: provider.name, ms: Date.now() - startedAt });
    return NextResponse.json(
      {
        ok: false,
        code: "unavailable",
        error: "Field extraction is unavailable right now. You can enter the details manually.",
      },
      { status: 503 },
    );
  }

  if (!result.ok) {
    log.info("ai.rejected", { provider: provider.name, code: result.code, ms: Date.now() - startedAt });
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        error: ERROR_TEXT[result.code] ?? ERROR_TEXT.invalid_output,
        issues: safeIssues(result.issues, text),
      },
      { status: STATUS[result.code] ?? 422 },
    );
  }

  // Re-validate whatever came back, whoever produced it.
  const parsed = extractionSchema.safeParse(result.data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
    log.info("ai.invalid_output", { provider: provider.name, issueCount: issues.length });
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_output",
        error: ERROR_TEXT.invalid_output,
        issues: safeIssues(issues, text),
      },
      { status: 422 },
    );
  }

  const inconsistencies = checkConsistency(parsed.data);
  if (inconsistencies.length > 0) {
    log.info("ai.inconsistent_output", { provider: provider.name, count: inconsistencies.length });
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_output",
        error: "The extractor's answer contradicted itself, so it was discarded. Enter the details manually.",
        issues: safeIssues(inconsistencies, text),
      },
      { status: 422 },
    );
  }

  log.info("ai.extracted", {
    provider: result.meta.provider,
    model: result.meta.model,
    missing: parsed.data.missingFields.length,
    ms: Date.now() - startedAt,
  });

  return NextResponse.json(
    {
      ok: true,
      provider: result.meta.provider,
      model: result.meta.model,
      durationMs: result.meta.durationMs,
      data: parsed.data,
      notice:
        "These fields are a proposal read from your invoice. Nothing is saved until you review and confirm them.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Drops issues that quote the invoice or are too long to be a field-level message. */
function safeIssues(issues: string[] | undefined, text: string): string[] | undefined {
  if (!issues || issues.length === 0) return undefined;
  const probe = text.slice(0, 48);
  const kept = issues.filter((issue) => issue.length > 0 && issue.length <= 200 && !issue.includes(probe)).slice(0, 8);
  return kept.length > 0 ? kept : undefined;
}
