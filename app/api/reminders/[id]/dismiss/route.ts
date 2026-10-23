import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/data/client";
import { dismissReminder } from "@/lib/data/repository";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  const ok = await dismissReminder(db(), userId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  revalidatePath("/reminders");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
