import { NextResponse } from "next/server";
import { extractInvoiceText } from "@/lib/extraction/service";
import { log } from "@/lib/logger";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reject oversized bodies before parsing them into memory. */
function declaredLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (!header) return null;
  const length = Number(header);
  return Number.isFinite(length) ? length : null;
}

/**
 * POST /api/extract — invoice upload → text.
 *
 * Deliberately does not persist anything: no product, no invoice, no extracted
 * text. The text is returned to the browser because the review screen needs it;
 * the caller drops it when the tab closes. Field extraction (Phase 3) consumes
 * this text without storing it either.
 */
export async function POST(request: Request) {
  const length = declaredLength(request);
  // Multipart overhead is a few hundred bytes; allow a small margin.
  if (length !== null && length > MAX_UPLOAD_BYTES + 64 * 1024) {
    log.info("extract.rejected", { code: "too_large_by_header" });
    return NextResponse.json({ ok: false, code: "too_large", error: "That file is larger than 10 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request", error: "The upload could not be read." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, code: "no_file", error: "No file was attached." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const outcome = await extractInvoiceText({
    fileName: file.name,
    mimeType: file.type,
    bytes,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, code: outcome.code, error: outcome.message },
      { status: outcome.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      method: outcome.method,
      text: outcome.text,
      stats: outcome.stats,
      notice:
        "This text was extracted in memory. It is not saved anywhere and disappears when you leave this page.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
