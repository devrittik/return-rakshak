import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/data/client";
import { getProduct, updatePolicy, type PolicyInput } from "@/lib/data/repository";
import { log } from "@/lib/logger";
import { computeDeadline } from "@/lib/policy/deadline";
import { currentUserId } from "@/lib/session";
import { policySchema } from "@/lib/validation/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; policyId: string }> };

/**
 * Correct a saved policy. The deadline is recomputed here. The client cannot
 * submit a date, and ticking the confirmation box is the only way a policy
 * becomes verified.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id, policyId } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = await currentUserId();
  const product = await getProduct(db(), userId, id);
  const current = product?.policies.find((policy) => policy.id === policyId);
  if (!product || !current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = payload && typeof payload === "object" ? payload : {};
  const parsed = policySchema.safeParse({ ...body, kind: current.kind });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some fields need fixing", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const computed = computeDeadline({
    startDate: input.startDate,
    durationValue: input.durationValue,
    durationUnit: input.durationUnit,
    countingConvention: input.countingConvention,
    inclusiveEnd: input.inclusiveEnd,
  });
  if (!computed.ok) {
    const message =
      computed.reason === "unsupported_convention"
        ? "Business-day counting only works for a number of days, not months."
        : "That start date and duration don't produce a deadline.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const patch: Partial<PolicyInput> = {
    durationValue: input.durationValue,
    durationUnit: input.durationUnit,
    startDate: input.startDate,
    countingConvention: input.countingConvention,
    inclusiveEnd: input.inclusiveEnd,
    source: input.source,
    evidence: input.evidence?.trim() ? input.evidence.trim() : null,
    verificationStatus: input.confirmed ? "verified" : "needs_review",
    notes: input.notes ?? null,
  };

  const updated = await updatePolicy(db(), userId, policyId, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  log.info("policy.updated", {
    productId: id,
    policyId,
    status: updated.verificationStatus,
    hasDeadline: Boolean(updated.deadlineDate),
  });
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  revalidatePath("/reminders");
  return NextResponse.json({
    ok: true,
    verificationStatus: updated.verificationStatus,
    deadlineDate: updated.deadlineDate,
  });
}
