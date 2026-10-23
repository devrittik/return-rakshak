import { NextResponse } from "next/server";
import { db } from "@/lib/data/client";
import { clearDemoData } from "@/lib/data/demo";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await currentUserId();
  const removed = await clearDemoData(db(), userId);
  return NextResponse.json({ ok: true, removed });
}
