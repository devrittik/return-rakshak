"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  ScanText,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { ReviewExtractionForm } from "@/components/review-extraction-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExtractionModel } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

type Extraction = {
  ok: true;
  method: "pdf_text" | "ocr";
  text: string;
  stats: {
    pageCount: number;
    pagesRead: number;
    charCount: number;
    ocrConfidence: number | null;
    truncated: boolean;
    ocrFallbackReason: "no_usable_text" | null;
  };
  notice: string;
};

type Failure = { ok: false; code: string; error: string };

type FieldExtraction = {
  ok: true;
  provider: string;
  model: string;
  durationMs: number;
  data: ExtractionModel;
  notice: string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadInvoice() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extraction | null>(null);
  const [showText, setShowText] = useState(false);
  const [fields, setFields] = useState<FieldExtraction | null>(null);
  const [fieldBusy, setFieldBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setFileLabel(null);
    setShowText(false);
    setFields(null);
    setFieldError(null);
    setFieldBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setShowText(false);
      setFields(null);
      setFieldError(null);
      setFileLabel(`${file.name} · ${humanSize(file.size)}`);

      // Fast client-side checks. The server re-validates everything.
      if (file.size > MAX_BYTES) {
        setError("That file is larger than 10 MB. Compress it or split the invoice.");
        return;
      }
      if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
        setError("Only PDF, PNG and JPEG invoices are supported.");
        return;
      }

      setBusy(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/extract", { method: "POST", body });
        const payload = (await response.json()) as Extraction | Failure;
        if (!response.ok || !payload.ok) {
          setError("error" in payload && payload.error ? payload.error : "That file could not be processed.");
          return;
        }
        setResult(payload);
      } catch {
        setError("The upload didn't reach the server. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const extractFields = useCallback(async () => {
    if (!result) return;
    setFieldBusy(true);
    setFieldError(null);
    try {
      const response = await fetch("/api/extract-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.text }),
      });
      const payload = (await response.json()) as FieldExtraction | Failure;
      if (!response.ok || !payload.ok) {
        setFieldError("error" in payload && payload.error ? payload.error : "Field extraction failed.");
        return;
      }
      setFields(payload);
    } catch {
      setFieldError("Couldn't reach the extractor. You can still add this product manually.");
    } finally {
      setFieldBusy(false);
    }
  }, [result]);

  if (fields) {
    return (
      <ReviewExtractionForm
        extraction={fields.data}
        provider={fields.provider}
        model={fields.model}
        onBack={() => setFields(null)}
      />
    );
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="space-y-5">
      <Card className={cn("border-dashed transition-colors", dragging && "border-primary bg-primary-muted/40")}>
        <CardContent
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="flex flex-col items-center gap-3 px-6 py-10 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-muted text-primary">
            {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Upload aria-hidden className="size-5" />}
          </span>

          <div className="space-y-1">
            <h2 className="text-sm font-semibold">
              {busy ? "Reading your invoice…" : "Drop an invoice here, or choose a file"}
            </h2>
            <p className="mx-auto max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              PDF, JPEG or PNG · up to 10 MB. Scanned invoices are read with OCR; text PDFs are read directly.
            </p>
          </div>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button type="button" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden />
              {busy ? "Processing" : "Choose file"}
            </Button>
            {fileLabel || result ? (
              <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
                <Trash2 aria-hidden />
                Clear
              </Button>
            ) : null}
          </div>

          {fileLabel ? <p className="text-[11.5px] text-muted-foreground">{fileLabel}</p> : null}

          <p className="flex items-center gap-1.5 pt-1 text-[11.5px] text-muted-foreground">
            <Lock aria-hidden className="size-3" />
            Processed in a temporary directory and deleted immediately — success or failure.
          </p>
        </CardContent>
      </Card>

      {/* Live region: errors and results are announced, not just shown. */}
      <div aria-live="polite" aria-atomic="true" className="space-y-3">
        {error ? (
          <Card className="border-danger/30 bg-danger-muted">
            <CardContent className="flex items-start gap-2.5 py-4">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-danger">{error}</p>
                <p className="text-[12.5px] leading-relaxed text-danger/90">
                  Nothing was saved. You can{" "}
                  <Link href="/products/new" className="font-medium underline underline-offset-2">
                    add the product manually
                  </Link>{" "}
                  instead.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {result ? (
          <Card className="border-success/30">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden className="size-4 text-success" />
                  Text extracted
                </CardTitle>
                <CardDescription>{result.notice}</CardDescription>
              </div>
              <Badge tone={result.method === "ocr" ? "info" : "success"}>
                {result.method === "ocr" ? (
                  <>
                    <ScanText aria-hidden className="size-3" />
                    {result.stats.ocrConfidence !== null ? `OCR · ${result.stats.ocrConfidence}% confidence` : "OCR"}
                  </>
                ) : (
                  <>
                    <FileText aria-hidden className="size-3" />
                    Native text layer
                  </>
                )}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Pages</dt>
                  <dd className="font-medium tabular-nums">
                    {result.stats.pagesRead}
                    {result.stats.truncated ? ` of ${result.stats.pageCount}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Characters</dt>
                  <dd className="font-medium tabular-nums">{result.stats.charCount.toLocaleString("en-IN")}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Method</dt>
                  <dd className="font-medium">{result.method === "ocr" ? "OCR fallback" : "PDF text layer"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Saved</dt>
                  <dd className="font-medium text-muted-foreground">Nothing</dd>
                </div>
              </dl>

              {result.stats.ocrFallbackReason === "no_usable_text" ? (
                <p className="rounded border border-info/25 bg-info-muted px-3 py-2 text-[12px] leading-relaxed text-info">
                  This PDF had no usable text layer, so it was treated as a scan and read with OCR.
                </p>
              ) : null}

              <div className="space-y-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowText((value) => !value)}>
                  {showText ? "Hide extracted text" : "Show extracted text"}
                </Button>
                {showText ? (
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/50 p-3 text-[12px] leading-relaxed text-foreground/90">
                    {result.text}
                  </pre>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/40 px-3 py-3">
                <Button type="button" size="sm" loading={fieldBusy} onClick={() => void extractFields()}>
                  <Sparkles aria-hidden />
                  Extract fields
                </Button>
                <span className="text-[12px] leading-relaxed text-muted-foreground">
                  Sends this text once to the configured extractor and shows you the proposed fields for review.
                </span>
              </div>

              {fieldError ? (
                <div role="alert" className="rounded border border-danger/30 bg-danger-muted px-3 py-2.5 text-[12px] leading-relaxed text-danger">
                  <p className="font-medium">{fieldError}</p>
                  <Link href="/products/new" className="mt-1 underline underline-offset-2">
                    Add the product manually instead →
                  </Link>
                </div>
              ) : null}

              <div className="rounded border border-warning/30 bg-warning-muted px-3 py-2.5 text-[12px] leading-relaxed text-warning">
                <p className="font-medium">This text lives only in this browser tab.</p>
                <p className="mt-0.5">
                  It is not in the database and not in any log; reloading this page discards it. Only the fields you
                  confirm on the next screen are ever saved.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
