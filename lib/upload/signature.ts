import type { UploadFormat } from "./constants";

/**
 * Sniffs the real file type from its leading bytes.
 *
 * The browser-supplied MIME type and the filename extension are both attacker
 * controlled, so neither is trusted on its own — `%PDF-` inside a `.png` is a
 * mismatch, not a PDF.
 */
export function sniffFormat(bytes: Uint8Array): UploadFormat | "unknown" {
  if (bytes.length >= 5) {
    const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (head === "%PDF") return "pdf";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return "unknown";
}

/** PDFs must declare an end-of-file marker; truncated uploads are rejected early. */
export function looksLikeCompletePdf(bytes: Uint8Array): boolean {
  const tailStart = Math.max(0, bytes.length - 2048);
  let tail = "";
  for (let i = tailStart; i < bytes.length; i += 1) tail += String.fromCharCode(bytes[i]!);
  return tail.includes("%%EOF");
}

export function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}
