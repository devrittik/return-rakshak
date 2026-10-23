import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/data/client";
import { deleteProduct, getProduct } from "@/lib/data/repository";
import { currentUserId } from "@/lib/session";

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
