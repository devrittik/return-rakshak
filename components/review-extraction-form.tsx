"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  FileSearch,
  HelpCircle,
  Save,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { toReviewDefaults, type ReviewDefaults } from "@/lib/ai/to-form";
import type { ExtractionModel } from "@/lib/ai/schema";
import { productCreateSchema, type ProductCreateInput } from "@/lib/validation/product";

type Confidence = "high" | "medium" | "low";

function ProvenanceBadge({ confidence, missing }: { confidence?: Confidence; missing?: boolean }) {
  if (missing) {
    return (
      <Badge tone="warning">
        <HelpCircle aria-hidden className="size-3" />
        Not on the invoice
      </Badge>
    );
  }
  if (confidence === "high") {
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden className="size-3" />
        Read from invoice
      </Badge>
    );
  }
  if (confidence === "medium") {
    return (
      <Badge tone="info">
        <FileSearch aria-hidden className="size-3" />
        Check this
      </Badge>
    );
  }
  return (
    <Badge tone="warning">
      <HelpCircle aria-hidden className="size-3" />
      Unsure
    </Badge>
  );
}

const basisCopy: Record<string, { label: string; hint: string }> = {
  purchase_date: {
    label: "Starts on the purchase date",
    hint: "The invoice implies the window runs from the purchase date.",
  },
  delivery_date: {
    label: "Starts on the delivery date",
    hint: "The terms mention delivery — set the delivery date yourself; we won't guess it.",
  },
  unknown: {
    label: "Start date not stated",
    hint: "The invoice doesn't say where this window starts. Choose the start date deliberately.",
  },
};

