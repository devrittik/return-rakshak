import { readFile } from "node:fs/promises";
import { log } from "@/lib/logger";
import { withTempWorkspace } from "@/lib/temp/workspace";
import { MAX_PDF_PAGES } from "@/lib/upload/constants";
import { validateUpload, type UploadErrorCode } from "@/lib/upload/validate";
import { createTesseractEngine, OcrUnavailableError, type OcrEngine } from "./ocr";
import { extractPdfText, isUsableText } from "./pdf-text";
import { renderPdfPages } from "./rasterize";

export type ExtractionMethod = "pdf_text" | "ocr";

export interface ExtractionSuccess {
  ok: true;
  method: ExtractionMethod;
  /** Extracted text — returned to the caller, never logged, never persisted. */
  text: string;
  stats: {
    pageCount: number;
    pagesRead: number;
    charCount: number;
    ocrConfidence: number | null;
    truncated: boolean;
    ocrFallbackReason: "no_usable_text" | null;
  };
}

export type ExtractionFailureCode = UploadErrorCode | "ocr_unavailable" | "no_text" | "pdf_unreadable" | "extraction_failed";

export interface ExtractionFailure {
  ok: false;
  code: ExtractionFailureCode;
  message: string;
  status: number;
}

export type ExtractionOutcome = ExtractionSuccess | ExtractionFailure;

const fail = (code: ExtractionFailureCode, message: string, status: number): ExtractionFailure => ({
  ok: false,
  code,
  message,
  status,
});

export interface ExtractOptions {
  /** Injected OCR engine (tests); defaults to Tesseract. */
  ocr?: OcrEngine | null;
  maxPages?: number;
}

/**
 * Invoice → plain text. Nothing here touches the database.
 *
 * Order of operations mirrors the privacy contract:
 *   validate → temp file → native text → (only if unusable) OCR
 *   → always clean up, success or failure.
 */
export async function extractInvoiceText(
  input: { fileName: string; mimeType: string; bytes: Uint8Array },
  options: ExtractOptions = {},
): Promise<ExtractionOutcome> {
  const startedAt = Date.now();

  const validation = validateUpload({
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
    bytes: input.bytes,
  });
  if (!validation.ok) {
    log.info("extract.rejected", { code: validation.code });
    return validation;
  }

  const maxPages = options.maxPages ?? MAX_PDF_PAGES;

  try {
    return await withTempWorkspace(async (workspace) => {
      // The upload exists on disk only inside this block.
      const storedPath = await workspace.write(input.fileName || `upload.${validation.format}`, input.bytes);
      const bytes = new Uint8Array(await readFile(storedPath));

      if (validation.kind === "pdf") {
        let native = "";
        let nativeFailed = false;
        try {
          const extracted = await extractPdfText(bytes);
          if (isUsableText(extracted.text)) {
            log.info("extract.completed", {
              method: "pdf_text",
              pages: extracted.pagesRead,
              chars: extracted.text.length,
              ms: Date.now() - startedAt,
            });
            return {
              ok: true as const,
              method: "pdf_text" as const,
              text: extracted.text,
              stats: {
                pageCount: extracted.pageCount,
                pagesRead: extracted.pagesRead,
                charCount: extracted.text.length,
                ocrConfidence: null,
                truncated: extracted.truncated,
                ocrFallbackReason: null,
              },
            };
          }
          native = extracted.text;
        } catch {
          // Unreadable PDF structure: no text layer is coming, so OCR (below) is
          // the only remaining honest option. If OCR also fails, the caller sees
          // `pdf_unreadable` rather than a misleading "empty invoice".
          log.warn("extract.pdf_native_failed", {});
          nativeFailed = true;
        }
        void native;

        // No usable text layer → rasterise capped pages and OCR them.
        let images: Uint8Array[] = [];
        try {
          images = await renderPdfPages(bytes, { maxPages });
        } catch {
          return fail("pdf_unreadable", "That PDF appears to be corrupted or password-protected.", 422);
        }
        if (images.length === 0) {
          return nativeFailed
            ? fail("pdf_unreadable", "That PDF appears to be corrupted or password-protected.", 422)
            : fail("no_text", "That PDF has no readable pages.", 422);
        }

        const ocr = await resolveEngine(options);
        if (!ocr.ok) return ocr.failure;
        try {
          return await ocrPages(images, ocr.engine, "no_usable_text", images.length, startedAt);
        } finally {
          await ocr.engine.dispose().catch(() => undefined);
        }
      }

      // Image upload: straight to OCR.
      const ocr = await resolveEngine(options);
      if (!ocr.ok) return ocr.failure;
      try {
        return await ocrPages([bytes], ocr.engine, null, 1, startedAt);
      } finally {
        await ocr.engine.dispose().catch(() => undefined);
      }
    }, "extract");
  } catch (error) {
    if (error instanceof OcrUnavailableError) {
      return fail(
        "ocr_unavailable",
        "The OCR engine isn't available, so this image can't be read. You can add the product manually.",
        503,
      );
    }
    log.error("extract.failed", { reason: error instanceof Error ? error.name : "unknown", ms: Date.now() - startedAt });
    return fail("extraction_failed", "That file couldn't be processed. You can add the product manually.", 422);
  }
}

async function resolveEngine(
  options: ExtractOptions,
): Promise<{ ok: true; engine: OcrEngine } | { ok: false; failure: ExtractionFailure }> {
  if (options.ocr === null) {
    return {
      ok: false,
      failure: fail("ocr_unavailable", "OCR is disabled in this configuration. Add the product manually instead.", 503),
    };
  }
  if (options.ocr) return { ok: true, engine: options.ocr };

  try {
    return { ok: true, engine: await createTesseractEngine() };
  } catch (error) {
    if (error instanceof OcrUnavailableError) {
      return {
        ok: false,
        failure: fail("ocr_unavailable", "The OCR engine isn't available. Add the product manually instead.", 503),
      };
    }
    throw error;
  }
}

async function ocrPages(
  images: Uint8Array[],
  engine: OcrEngine,
  fallbackReason: "no_usable_text" | null,
  pageCount: number,
  startedAt: number,
): Promise<ExtractionOutcome> {
  const texts: string[] = [];
  let confidenceTotal = 0;
  let confidenceCount = 0;

  for (const [index, image] of images.entries()) {
    const result = await engine.recognize(image);
    if (result.text.trim()) texts.push(result.text.trim());
    if (Number.isFinite(result.confidence) && result.confidence > 0) {
      confidenceTotal += result.confidence;
      confidenceCount += 1;
    }
    log.debug("extract.ocr_page", { page: index + 1, chars: result.text.length });
  }

  const text = texts.join("\n\n").trim();
  if (!isUsableText(text)) {
    return fail(
      "no_text",
      "We couldn't read enough text from that file. Try a clearer scan, or add the product manually.",
      422,
    );
  }

  const confidence = confidenceCount > 0 ? Math.round(confidenceTotal / confidenceCount) : null;
  log.info("extract.completed", {
    method: "ocr",
    pages: images.length,
    chars: text.length,
    confidence,
    ms: Date.now() - startedAt,
  });

  return {
    ok: true,
    method: "ocr",
    text,
    stats: {
      pageCount,
      pagesRead: images.length,
      charCount: text.length,
      ocrConfidence: confidence,
      truncated: pageCount > images.length,
      ocrFallbackReason: fallbackReason,
    },
  };
}
