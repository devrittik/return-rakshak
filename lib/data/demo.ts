import { and, eq } from "drizzle-orm";
import { addCalendarDays, todayIso } from "@/lib/policy/deadline";
import type { Database } from "./client";
import { createProduct, createReminder, listProducts } from "./repository";
import { products } from "./schema";

/**
 * Synthetic demo data — invented products, invented sellers, no real invoices.
 * Idempotent: calling it twice does not duplicate records.
 * Every row is tagged `source: "demo"` so it is visually distinguishable and
 * can be removed in one action.
 */

const DEMO_SOURCE = "demo" as const;

export async function loadDemoData(database: Database, userId: string): Promise<{ created: number }> {
  const existing = await database
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.userId, userId), eq(products.source, DEMO_SOURCE)))
    .limit(1);
  if (existing[0]) return { created: 0 };

  const today = todayIso();
  // Dates are relative to "today" so the demo always looks live.
  const purchaseA = addCalendarDays(today, -45);
  const purchaseB = addCalendarDays(today, -12);
  const purchaseC = addCalendarDays(today, -220);

  await createProduct(database, userId, {
    name: "Aurora ANC Headphones",
    seller: "SonicWave Electronics",
    purchaseDate: purchaseB,
    priceMinor: 849_900,
    currency: "INR",
    category: "Audio",
    notes: "Return window confirmed on the seller's order confirmation page.",
    source: DEMO_SOURCE,
    policies: [
      {
        kind: "return",
        durationValue: 15,
        durationUnit: "days",
        // Return window starts at delivery, not purchase — deliberately different.
        startDate: addCalendarDays(purchaseB, 3),
        countingConvention: "calendar",
        inclusiveEnd: true,
        source: "seller_website",
        evidence: "15-day replacement window from the date of delivery.",
        verificationStatus: "verified",
      },
      {
        kind: "warranty",
        durationValue: 24,
        durationUnit: "months",
        startDate: purchaseB,
        countingConvention: "calendar",
        inclusiveEnd: true,
        source: "manufacturer",
        evidence: "2-year manufacturer warranty covering manufacturing defects.",
        verificationStatus: "verified",
      },
    ],
  });

  await createProduct(database, userId, {
    name: "Kettle & Co. 1.7L Electric Kettle",
    seller: "HomeHarbor",
    purchaseDate: purchaseA,
    priceMinor: 249_900,
    currency: "INR",
    category: "Kitchen",
    notes: "Warranty duration read off the box, but the invoice only mentions it vaguely.",
    source: DEMO_SOURCE,
    policies: [
      {
        kind: "return",
        durationValue: 7,
        durationUnit: "days",
        startDate: purchaseA,
        countingConvention: "calendar",
        inclusiveEnd: true,
        source: "invoice",
        evidence: "Goods once sold can be returned within 7 days.",
        verificationStatus: "verified",
      },
      {
        kind: "warranty",
        durationValue: 12,
        durationUnit: "months",
        startDate: purchaseA,
        countingConvention: "calendar",
        inclusiveEnd: true,
        source: "unknown",
        // No evidence → cannot be shown as confirmed.
        evidence: null,
        verificationStatus: "needs_review",
        notes: "Duration claimed by the extractor; no supporting line on the invoice.",
      },
    ],
  });

  await createProduct(database, userId, {
    name: "Volt 65W USB-C Charger",
    seller: "Metro Digital Store",
    purchaseDate: purchaseC,
    priceMinor: 179_900,
    currency: "INR",
    category: "Accessories",
    notes: "Older purchase — both windows have closed, kept for the archive view.",
    source: DEMO_SOURCE,
    policies: [
      {
        kind: "warranty",
        durationValue: 6,
        durationUnit: "months",
        startDate: purchaseC,
        countingConvention: "calendar",
        inclusiveEnd: true,
        source: "invoice",
        evidence: "6 months warranty against manufacturing defects.",
        verificationStatus: "verified",
      },
    ],
  });

  const created = await listProducts(database, userId, { includePolicies: true });
  const byName = (needle: string) => created.find((p) => p.name.includes(needle));

  const headphones = byName("Aurora");
  const returnPolicy = headphones?.policies.find((p) => p.kind === "return");
  if (headphones && returnPolicy?.deadlineDate) {
    await createReminder(database, userId, {
      productId: headphones.id,
      policyId: returnPolicy.id,
      kind: "return_deadline",
      label: `Return window closes: ${headphones.name}`,
      remindOn: addCalendarDays(returnPolicy.deadlineDate, -2),
      leadDays: 2,
    });
  }

  const kettle = byName("Kettle");
  const kettleWarranty = kettle?.policies.find((p) => p.kind === "warranty");
  if (kettle && kettleWarranty?.deadlineDate) {
    await createReminder(database, userId, {
      productId: kettle.id,
      policyId: kettleWarranty.id,
      kind: "warranty_expiry",
      label: `Warranty needs review: ${kettle.name}`,
      remindOn: today,
      leadDays: 0,
    });
  }

  return { created: 3 };
}

/** Removes only demo-tagged products (cascades to their policies/reminders). */
export async function clearDemoData(database: Database, userId: string): Promise<number> {
  const removed = await database
    .delete(products)
    .where(and(eq(products.userId, userId), eq(products.source, DEMO_SOURCE)))
    .returning({ id: products.id });
  return removed.length;
}
