import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type UploadFormat,
  type UploadKind,
} from "./constants";
import { extensionOf, looksLikeCompletePdf, sniffFormat } from "./signature";

export type UploadErrorCode =
  | "empty_file"
  | "too_large"
  | "unsupported_extension"
  | "unsupported_mime"
  | "content_mismatch"
  | "malformed_pdf"
  | "unsupported_type";

export interface UploadRejection {
  ok: false;
  code: UploadErrorCode;
  message: string;
  status: number;
}

export interface UploadAccepted {
  ok: true;
  kind: UploadKind;
  format: UploadFormat;
}

export type UploadValidation = UploadAccepted | UploadRejection;

const rejection = (code: UploadErrorCode, message: string, status: number): UploadRejection => ({
  ok: false,
  code,
  message,
  status,
});

const EXPECTED: Record<UploadFormat, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpeg: ["image/jpeg", "image/jpg"],
};

/**
 * Validates size, extension, declared MIME type and the actual bytes.
 * Every check is independent: passing one never excuses another.
 */
export function validateUpload(input: {
  fileName: string;
  mimeType: string;
  size: number;
  bytes?: Uint8Array;
}): UploadValidation {
  const fileName = input.fileName.trim();
  const mimeType = (input.mimeType || "").toLowerCase().split(";")[0]!.trim();
  const extension = extensionOf(fileName);

  if (!fileName) return rejection("empty_file", "The file has no name — pick the invoice again.", 400);
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return rejection("empty_file", "That file is empty.", 400);
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    return rejection("too_large", "That file is larger than 10 MB. Compress it or split the invoice.", 413);
  }
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return rejection("unsupported_extension", "Only PDF, PNG and JPEG invoices are supported.", 415);
  }
  if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return rejection("unsupported_mime", "That file type is not supported.", 415);
  }

  // Content is the only trustworthy source of truth.
  const sniffed = input.bytes ? sniffFormat(input.bytes) : "unknown";
  if (!input.bytes) {
    return rejection("unsupported_type", "The file could not be read.", 400);
  }
  if (sniffed === "unknown") {
    return rejection("unsupported_type", "That file is not a valid PDF, PNG or JPEG.", 415);
  }

  const extensionMatches = extension === `.${sniffed}` || (sniffed === "jpeg" && extension === ".jpg");
  if (!extensionMatches) {
    return rejection("content_mismatch", "The file contents don't match its extension.", 415);
  }
  if (mimeType && !EXPECTED[sniffed].includes(mimeType)) {
    return rejection("content_mismatch", "The file contents don't match the type it claims to be.", 415);
  }
  if (sniffed === "pdf" && !looksLikeCompletePdf(input.bytes)) {
    return rejection("malformed_pdf", "That PDF looks incomplete or corrupted.", 422);
  }

  return { ok: true, kind: sniffed === "pdf" ? "pdf" : "image", format: sniffed };
}
