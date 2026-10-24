"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { policySchema, type PolicyFormInput } from "@/lib/validation/product";

export interface EditablePolicy {
  id: string;
  kind: "return" | "warranty";
  durationValue: number;
  durationUnit: "days" | "months";
  startDate: string;
  countingConvention: "calendar" | "business";
  inclusiveEnd: boolean;
  source: PolicyFormInput["source"];
  evidence: string | null;
  verificationStatus: "verified" | "needs_review";
  deadlineDate: string | null;
}

export function PolicyEditor({ productId, policy }: { productId: string; policy: EditablePolicy }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const id = policy.id;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PolicyFormInput>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      kind: policy.kind,
      durationValue: policy.durationValue,
      durationUnit: policy.durationUnit,
      startDate: policy.startDate,
      countingConvention: policy.countingConvention,
      inclusiveEnd: policy.inclusiveEnd,
      source: policy.source,
      evidence: policy.evidence ?? "",
      confirmed: policy.verificationStatus === "verified",
      notes: "",
    },
  });

  async function onSubmit(values: PolicyFormInput) {
    setServerError(null);
    const response = await fetch(`/api/products/${productId}/policies/${policy.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setServerError(payload?.error ?? "That policy couldn't be saved.");
      return;
    }
    router.refresh();
  }

  const calendarHref =
    policy.verificationStatus === "verified" && policy.deadlineDate
      ? `/api/products/${productId}/calendar?policy=${policy.id}`
      : null;

  return (
    <div className="mt-3 space-y-2">
      {calendarHref ? (
        <a
          href={calendarHref}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
        >
          <CalendarPlus aria-hidden className="size-3.5" />
          Add this deadline to your calendar
        </a>
      ) : null}

      <details open={policy.verificationStatus === "needs_review"} className="rounded border border-border bg-card">
        <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-medium">Correct this policy</summary>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 border-t border-border p-3 sm:grid-cols-2" noValidate>
          <Field label="Duration" htmlFor={`${id}-duration`} required error={errors.durationValue?.message}>
            <div className="flex gap-2">
              <Input id={`${id}-duration`} type="number" min={1} className="w-24" {...register("durationValue", { valueAsNumber: true })} />
              <Select aria-label="Duration unit" {...register("durationUnit")}>
                <option value="days">days</option>
                <option value="months">months</option>
              </Select>
            </div>
          </Field>

          <Field
            label={policy.kind === "return" ? "Window starts" : "Warranty starts"}
            htmlFor={`${id}-start`}
            required
            hint="This is not assumed to be the purchase date."
            error={errors.startDate?.message}
          >
            <Input id={`${id}-start`} type="date" {...register("startDate")} />
          </Field>

          <Field label="Counting" htmlFor={`${id}-counting`} hint="Business days skip weekends. Indian public holidays are not included." error={errors.countingConvention?.message}>
            <Select id={`${id}-counting`} {...register("countingConvention")}>
              <option value="calendar">Calendar days</option>
              <option value="business">Business days</option>
            </Select>
          </Field>

          <label className="flex items-start gap-2.5 pt-6 text-[12.5px] leading-relaxed">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" {...register("inclusiveEnd")} />
            <span>
              <span className="font-medium">Include the last day</span>
              <span className="mt-0.5 block text-muted-foreground">
                Leave this unticked when the window closes the day before the anniversary.
              </span>
            </span>
          </label>

          <Field label="Source" htmlFor={`${id}-source`}>
            <Select id={`${id}-source`} {...register("source")}>
              <option value="invoice">Invoice</option>
              <option value="seller_website">Seller&apos;s website</option>
              <option value="manufacturer">Manufacturer</option>
              <option value="user_statement">My own recollection</option>
              <option value="unknown">Not sure</option>
            </Select>
          </Field>

          <Field label="Evidence" htmlFor={`${id}-evidence`} hint="A short quote you are willing to keep. Not the whole invoice." error={errors.evidence?.message}>
            <Input id={`${id}-evidence`} {...register("evidence")} />
          </Field>

          <label className="sm:col-span-2 flex items-start gap-2.5 rounded border border-border bg-muted/40 p-3 text-[12.5px] leading-relaxed">
            <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" {...register("confirmed")} />
            <span>
              I checked this against the invoice or the seller&apos;s terms. Leave it unticked and the date stays out of
              the dashboard and out of the calendar file.
            </span>
          </label>

          {serverError ? (
            <p role="alert" className="sm:col-span-2 text-[12.5px] font-medium text-danger">
              {serverError}
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" size="sm" loading={isSubmitting}>
              Save policy
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
