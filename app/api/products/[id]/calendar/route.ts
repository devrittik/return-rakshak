import { NextResponse } from "next/server";
import { icsFilename, policyCalendarEvent, toIcsCalendar } from "@/lib/calendar/ics";
import { db } from "@/lib/data/client";
import { getProduct } from "@/lib/data/repository";
import { currentUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Download verified deadlines as an all-day calendar file. Unverified policies are left out. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const policyId = new URL(request.url).searchParams.get("policy");
  const userId = await currentUserId();
  const product = await getProduct(db(), userId, id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = product.policies
    .filter((policy) => !policyId || policy.id === policyId)
    .map((policy) => policyCalendarEvent(product.name, policy))
    .filter((event) => event !== null);

  if (events.length === 0) {
    return NextResponse.json(
      { error: "Confirm a policy before exporting it to a calendar." },
      { status: 404 },
    );
  }

  const filename = icsFilename(product.name);
  return new NextResponse(toIcsCalendar(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
