import { ArrowLeft, CalendarClock, FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PolicyEditor } from "@/components/policy-editor";
import { DeadlineLine, PolicyDuration, VerificationBadge } from "@/components/policy-status";
import { ProductFactsForm } from "@/components/product-facts-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/data/client";
import { getProduct } from "@/lib/data/repository";
import { todayIso } from "@/lib/policy/deadline";
import { currentUserId } from "@/lib/session";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const sourceLabels: Record<string, string> = {
  invoice: "Invoice",
  seller_website: "Seller's website",
  manufacturer: "Manufacturer",
  user_statement: "Your own statement",
  unknown: "Not recorded",
};

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  const product = await getProduct(db(), userId, id);
  if (!product) notFound();

  const today = todayIso();
  const returnPolicy = product.policies.find((p) => p.kind === "return");
  const warrantyPolicy = product.policies.find((p) => p.kind === "warranty");
  const hasExport = product.policies.some((policy) => policy.verificationStatus === "verified" && policy.deadlineDate);
  const priceInput =
    product.priceMinor === null ? "" : (product.priceMinor / 100).toFixed(2).replace(/\.00$/, "");

  return (
    <>
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All products
        </Link>
      </div>

      <PageHeader
        eyebrow={product.source === "demo" ? "Demo record" : product.source === "manual_entry" ? "Added manually" : "From invoice"}
        title={product.name}
        description={[product.seller, product.purchaseDate ? `Purchased ${formatDate(product.purchaseDate)}` : null]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {hasExport ? (
              <a
                href={`/api/products/${product.id}/calendar`}
                className="inline-flex h-8 items-center rounded border border-border bg-card px-3 text-[13px] font-medium hover:bg-muted"
              >
                Download calendar
              </a>
            ) : null}
            <ActionButton
            variant="outline"
            size="sm"
            endpoint={`/api/products/${product.id}`}
            method="DELETE"
            confirmText={`Delete "${product.name}" and all of its policies and reminders? This cannot be undone.`}
            redirectTo="/products"
          >
            Delete product
          </ActionButton>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Policy windows</CardTitle>
              <CardDescription>
                Dates are computed from an explicit start date and counting convention — never guessed from the
                purchase date alone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {product.policies.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No policies recorded. Deadline tracking needs at least one confirmed policy.
                </p>
              ) : null}

              {[returnPolicy, warrantyPolicy].filter(Boolean).map((policy) => (
                <div key={policy!.id} className="rounded border border-border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {policy!.kind === "return" ? (
                        <CalendarClock aria-hidden className="size-4 text-primary" />
                      ) : (
                        <ShieldCheck aria-hidden className="size-4 text-primary" />
                      )}
                      <span className="text-[13.5px] font-semibold">
                        {policy!.kind === "return" ? "Return window" : "Warranty"}
                      </span>
                    </div>
                    <VerificationBadge status={policy!.verificationStatus} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="font-medium">
                        <PolicyDuration policy={policy!} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Starts</dt>
                      <dd className="font-medium">{formatDate(policy!.startDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Counting</dt>
                      <dd className="font-medium">
                        {policy!.countingConvention === "business" ? "Business days" : "Calendar days"} ·{" "}
                        {policy!.inclusiveEnd ? "end day included" : "end day excluded"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Source</dt>
                      <dd className="font-medium">{sourceLabels[policy!.source] ?? policy!.source}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Deadline</dt>
                      <dd className="mt-0.5">
                        <DeadlineLine policy={policy!} todayIso={today} />
                      </dd>
                    </div>
                    {policy!.evidence ? (
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Evidence (as confirmed by you)</dt>
                        <dd className="mt-0.5 rounded bg-card px-2.5 py-2 text-[12.5px] italic leading-relaxed text-foreground/90">
                          “{policy!.evidence}”
                        </dd>
                      </div>
                    ) : (
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Evidence</dt>
                        <dd className="mt-0.5 text-[12.5px] text-muted-foreground">
                          None recorded — this policy cannot be treated as confirmed.
                        </dd>
                      </div>
                    )}
                  </dl>

                  {policy!.verificationStatus === "needs_review" ? (
                    <p className="mt-3 rounded border border-warning/30 bg-warning-muted px-2.5 py-2 text-[12px] leading-relaxed text-warning">
                      This policy is not confirmed, so its date stays off the dashboard and out of the calendar file.
                      Correct it below, then tick the confirmation box.
                    </p>
                  ) : null}
                  <PolicyEditor
                    productId={product.id}
                    policy={{
                      id: policy!.id,
                      kind: policy!.kind,
                      durationValue: policy!.durationValue,
                      durationUnit: policy!.durationUnit,
                      startDate: policy!.startDate,
                      countingConvention: policy!.countingConvention,
                      inclusiveEnd: policy!.inclusiveEnd,
                      source: policy!.source,
                      evidence: policy!.evidence,
                      verificationStatus: policy!.verificationStatus,
                      deadlineDate: policy!.deadlineDate,
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {product.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/90">{product.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Purchase details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="font-medium tabular-nums">{formatMoney(product.priceMinor, product.currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Purchased</dt>
                  <dd className="font-medium">{formatDate(product.purchaseDate)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Seller</dt>
                  <dd className="max-w-[60%] truncate text-right font-medium">{product.seller ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium">{product.category ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Record created</dt>
                  <dd className="font-medium">{formatDate(product.createdAt.toISOString().slice(0, 10))}</dd>
                </div>
              </dl>
              <ProductFactsForm
                productId={product.id}
                name={product.name}
                seller={product.seller ?? ""}
                purchaseDate={product.purchaseDate ?? ""}
                price={priceInput}
                currency={product.currency ?? "INR"}
              />
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary-muted/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 aria-hidden className="size-4 text-primary" />
                What is stored
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12.5px] leading-relaxed text-foreground/80">
              <p>
                Only the fields above: the product, your confirmed policy details, and a short evidence quote you
                approved.
              </p>
              <p>The original invoice, its OCR text and the model&apos;s raw response were deleted after processing.</p>
              <Link href="/privacy" className="inline-block font-medium text-primary underline-offset-2 hover:underline">
                Privacy notice →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
