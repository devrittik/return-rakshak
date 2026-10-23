/** Upload constraints. Single source of truth for the route, the UI and tests. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PDF_PAGES = 10; // bounded work: no 400-page PDFs
export const MAX_EXTRACTED_CHARS = 200_000; // bounded prompt size later
export const MAX_IMAGE_PIXELS = 40_000_000; // decoded-size guard

export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"] as const;
export const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

export type UploadKind = "pdf" | "image";
export type UploadFormat = "pdf" | "png" | "jpeg";
