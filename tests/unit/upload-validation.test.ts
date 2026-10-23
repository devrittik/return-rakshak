import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/constants";
import { sniffFormat } from "@/lib/upload/signature";
import { validateUpload } from "@/lib/upload/validate";

const fixture = (name: string) => new Uint8Array(readFileSync(`fixtures/${name}`));

const accept = (fileName: string, mimeType: string, bytes: Uint8Array) =>
  validateUpload({ fileName, mimeType, size: bytes.byteLength, bytes });

describe("signature sniffing", () => {
  it("detects real file types from bytes", () => {
    expect(sniffFormat(fixture("invoice-text.pdf"))).toBe("pdf");
    expect(sniffFormat(fixture("invoice-scan.png"))).toBe("png");
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("jpeg");
  });

  it("returns unknown for anything else", () => {
    expect(sniffFormat(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe("unknown");
    expect(sniffFormat(new Uint8Array([]))).toBe("unknown");
  });
});

describe("validateUpload — happy paths", () => {
  it("accepts a text PDF", () => {
    expect(accept("invoice.pdf", "application/pdf", fixture("invoice-text.pdf"))).toEqual({
      ok: true,
      kind: "pdf",
      format: "pdf",
    });
  });

  it("accepts PNG and JPEG/images", () => {
    expect(accept("scan.png", "image/png", fixture("invoice-scan.png")).ok).toBe(true);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(accept("scan.jpg", "image/jpeg", jpeg).ok).toBe(true);
    expect(accept("scan.jpeg", "image/jpeg", jpeg).ok).toBe(true);
  });

  it("tolerates an empty declared MIME type, because content decides", () => {
    expect(accept("invoice.pdf", "", fixture("invoice-text.pdf")).ok).toBe(true);
  });
});

describe("validateUpload — rejections", () => {
  it("rejects an empty file", () => {
    const result = accept("empty.pdf", "application/pdf", new Uint8Array([]));
    expect(result).toMatchObject({ ok: false, code: "empty_file", status: 400 });
  });

  it("rejects files over the size limit", () => {
    const result = validateUpload({
      fileName: "huge.pdf",
      mimeType: "application/pdf",
      size: MAX_UPLOAD_BYTES + 1,
      bytes: fixture("invoice-text.pdf"),
    });
    expect(result).toMatchObject({ ok: false, code: "too_large", status: 413 });
  });

  it("rejects unsupported extensions before touching content", () => {
    expect(accept("invoice.txt", "text/plain", fixture("invoice.txt"))).toMatchObject({
      ok: false,
      code: "unsupported_extension",
      status: 415,
    });
    expect(accept("invoice.exe", "application/octet-stream", fixture("invoice.txt")).ok).toBe(false);
  });

  it("rejects a PNG renamed to .pdf (content mismatch)", () => {
    expect(accept("mislabelled.pdf", "application/pdf", fixture("mislabelled.pdf"))).toMatchObject({
      ok: false,
      code: "content_mismatch",
      status: 415,
    });
  });

  it("rejects a declared MIME type that contradicts the bytes", () => {
    expect(accept("invoice.pdf", "image/png", fixture("invoice-text.pdf"))).toMatchObject({
      ok: false,
      code: "content_mismatch",
    });
  });

  it("rejects a PDF with no %%EOF marker as truncated", () => {
    const truncated = fixture("invoice-text.pdf").slice(0, 200);
    expect(accept("cut-off.pdf", "application/pdf", truncated)).toMatchObject({
      ok: false,
      code: "malformed_pdf",
      status: 422,
    });
  });

  it("rejects content with no recognisable signature", () => {
    expect(accept("invoice.pdf", "application/pdf", new TextEncoder().encode("just some words"))).toMatchObject({
      ok: false,
      code: "unsupported_type",
    });
  });

  it("rejects a nameless file", () => {
    expect(accept("", "application/pdf", fixture("invoice-text.pdf"))).toMatchObject({ ok: false, code: "empty_file" });
  });
});
