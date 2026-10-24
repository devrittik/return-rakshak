import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/data/client";
import { deleteProduct, getProduct, updateProduct } from "@/lib/data/repository";
import { currentUserId } from "@/lib/session";
import { productPatchSchema, toMinorUnits } from "@/lib/validation/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  const product = await getProduct(db(), userId, id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product });
}

/** Correct the product facts. Policies are updated on their own route. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productPatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some fields need fixing", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const userId = await currentUserId();
  const updated = await updateProduct(db(), userId, id, {
    name: input.name,
    seller: input.seller || null,
    purchaseDate: input.purchaseDate || null,
    priceMinor: toMinorUnits(input.price),
    currency: input.price ? input.currency.toUpperCase() : null,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return NextResponse.json({ ok: true });
}

/** Deletes the product plus its policies and reminders (FK cascade). */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  const deleted = await deleteProduct(db(), userId, id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/reminders");
  return NextResponse.json({ ok: true });
}
