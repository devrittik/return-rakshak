import { MAX_EXTRACTED_CHARS, MAX_PDF_PAGES } from "@/lib/upload/constants";
import { loadPdf } from "./pdfjs";

export interface PdfTextResult {
  text: string;
  pageCount: number;
  pagesRead: number;
  truncated: boolean;
}

/**
 * Native text extraction. No OCR, no AI, no persistence — the text lives in
 * memory for the length of one request.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  const doc = await loadPdf(bytes);
  try {
    const pagesRead = Math.min(doc.numPages, MAX_PDF_PAGES);
    const parts: string[] = [];
    let truncated = false;

    for (let pageNumber = 1; pageNumber <= pagesRead; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim();
      parts.push(pageText);
      page.cleanup();

      if (parts.join("\n").length > MAX_EXTRACTED_CHARS) {
        truncated = true;
        break;
      }
    }

    let text = parts.join("\n\n").trim();
    if (text.length > MAX_EXTRACTED_CHARS) {
      text = text.slice(0, MAX_EXTRACTED_CHARS);
      truncated = true;
    }

    return { text, pageCount: doc.numPages, pagesRead, truncated };
  } finally {
    await doc.destroy();
  }
}

/**
 * "Usable" means there is enough real language to matter. A scanned PDF often
 * yields a handful of stray characters (page numbers, a watermark) — that is
 * not text, it is noise, and OCR must take over.
 */
export function isUsableText(text: string): boolean {
  const letters = text.replace(/[^A-Za-z\u00C0-\u024F]/g, "").length;
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]{3,}/.test(word)).length;
  return letters >= 40 && words >= 8;
}
