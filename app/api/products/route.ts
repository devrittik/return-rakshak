import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/data/client";
import { createProduct, type PolicyInput } from "@/lib/data/repository";
import { productCreateSchema, toMinorUnits, type PolicyFormInput } from "@/lib/validation/product";
import { log } from "@/lib/logger";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPolicyInput(input: PolicyFormInput | null | undefined): PolicyInput[] {
  if (!input) return [];
  return [
    {
      kind: input.kind,
      durationValue: input.durationValue,
      durationUnit: input.durationUnit,
      startDate: input.startDate,
      countingConvention: input.countingConvention,
      inclusiveEnd: input.inclusiveEnd,
      source: input.source,
      evidence: input.evidence?.trim() ? input.evidence.trim() : null,
      // A duration typed by the user is only "verified" when they ticked confirm.
      verificationStatus: input.confirmed ? "verified" : "needs_review",
      notes: input.notes ?? null,
    },
  ];
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Some fields need fixing",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const userId = await currentUserId();

  const product = await createProduct(db(), userId, {
    name: input.name,
    seller: input.seller || null,
    purchaseDate: input.purchaseDate || null,
    priceMinor: toMinorUnits(input.price),
    currency: input.price ? input.currency.toUpperCase() : null,
    category: input.category || null,
    notes: input.notes || null,
    source: "manual_entry",
    policies: [...toPolicyInput(input.returnPolicy), ...toPolicyInput(input.warrantyPolicy)],
  });

  log.info("product.create.http", { productId: product.id, policyCount: product.policies.length });
  revalidatePath("/");
  revalidatePath("/products");
  return NextResponse.json({ ok: true, productId: product.id }, { status: 201 });
}
