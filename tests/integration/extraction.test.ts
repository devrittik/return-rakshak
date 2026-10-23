import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { extractInvoiceText } from "@/lib/extraction/service";
import type { OcrEngine } from "@/lib/extraction/ocr";
import { listLeftoverWorkspaces } from "@/lib/temp/workspace";

const fixture = (name: string) => new Uint8Array(readFileSync(`fixtures/${name}`));

/** Fake engine: counts calls and returns scripted text. No model, no network. */
function fakeEngine(
  text = "Tax invoice from Fake Store. Product: Widget Deluxe. Purchase date: 2026-01-01. Total: INR 499.00. Return within 7 days of delivery.",
): OcrEngine & {
  calls: number;
  disposed: boolean;
} {
  const engine = {
    calls: 0,
    disposed: false,
    async recognize() {
      engine.calls += 1;
      return { text, confidence: 91 };
    },
    async dispose() {
      engine.disposed = true;
    },
  };
  return engine;
}

describe("text PDF", () => {
  it("uses the native text layer and never invokes OCR", async () => {
    const ocr = fakeEngine();
    const result = await extractInvoiceText(
      { fileName: "invoice-text.pdf", mimeType: "application/pdf", bytes: fixture("invoice-text.pdf") },
      { ocr },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("pdf_text");
    expect(result.text).toContain("Aurora ANC Headphones");
    expect(result.text).toContain("2026-10-11");
    expect(result.stats.ocrConfidence).toBeNull();
    expect(ocr.calls).toBe(0);
  });

  it("leaves no temp artifacts behind", async () => {
    const before = await listLeftoverWorkspaces();
    await extractInvoiceText({ fileName: "invoice-text.pdf", mimeType: "application/pdf", bytes: fixture("invoice-text.pdf") }, { ocr: fakeEngine() });
    expect((await listLeftoverWorkspaces()).length).toBe(before.length);
  });
});

describe("OCR fallback", () => {
  it("falls back to OCR for an image-only PDF and says why", async () => {
    const ocr = fakeEngine();
    const result = await extractInvoiceText(
      { fileName: "invoice-scan.pdf", mimeType: "application/pdf", bytes: fixture("invoice-scan.pdf") },
      { ocr },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("ocr");
    expect(result.stats.ocrFallbackReason).toBe("no_usable_text");
    expect(ocr.calls).toBe(1);
    expect(ocr.disposed).toBe(true);
  });

  it("OCRs an image upload directly", async () => {
    const ocr = fakeEngine("Tax invoice from Fake Store. Product: Widget Deluxe. Purchase date: 2026-01-01. Total: INR 499.00. Return within 7 days of delivery.");
    const result = await extractInvoiceText(
      { fileName: "invoice-scan.png", mimeType: "image/png", bytes: fixture("invoice-scan.png") },
      { ocr },
    );

    expect(result.ok && result.method).toBe("ocr");
    expect(result.ok && result.stats.ocrFallbackReason).toBeNull();
    expect(ocr.calls).toBe(1);
  });

  it("reports ocr_unavailable instead of pretending the file is empty", async () => {
    const result = await extractInvoiceText(
      { fileName: "invoice-scan.png", mimeType: "image/png", bytes: fixture("invoice-scan.png") },
      { ocr: null },
    );

    expect(result).toMatchObject({ ok: false, code: "ocr_unavailable", status: 503 });
  });

  it("rejects OCR output that is too thin to be an invoice", async () => {
    const result = await extractInvoiceText(
      { fileName: "invoice-scan.png", mimeType: "image/png", bytes: fixture("invoice-scan.png") },
      { ocr: fakeEngine("...") },
    );
    expect(result).toMatchObject({ ok: false, code: "no_text", status: 422 });
  });

  it("cleans up even when OCR throws", async () => {
    const before = await listLeftoverWorkspaces();
    const failing: OcrEngine = {
      async recognize() {
        throw new Error("engine crashed");
      },
      async dispose() {},
    };
    const result = await extractInvoiceText(
      { fileName: "invoice-scan.png", mimeType: "image/png", bytes: fixture("invoice-scan.png") },
      { ocr: failing },
    );
    expect(result).toMatchObject({ ok: false, code: "extraction_failed" });
    expect((await listLeftoverWorkspaces()).length).toBe(before.length);
  });
});

describe("rejections bubble up from the service", () => {
  it("rejects a mislabelled file before any processing", async () => {
    const ocr = fakeEngine();
    const result = await extractInvoiceText(
      { fileName: "mislabelled.pdf", mimeType: "application/pdf", bytes: fixture("mislabelled.pdf") },
      { ocr },
    );
    expect(result).toMatchObject({ ok: false, code: "content_mismatch", status: 415 });
    expect(ocr.calls).toBe(0);
  });

  it("maps an unreadable PDF to pdf_unreadable", async () => {
    const result = await extractInvoiceText(
      { fileName: "malformed.pdf", mimeType: "application/pdf", bytes: fixture("malformed.pdf") },
      { ocr: fakeEngine() },
    );
    expect(result).toMatchObject({ ok: false, status: 422 });
  });
});

describe("privacy of the pipeline", () => {
  it("never logs extracted text", async () => {
    const lines: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((arg) => String(arg)).join(" "));
      }),
    );
    try {
      await extractInvoiceText(
        { fileName: "invoice-text.pdf", mimeType: "application/pdf", bytes: fixture("invoice-text.pdf") },
        { ocr: fakeEngine() },
      );
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }

    const output = lines.join("\n");
    expect(output).toContain("extract.completed");
    expect(output).not.toContain("Aurora");
    expect(output).not.toContain("SonicWave");
    expect(output).not.toContain("8499");
  });
});
