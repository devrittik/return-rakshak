import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/extract/route";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/constants";
import { listLeftoverWorkspaces } from "@/lib/temp/workspace";

const fixture = (name: string) => readFileSync(`fixtures/${name}`);

function uploadRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/extract", { method: "POST", body: form });
}

const pdfFile = () => new File([fixture("invoice-text.pdf")], "invoice.pdf", { type: "application/pdf" });

describe("POST /api/extract", () => {
  it("extracts text from a PDF and marks the response uncacheable", async () => {
    const response = await POST(uploadRequest(pdfFile()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = (await response.json()) as { ok: boolean; method: string; text: string; stats: { charCount: number } };
    expect(body.ok).toBe(true);
    expect(body.method).toBe("pdf_text");
    expect(body.text).toContain("Aurora ANC Headphones");
    expect(body.stats.charCount).toBeGreaterThan(50);
  });

  it("rejects a missing file", async () => {
    const form = new FormData();
    const response = await POST(new Request("http://localhost/api/extract", { method: "POST", body: form }));
    expect(response.status).toBe(400);
  });

  it("rejects an unsupported extension with 415", async () => {
    const response = await POST(
      uploadRequest(new File([fixture("invoice.txt")], "invoice.txt", { type: "text/plain" })),
    );
    expect(response.status).toBe(415);
    const body = (await response.json()) as { ok: boolean; code: string };
    expect(body).toMatchObject({ ok: false, code: "unsupported_extension" });
  });

  it("rejects a PNG renamed to .pdf with 415", async () => {
    const response = await POST(
      uploadRequest(new File([fixture("mislabelled.pdf")], "invoice.pdf", { type: "application/pdf" })),
    );
    expect(response.status).toBe(415);
    expect(((await response.json()) as { code: string }).code).toBe("content_mismatch");
  });

  it("rejects an oversized body from the header alone (413, before parsing)", async () => {
    const request = new Request("http://localhost/api/extract", {
      method: "POST",
      headers: { "content-length": String(MAX_UPLOAD_BYTES + 1024 * 1024) },
      body: "ignored",
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("rejects a malformed PDF with 422", async () => {
    const response = await POST(
      uploadRequest(new File([fixture("malformed.pdf")], "broken.pdf", { type: "application/pdf" })),
    );
    expect(response.status).toBe(422);
  });

  it("leaves no temporary files behind on success or failure", async () => {
    const before = (await listLeftoverWorkspaces()).length;
    await POST(uploadRequest(pdfFile()));
    await POST(uploadRequest(new File([fixture("mislabelled.pdf")], "x.pdf", { type: "application/pdf" })));
    await POST(uploadRequest(new File([fixture("malformed.pdf")], "y.pdf", { type: "application/pdf" })));
    expect((await listLeftoverWorkspaces()).length).toBe(before);
  });
});
