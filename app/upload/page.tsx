import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { UploadInvoice } from "@/components/upload-invoice";

export const metadata = { title: "Upload invoice" };

export default function UploadPage() {
  return (
    <>
      <PageHeader
        eyebrow="Intake"
        title="Upload an invoice"
        description="PDF, JPEG or PNG. Read in a temporary directory, then deleted — the document itself is never kept."
        actions={
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11.5px] font-medium text-muted-foreground sm:inline-flex">
            <ShieldCheck aria-hidden className="size-3.5 text-primary" />
            10 MB limit · 10 pages read
          </span>
        }
      />
      <UploadInvoice />
    </>
  );
}