export function ReviewExtractionForm({
  extraction,
  provider,
  model,
  onBack,
}: {
  extraction: ExtractionModel;
  provider: string;
  model: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const defaults: ReviewDefaults = toReviewDefaults(extraction);
  const [serverError, setServerError] = useState<string | null>(null);
  const [trackReturn, setTrackReturn] = useState(defaults.hasReturn);
  const [trackWarranty, setTrackWarranty] = useState(defaults.hasWarranty);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductCreateInput>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: {
      name: defaults.name,
      seller: defaults.seller,
      purchaseDate: defaults.purchaseDate,
      price: defaults.price,
      currency: defaults.currency,
      category: "",
      notes: "",
      returnPolicy: defaults.hasReturn
        ? {
            kind: "return",
            durationValue: Number(defaults.returnDurationValue),
            durationUnit: defaults.returnDurationUnit,
            startDate: defaults.returnStartDate,
            countingConvention: "calendar",
            inclusiveEnd: true,
            source: "invoice",
            evidence: defaults.returnEvidence,
            confirmed: false,
            notes: "",
          }
        : null,
      warrantyPolicy: defaults.hasWarranty
        ? {
            kind: "warranty",
            durationValue: Number(defaults.warrantyDurationValue),
            durationUnit: defaults.warrantyDurationUnit,
            startDate: defaults.warrantyStartDate,
            countingConvention: "calendar",
            inclusiveEnd: true,
            source: "manufacturer",
            evidence: defaults.warrantyEvidence,
            confirmed: false,
            notes: "",
          }
        : null,
    },
  });

  const returnStart = watch("returnPolicy.startDate");
  const warrantyStart = watch("warrantyPolicy.startDate");

  async function onSubmit(values: ProductCreateInput) {
    setServerError(null);
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        source: "invoice_ai",
        returnPolicy: values.returnPolicy
          ? { ...values.returnPolicy, kind: "return" as const, startDate: values.returnPolicy.startDate || values.purchaseDate }
          : null,
        warrantyPolicy: values.warrantyPolicy
          ? { ...values.warrantyPolicy, kind: "warranty" as const, startDate: values.warrantyPolicy.startDate || values.purchaseDate }
          : null,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; fieldErrors?: Record<string, string[]> }
        | null;
      const firstFieldError = payload?.fieldErrors ? Object.values(payload.fieldErrors)[0]?.[0] : undefined;
      setServerError(firstFieldError ?? payload?.error ?? "Could not save this product. Check the fields and try again.");
      return;
    }

    const payload = (await response.json()) as { productId: string };
    router.push(`/products/${payload.productId}`);
    router.refresh();
  }

  const missing = new Set(extraction.missingFields);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card className="border-primary/25 bg-primary-muted/40">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="flex items-start gap-2.5">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">Review before saving</p>
              <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-foreground/75">
                These fields were proposed by <span className="font-medium">{provider}</span> ({model}). A proposal is
                not a fact — correct anything that is wrong, fill in what is missing, and confirm each policy
                yourself.
              </p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft aria-hidden />
            Back to upload
          </Button>
        </CardContent>
      </Card>

      {extraction.uncertaintyNotes.length > 0 ? (
        <Card className="border-warning/30 bg-warning-muted/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[13.5px]">
              <AlertTriangle aria-hidden className="size-4 text-warning" />
              What the extractor was unsure about
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-warning">
              {extraction.uncertaintyNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          <CardDescription>Everything here is editable. Empty fields will stay empty unless you fill them.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Product name<span className="ml-0.5 text-danger">*</span></span>
              <ProvenanceBadge confidence={extraction.productName.confidence as Confidence} missing={missing.has("productName")} />
            </div>
            <Input
              aria-label="Product name"
              aria-invalid={!!errors.name}
              placeholder="e.g. Aurora ANC Headphones"
              {...register("name")}
            />
            {errors.name ? <p className="mt-1 text-[12px] font-medium text-danger">{errors.name.message}</p> : null}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Seller</span>
              <ProvenanceBadge confidence={extraction.seller.confidence as Confidence} missing={missing.has("seller")} />
            </div>
            <Input aria-label="Seller" placeholder="e.g. SonicWave Electronics" {...register("seller")} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Purchase date</span>
              <ProvenanceBadge confidence={extraction.purchaseDate.confidence as Confidence} missing={missing.has("purchaseDate")} />
            </div>
            <Input type="date" aria-label="Purchase date" {...register("purchaseDate")} />
            {errors.purchaseDate ? (
              <p className="mt-1 text-[12px] font-medium text-danger">{errors.purchaseDate.message}</p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Price</span>
              <ProvenanceBadge confidence={extraction.price.confidence as Confidence} missing={missing.has("price")} />
            </div>
            <Input inputMode="decimal" aria-label="Price" placeholder="8499.00" {...register("price")} />
            {errors.price ? <p className="mt-1 text-[12px] font-medium text-danger">{errors.price.message}</p> : null}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Currency</span>
              <ProvenanceBadge confidence={extraction.currency.confidence as Confidence} missing={missing.has("currency")} />
            </div>
            <Input maxLength={3} className="uppercase" aria-label="Currency" {...register("currency")} />
          </div>

          <Field label="Notes" htmlFor="review-notes" className="sm:col-span-2">
            <Textarea id="review-notes" placeholder="Anything you want to remember about this purchase." {...register("notes")} />
          </Field>
        </CardContent>
      </Card>

      {/* Return window */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Return window</CardTitle>
            <CardDescription>
              {basisCopy[defaults.returnStartBasis]?.label ?? "Check where this window starts"} —{" "}
              {basisCopy[defaults.returnStartBasis]?.hint}
            </CardDescription>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium">
            <input
              type="checkbox"
              checked={trackReturn}
              className="size-4 accent-[hsl(var(--primary))]"
              onChange={(event) => {
                const next = event.currentTarget.checked;
                setTrackReturn(next);
                setValue(
                  "returnPolicy",
                  next
                    ? {
                        kind: "return",
                        durationValue: Number(defaults.returnDurationValue),
                        durationUnit: defaults.returnDurationUnit,
                        startDate: defaults.returnStartDate,
                        countingConvention: "calendar",
                        inclusiveEnd: true,
                        source: "invoice",
                        evidence: defaults.returnEvidence,
                        confirmed: false,
                        notes: "",
                      }
                    : null,
                );
              }}
            />
            Track
          </label>
        </CardHeader>
        {trackReturn ? (
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Duration</span>
              <ProvenanceBadge confidence={extraction.returnPolicy.confidence as Confidence} missing={missing.has("returnPolicy")} />
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                aria-label="Return duration"
                className="w-24"
                {...register("returnPolicy.durationValue", { valueAsNumber: true })}
              />
              <Select aria-label="Return duration unit" {...register("returnPolicy.durationUnit")}>
                <option value="days">days</option>
                <option value="months">months</option>
              </Select>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[13px] font-medium">
              Window starts<span className="ml-0.5 text-danger">*</span>
            </span>
            <Input type="date" aria-label="Return window start" {...register("returnPolicy.startDate")} />
            {errors.returnPolicy?.startDate ? (
              <p className="mt-1 text-[12px] font-medium text-danger">{errors.returnPolicy.startDate.message}</p>
            ) : null}
            {!returnStart ? (
              <p className="mt-1 text-[12px] text-warning">
                {defaults.returnStartBasis === "delivery_date"
                  ? "The invoice ties this window to delivery — enter the delivery date."
                  : "The invoice doesn't say where this window starts — pick the date yourself."}
              </p>
            ) : null}
          </div>

          <Field label="Evidence" htmlFor="review-return-evidence" hint="The exact words from the invoice you're relying on.">
            <Input id="review-return-evidence" {...register("returnPolicy.evidence")} />
          </Field>

          <Field label="Source" htmlFor="review-return-source">
            <Select id="review-return-source" {...register("returnPolicy.source")}>
              <option value="invoice">Invoice</option>
              <option value="seller_website">Seller&apos;s website</option>
              <option value="manufacturer">Manufacturer</option>
              <option value="user_statement">My own recollection</option>
              <option value="unknown">Not sure</option>
            </Select>
          </Field>

          <label className="flex items-start gap-2.5 rounded border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" {...register("returnPolicy.confirmed")} />
            <span>
              I&apos;ve checked this return window against the invoice.{" "}
              <span className="text-muted-foreground">
                Unticked, it is saved as <strong className="font-semibold">needs review</strong> and stays out of the
                dashboard.
              </span>
            </span>
          </label>
        </CardContent>
        ) : null}
      </Card>

      {/* Warranty */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Warranty</CardTitle>
            <CardDescription>
              {defaults.hasWarranty
                ? "A duration alone is not a confirmed warranty — evidence plus your confirmation is what makes it one."
                : "No warranty was found on this invoice. Add it here only if you know it."}
            </CardDescription>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium">
            <input
              type="checkbox"
              checked={trackWarranty}
              className="size-4 accent-[hsl(var(--primary))]"
              onChange={(event) => {
                const next = event.currentTarget.checked;
                setTrackWarranty(next);
                setValue(
                  "warrantyPolicy",
                  next
                    ? {
                        kind: "warranty",
                        durationValue: Number(defaults.warrantyDurationValue),
                        durationUnit: defaults.warrantyDurationUnit,
                        startDate: defaults.warrantyStartDate,
                        countingConvention: "calendar",
                        inclusiveEnd: true,
                        source: "manufacturer",
                        evidence: defaults.warrantyEvidence,
                        confirmed: false,
                        notes: "",
                      }
                    : null,
                );
              }}
            />
            Track
          </label>
        </CardHeader>
        {trackWarranty ? (
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">Duration</span>
              <ProvenanceBadge confidence={extraction.warranty.confidence as Confidence} missing={missing.has("warranty")} />
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                aria-label="Warranty duration"
                className="w-24"
                {...register("warrantyPolicy.durationValue", { valueAsNumber: true })}
              />
              <Select aria-label="Warranty duration unit" {...register("warrantyPolicy.durationUnit")}>
                <option value="months">months</option>
                <option value="days">days</option>
              </Select>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[13px] font-medium">Warranty starts</span>
            <Input type="date" aria-label="Warranty start" {...register("warrantyPolicy.startDate")} />
            {errors.warrantyPolicy?.startDate ? (
              <p className="mt-1 text-[12px] font-medium text-danger">
                Set the warranty start date, or untick Track if you don&apos;t want to record this warranty.
              </p>
            ) : !warrantyStart ? (
              <p className="mt-1 text-[12px] text-muted-foreground">
                Needed to compute the expiry — we won&apos;t guess it.
              </p>
            ) : null}
          </div>

          <Field label="Evidence" htmlFor="review-warranty-evidence">
            <Input id="review-warranty-evidence" {...register("warrantyPolicy.evidence")} />
          </Field>

          <Field label="Source" htmlFor="review-warranty-source">
            <Select id="review-warranty-source" {...register("warrantyPolicy.source")}>
              <option value="manufacturer">Manufacturer</option>
              <option value="invoice">Invoice</option>
              <option value="seller_website">Seller&apos;s website</option>
              <option value="user_statement">My own recollection</option>
              <option value="unknown">Not sure</option>
            </Select>
          </Field>

          <label className="flex items-start gap-2.5 rounded border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" {...register("warrantyPolicy.confirmed")} />
            <span>I confirmed this warranty myself.</span>
          </label>
        </CardContent>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-start gap-3 rounded border border-info/25 bg-info-muted px-4 py-3 text-[12.5px] leading-relaxed text-info">
        <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          Saving stores only these confirmed fields. The invoice, its text and the extractor&apos;s response are
          already gone.
        </p>
      </div>

      {serverError ? (
        <div role="alert" className="flex items-start gap-2 rounded border border-danger/30 bg-danger-muted px-4 py-3 text-[12.5px] text-danger">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" loading={isSubmitting}>
          <Save aria-hidden />
          Save confirmed product
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={isSubmitting}>
          Discard
        </Button>
      </div>
    </form>
  );
}
