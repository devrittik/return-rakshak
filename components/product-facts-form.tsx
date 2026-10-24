"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { productPatchSchema, type ProductPatchInput } from "@/lib/validation/product";

export function ProductFactsForm({
  productId,
  name,
  seller,
  purchaseDate,
  price,
  currency,
}: {
  productId: string;
  name: string;
  seller: string;
  purchaseDate: string;
  price: string;
  currency: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductPatchInput>({
    resolver: zodResolver(productPatchSchema),
    defaultValues: { name, seller, purchaseDate, price, currency: currency || "INR" },
  });

  async function onSubmit(values: ProductPatchInput) {
    setServerError(null);
    const response = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setServerError(payload?.error ?? "Those details couldn't be saved.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 grid gap-3 border-t border-border pt-4" noValidate>
      <Field label="Product name" htmlFor="edit-name" required error={errors.name?.message}>
        <Input id="edit-name" {...register("name")} />
      </Field>
      <Field label="Seller" htmlFor="edit-seller" error={errors.seller?.message}>
        <Input id="edit-seller" {...register("seller")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchased" htmlFor="edit-purchased" error={errors.purchaseDate?.message}>
          <Input id="edit-purchased" type="date" {...register("purchaseDate")} />
        </Field>
        <Field label="Price" htmlFor="edit-price" error={errors.price?.message}>
          <Input id="edit-price" inputMode="decimal" {...register("price")} />
        </Field>
      </div>
      <Field label="Currency" htmlFor="edit-currency" error={errors.currency?.message}>
        <Input id="edit-currency" maxLength={3} className="uppercase" {...register("currency")} />
      </Field>
      {serverError ? (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {serverError}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" variant="outline" loading={isSubmitting}>
          Save details
        </Button>
      </div>
    </form>
  );
}
