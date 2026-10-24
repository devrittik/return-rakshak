"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { productCreateSchema, type ProductCreateInput } from "@/lib/validation/product";
import { todayIso } from "@/lib/policy/deadline";

const today = todayIso();

export function ManualProductForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [withReturn, setWithReturn] = useState(true);
  const [withWarranty, setWithWarranty] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductCreateInput>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: {
      name: "",
      seller: "",
      purchaseDate: today,
      price: "",
      currency: "INR",
      category: "",
      notes: "",
      returnPolicy: {
        kind: "return",
        durationValue: 7,
        durationUnit: "days",
        startDate: today,
        countingConvention: "calendar",
        inclusiveEnd: true,
        source: "seller_website",
        evidence: "",
        confirmed: false,
        notes: "",
      },
      warrantyPolicy: null,
    },
  });

  const purchaseDate = watch("purchaseDate");

  async function onSubmit(values: ProductCreateInput) {
    setServerError(null);
    const payload: ProductCreateInput = {
      ...values,
      returnPolicy: withReturn
        ? {
            ...(values.returnPolicy ?? {
              kind: "return",
              durationValue: 7,
              durationUnit: "days",
              startDate: values.purchaseDate || today,
              countingConvention: "calendar",
              inclusiveEnd: true,
              source: "unknown",
              confirmed: false,
            }),
            kind: "return",
            // Default the window start to the purchase date unless the user changed it.
            startDate: values.returnPolicy?.startDate || values.purchaseDate || today,
          }
        : null,
      warrantyPolicy: withWarranty
        ? {
            ...(values.warrantyPolicy ?? {
              kind: "warranty",
              durationValue: 12,
              durationUnit: "months",
              startDate: values.purchaseDate || today,
              countingConvention: "calendar",
              inclusiveEnd: true,
              source: "unknown",
              confirmed: false,
            }),
            kind: "warranty",
            startDate: values.warrantyPolicy?.startDate || values.purchaseDate || today,
          }
        : null,
    };

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(body?.error ?? "Could not save the product. Check the fields and try again.");
      return;
    }

    const body = (await res.json()) as { productId: string };
    router.push(`/products/${body.productId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Product</CardTitle>
          <CardDescription>Only what you type here is stored. Nothing else is captured.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
            <Input
              id="name"
              autoComplete="off"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              placeholder="e.g. Aurora ANC Headphones"
              {...register("name")}
            />
          </Field>

          <Field label="Seller" htmlFor="seller" error={errors.seller?.message}>
            <Input id="seller" autoComplete="off" placeholder="e.g. SonicWave Electronics" {...register("seller")} />
          </Field>

          <Field
            label="Purchase date"
            htmlFor="purchaseDate"
            hint="Leave empty if you don't know it — it will stay blank rather than guessed."
            error={errors.purchaseDate?.message}
          >
            <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
          </Field>

          <Field label="Price" htmlFor="price" hint="Amount in the currency below. Optional." error={errors.price?.message}>
            <Input id="price" inputMode="decimal" placeholder="8499.00" {...register("price")} />
          </Field>

          <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
            <Input id="currency" maxLength={3} className="uppercase" {...register("currency")} />
          </Field>

          <Field label="Category" htmlFor="category" error={errors.category?.message}>
            <Input id="category" placeholder="e.g. Audio" {...register("category")} />
          </Field>

          <Field label="Notes" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2">
            <Textarea id="notes" placeholder="Anything you want to remember about this purchase." {...register("notes")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Return window</CardTitle>
            <CardDescription>
              The window may start on delivery, not purchase — set the start date explicitly.
            </CardDescription>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium">
            <input
              type="checkbox"
              checked={withReturn}
              onChange={(e) => setWithReturn(e.target.checked)}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Track
          </label>
        </CardHeader>
        {withReturn ? (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Duration" htmlFor="return-duration" required error={errors.returnPolicy?.durationValue?.message}>
              <div className="flex gap-2">
                <Input
                  id="return-duration"
                  type="number"
                  min={1}
                  className="w-24"
                  {...register("returnPolicy.durationValue", { valueAsNumber: true })}
                />
                <Select aria-label="Duration unit" {...register("returnPolicy.durationUnit")}>
                  <option value="days">days</option>
                  <option value="months">months</option>
                </Select>
              </div>
            </Field>

            <Field
              label="Window starts"
              htmlFor="return-start"
              required
              hint="Delivery date, invoice date — whatever the policy actually says."
              error={errors.returnPolicy?.startDate?.message}
            >
              <Input id="return-start" type="date" defaultValue={purchaseDate} {...register("returnPolicy.startDate")} />
            </Field>

            <Field label="Counting" htmlFor="return-counting" hint="Business days skip weekends; Indian holidays are not modelled.">
              <Select id="return-counting" {...register("returnPolicy.countingConvention")}>
                <option value="calendar">Calendar days</option>
                <option value="business">Business days</option>
              </Select>
            </Field>

            <Field label="End day" htmlFor="return-inclusive">
              <Select id="return-inclusive" {...register("returnPolicy.inclusiveEnd", { setValueAs: (v) => v === true || v === "true" })}>
                <option value="true">Include the last day</option>
                <option value="false">Exclude the last day</option>
              </Select>
            </Field>

            <Field label="Source" htmlFor="return-source" hint="Where this duration comes from.">
              <Select id="return-source" {...register("returnPolicy.source")}>
                <option value="seller_website">Seller&apos;s website</option>
                <option value="invoice">Invoice</option>
                <option value="manufacturer">Manufacturer</option>
                <option value="user_statement">My own recollection</option>
                <option value="unknown">Not sure</option>
              </Select>
            </Field>

            <Field
              label="Evidence"
              htmlFor="return-evidence"
              hint="A short quote of the term, if you have one. Never paste the whole invoice."
            >
              <Input id="return-evidence" placeholder="e.g. Return accepted within 7 days of delivery." {...register("returnPolicy.evidence")} />
            </Field>

            <label className="sm:col-span-2 flex items-start gap-2.5 rounded border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed">
              <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" {...register("returnPolicy.confirmed")} />
              <span>
                I checked this against the seller&apos;s terms. Unticked, the policy is saved as{" "}
                <strong className="font-semibold">needs review</strong> and its date stays out of the dashboard.
              </span>
            </label>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Warranty</CardTitle>
            <CardDescription>A duration on its own is not a confirmed policy — evidence or your confirmation is required.</CardDescription>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium">
            <input
              type="checkbox"
              checked={withWarranty}
              onChange={(e) => setWithWarranty(e.target.checked)}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Track
          </label>
        </CardHeader>
        {withWarranty ? (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Duration" htmlFor="warranty-duration">
              <div className="flex gap-2">
                <Input
                  id="warranty-duration"
                  type="number"
                  min={1}
                  className="w-24"
                  {...register("warrantyPolicy.durationValue", { valueAsNumber: true })}
                />
                <Select aria-label="Warranty duration unit" {...register("warrantyPolicy.durationUnit")}>
                  <option value="months">months</option>
                  <option value="days">days</option>
                </Select>
              </div>
            </Field>

            <Field label="Warranty starts" htmlFor="warranty-start" hint="Usually the purchase date — confirm it.">
              <Input id="warranty-start" type="date" defaultValue={purchaseDate} {...register("warrantyPolicy.startDate")} />
            </Field>

            <Field label="Source" htmlFor="warranty-source">
              <Select id="warranty-source" {...register("warrantyPolicy.source")}>
                <option value="manufacturer">Manufacturer</option>
                <option value="invoice">Invoice</option>
                <option value="seller_website">Seller&apos;s website</option>
                <option value="user_statement">My own recollection</option>
                <option value="unknown">Not sure</option>
              </Select>
            </Field>

            <Field label="Evidence" htmlFor="warranty-evidence">
              <Input id="warranty-evidence" placeholder="e.g. 1-year warranty on the motor." {...register("warrantyPolicy.evidence")} />
            </Field>

            <label className="sm:col-span-2 flex items-start gap-2.5 rounded border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed">
              <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" {...register("warrantyPolicy.confirmed")} />
              <span>I confirmed this warranty myself.</span>
            </label>
          </CardContent>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-start gap-3 rounded border border-info/25 bg-info-muted px-4 py-3 text-[12.5px] leading-relaxed text-info">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          Deadlines are computed in code from the values above — not by the AI. Unticked policies are saved as{" "}
          <strong className="font-semibold">needs review</strong> and never appear as confirmed dates.
        </p>
      </div>

      {serverError ? (
        <div role="alert" className="flex items-start gap-2 rounded border border-danger/30 bg-danger-muted px-4 py-3 text-[12.5px] text-danger">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{serverError}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={isSubmitting} size="lg">
          Save product
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
