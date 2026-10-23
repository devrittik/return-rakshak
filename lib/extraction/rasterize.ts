import { MAX_PDF_PAGES } from "@/lib/upload/constants";
import { loadPdf } from "./pdfjs";

/**
 * Renders PDF pages to PNG so the OCR engine can read image-only documents.
 * Capped at MAX_PDF_PAGES and a modest scale: bounded time and memory.
 */
export async function renderPdfPages(
  bytes: Uint8Array,
  options: { maxPages?: number; scale?: number } = {},
): Promise<Uint8Array[]> {
  const maxPages = options.maxPages ?? MAX_PDF_PAGES;
  const scale = options.scale ?? 2;

  const doc = await loadPdf(bytes);
  try {
    const pages = Math.min(doc.numPages, maxPages);
    const images: Uint8Array[] = [];

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const { createCanvas } = await import("@napi-rs/canvas");
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");

      // White background: transparent PNGs OCR terribly.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      // `canvas` is required by pdfjs at runtime even though its types omit it.
      const renderParams = { canvasContext: context, viewport, canvas } as unknown as Parameters<typeof page.render>[0];
      await page.render(renderParams).promise;
      images.push(new Uint8Array(canvas.toBuffer("image/png")));
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

    return images;
  } finally {
    await doc.destroy();
  }
}
