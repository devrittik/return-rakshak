import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Real Tesseract run. Opt-in because it needs traineddata on disk (or network
 * on first run) — CI without that cache should not fail on infrastructure.
 * Verify locally with:  RUN_OCR=1 npx vitest run tests/integration/ocr-real.test.ts
 */
const enabled = process.env.RUN_OCR === "1";

describe.skipIf(!enabled)("real OCR through the pipeline", () => {
  it("reads a raster invoice with usable confidence", async () => {
    const { extractInvoiceText } = await import("@/lib/extraction/service");
    const bytes = new Uint8Array(readFileSync("fixtures/invoice-scan.png"));

    const result = await extractInvoiceText(
      { fileName: "invoice-scan.png", mimeType: "image/png", bytes },
      { maxPages: 1 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.method).toBe("ocr");
    expect(result.stats.ocrConfidence).toBeGreaterThan(60);
    expect(result.text.toLowerCase()).toContain("sonicwave");
    expect(result.text).toContain("2026-10-11");
  }, 60_000);
});
