import { Database, FileX2, LogOut, ShieldCheck, Timer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Privacy notice"
        title="What ReturnRakshak stores — and what it never does"
        description="This page describes the implementation, not an aspiration. Where a guarantee is impossible, it says so."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-success/25">
          <CardHeader className="flex-row items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-success-muted text-success">
              <Database aria-hidden className="size-4" />
            </span>
            <div>
              <CardTitle>Stored, because the feature needs it</CardTitle>
              <CardDescription>The complete list — nothing else is written to the database.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-foreground/85">
              <li>Product name, seller, purchase date, price and currency, category, your notes</li>
              <li>Policy kind, duration, start date, counting convention, verification status</li>
              <li>A short evidence quote you confirmed (one or two lines, not the document)</li>
              <li>Computed deadline dates and the reminders you scheduled</li>
              <li>Timestamps and a single local owner record (until multi-user auth ships)</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-danger/25">
          <CardHeader className="flex-row items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-danger-muted text-danger">
              <FileX2 aria-hidden className="size-4" />
            </span>
            <div>
              <CardTitle>Never stored</CardTitle>
              <CardDescription>Not in the database, not in logs, not on disk after processing.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-foreground/85">
              <li>The original invoice file — PDF, JPEG or PNG — in any form</li>
              <li>Rendered page images or OCR output</li>
              <li>Full extracted invoice text</li>
              <li>Model prompts or raw model responses</li>
              <li>Anything written to a public directory</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-primary">
              <Timer aria-hidden className="size-4" />
            </span>
            <div>
              <CardTitle>How long temporary files live</CardTitle>
              <CardDescription>Short by construction, cleaned by contract.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] leading-relaxed text-foreground/85">
            <p>
              Uploads are written to the operating system&apos;s temp directory for the duration of a single request.
              A <code className="rounded bg-muted px-1 py-0.5 text-[12px]">finally</code> block deletes them whether
              processing succeeds, fails or times out. Cleanup is covered by tests.
            </p>
            <p className="rounded border border-warning/30 bg-warning-muted px-3 py-2 text-[12.5px] text-warning">
              Deletion means unlinking the file. It is not a cryptographic secure erase: on most filesystems the
              underlying blocks are reclaimed later and are not overwritten. We do not claim otherwise.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-primary">
              <ShieldCheck aria-hidden className="size-4" />
            </span>
            <div>
              <CardTitle>Who can see your records</CardTitle>
              <CardDescription>Single-user today, scoped by design.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-[13px] leading-relaxed text-foreground/85">
            <p>
              In local mode the database file lives on your machine, outside the web root, and no account is needed.
            </p>
            <p>
              Every table is already keyed by a user id and every query filters on it. A hosted deployment stays
              single-user until real authentication and authorisation are implemented — an unauthenticated shared
              database is never an acceptable configuration.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/40">
        <CardHeader className="flex-row items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded bg-card text-muted-foreground">
            <LogOut aria-hidden className="size-4" />
          </span>
          <div>
            <CardTitle>Your controls</CardTitle>
            <CardDescription>No dark patterns, no soft-delete you cannot see.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-foreground/85">
            <li>Deleting a product removes its policies and reminders in the same transaction.</li>
            <li>Deleting the local database file removes everything, because nothing is kept elsewhere.</li>
            <li>AI extraction is optional: manual entry works with no model and no network.</li>
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
