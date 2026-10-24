import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { log } from "@/lib/logger";
import { computeDeadline, isValidIsoDate, todayIso } from "@/lib/policy/deadline";
import { reminderSchedule } from "@/lib/policy/reminders";
import { newId } from "./ids";
import type { Database } from "./client";
import { policies, products, reminders, users, type Policy, type Product, type Reminder } from "./schema";

/**
 * Repository layer — the only place that talks SQL.
 *
 * Every function takes a userId. Today that id comes from `getLocalOwner()`;
 * when real auth lands it comes from the session. Authorisation is therefore
 * already enforced at the data boundary rather than bolted on afterwards.
 */

export type ProductWithPolicies = Product & { policies: Policy[] };
export type PolicyInput = {
  kind: "return" | "warranty";
  durationValue: number;
  durationUnit: "days" | "months";
  startDate: string;
  countingConvention: "calendar" | "business";
  inclusiveEnd: boolean;
  source: Policy["source"];
  evidence: string | null;
  verificationStatus: "verified" | "needs_review";
  notes?: string | null;
};

export type ProductInput = {
  name: string;
  seller?: string | null;
  purchaseDate?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  category?: string | null;
  notes?: string | null;
  source?: Product["source"];
  policies?: PolicyInput[];
};

// ── Owner ────────────────────────────────────────────────────────────────────

/**
 * Single-user bootstrap. There is exactly one local owner today; the shape of
 * this call is what a `getSessionUser()` will replace later.
 */
export async function getLocalOwner(database: Database, email: string): Promise<string> {
  const existing = await database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return existing[0].id;

  const id = newId("usr");
  await database
    .insert(users)
    .values({ id, email, displayName: "Local owner" })
    .onConflictDoNothing();
  const created = await database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return created[0]?.id ?? id;
}

// ── Products ─────────────────────────────────────────────────────────────────

export async function listProducts(
  database: Database,
  userId: string,
  opts: { includePolicies?: boolean } = {},
): Promise<ProductWithPolicies[]> {
  const rows = await database
    .select()
    .from(products)
    .where(eq(products.userId, userId))
    .orderBy(desc(products.createdAt));

  if (rows.length === 0) return [];
  if (!opts.includePolicies) return rows.map((p) => ({ ...p, policies: [] }));

  const pols = await database
    .select()
    .from(policies)
    .where(
      inArray(
        policies.productId,
        rows.map((r) => r.id),
      ),
    );

  return rows.map((p) => ({ ...p, policies: pols.filter((pol) => pol.productId === p.id) }));
}

export async function getProduct(
  database: Database,
  userId: string,
  productId: string,
): Promise<ProductWithPolicies | null> {
  const rows = await database
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);
  const product = rows[0];
  if (!product) return null;

  const pols = await database.select().from(policies).where(eq(policies.productId, product.id));
  return { ...product, policies: pols };
}

export async function createProduct(
  database: Database,
  userId: string,
  input: ProductInput,
): Promise<ProductWithPolicies> {
  const id = newId("prd");
  const now = new Date();

  await database.insert(products).values({
    id,
    userId,
    name: input.name,
    seller: input.seller ?? null,
    purchaseDate: input.purchaseDate ?? null,
    priceMinor: input.priceMinor ?? null,
    currency: input.currency ?? null,
    category: input.category ?? null,
    notes: input.notes ?? null,
    source: input.source ?? "manual_entry",
    createdAt: now,
    updatedAt: now,
  });

  const createdPolicies: Policy[] = [];
  for (const pol of input.policies ?? []) {
    createdPolicies.push(await insertPolicy(database, userId, id, pol));
  }

  const product = await getProduct(database, userId, id);
  if (!product) throw new Error("Failed to read back created product");
  log.info("product.created", { productId: id, policyCount: createdPolicies.length });
  return product;
}

export async function updateProduct(
  database: Database,
  userId: string,
  productId: string,
  patch: Partial<ProductInput>,
): Promise<ProductWithPolicies | null> {
  const owned = await database
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);
  if (!owned[0]) return null;

  await database
    .update(products)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.seller !== undefined ? { seller: patch.seller } : {}),
      ...(patch.purchaseDate !== undefined ? { purchaseDate: patch.purchaseDate } : {}),
      ...(patch.priceMinor !== undefined ? { priceMinor: patch.priceMinor } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.userId, userId)));

  return getProduct(database, userId, productId);
}

/** Cascade deletes policies + reminders via FK ON DELETE CASCADE. */
export async function deleteProduct(database: Database, userId: string, productId: string): Promise<boolean> {
  const result = await database
    .delete(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .returning({ id: products.id });
  const deleted = result.length > 0;
  if (deleted) log.info("product.deleted", { productId });
  return deleted;
}

// ── Policies ─────────────────────────────────────────────────────────────────

function deadlineFor(input: PolicyInput): string | null {
  const result = computeDeadline({
    startDate: input.startDate,
    durationValue: input.durationValue,
    durationUnit: input.durationUnit,
    countingConvention: input.countingConvention,
    inclusiveEnd: input.inclusiveEnd,
  });
  return result.ok ? result.deadlineDate : null;
}

export async function insertPolicy(
  database: Database,
  userId: string,
  productId: string,
  input: PolicyInput,
): Promise<Policy> {
  const id = newId("pol");
  const now = new Date();
  await database.insert(policies).values({
    id,
    userId,
    productId,
    kind: input.kind,
    durationValue: input.durationValue,
    durationUnit: input.durationUnit,
    startDate: input.startDate,
    countingConvention: input.countingConvention,
    inclusiveEnd: input.inclusiveEnd,
    deadlineDate: deadlineFor(input),
    source: input.source,
    evidence: input.evidence,
    verificationStatus: input.verificationStatus,
    verifiedAt: input.verificationStatus === "verified" ? now : null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const rows = await database.select().from(policies).where(eq(policies.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("Failed to read back created policy");
  await syncPolicyReminder(database, userId, row);
  return row;
}

export async function updatePolicy(
  database: Database,
  userId: string,
  policyId: string,
  patch: Partial<PolicyInput>,
): Promise<Policy | null> {
  const rows = await database
    .select()
    .from(policies)
    .where(and(eq(policies.id, policyId), eq(policies.userId, userId)))
    .limit(1);
  const current = rows[0];
  if (!current) return null;

  const merged: PolicyInput = {
    kind: patch.kind ?? current.kind,
    durationValue: patch.durationValue ?? current.durationValue,
    durationUnit: patch.durationUnit ?? current.durationUnit,
    startDate: patch.startDate ?? current.startDate,
    countingConvention: patch.countingConvention ?? current.countingConvention,
    inclusiveEnd: patch.inclusiveEnd ?? current.inclusiveEnd,
    source: patch.source ?? current.source,
    evidence: patch.evidence !== undefined ? patch.evidence : current.evidence,
    verificationStatus: patch.verificationStatus ?? current.verificationStatus,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
  };

  await database
    .update(policies)
    .set({
      ...merged,
      deadlineDate: deadlineFor(merged),
      verifiedAt: merged.verificationStatus === "verified" ? (current.verifiedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(policies.id, policyId), eq(policies.userId, userId)));

  const updated = await database.select().from(policies).where(eq(policies.id, policyId)).limit(1);
  const row = updated[0] ?? null;
  if (row) await syncPolicyReminder(database, userId, row);
  return row;
}

/**
 * A confirmed deadline owns one pending reminder. Editing the policy replaces
 * that reminder so the date stays in step. Dropping confirmation removes it.
 * Dismissed reminders are left alone — they are history, not a schedule.
 */
async function syncPolicyReminder(database: Database, userId: string, policy: Policy): Promise<void> {
  await database
    .delete(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.policyId, policy.id), eq(reminders.status, "pending")));

  if (policy.verificationStatus !== "verified" || !policy.deadlineDate || !isValidIsoDate(policy.deadlineDate)) return;

  const productRows = await database
    .select({ name: products.name })
    .from(products)
    .where(and(eq(products.id, policy.productId), eq(products.userId, userId)))
    .limit(1);
  const name = productRows[0]?.name ?? "Product";
  const schedule = reminderSchedule(policy.kind, name, policy.deadlineDate);
  await createReminder(database, userId, {
    productId: policy.productId,
    policyId: policy.id,
    kind: schedule.kind,
    label: schedule.label,
    remindOn: schedule.remindOn,
    leadDays: schedule.leadDays,
  });
}

export async function deletePolicy(database: Database, userId: string, policyId: string): Promise<boolean> {
  const result = await database
    .delete(policies)
    .where(and(eq(policies.id, policyId), eq(policies.userId, userId)))
    .returning({ id: policies.id });
  return result.length > 0;
}

// ── Dashboard queries ────────────────────────────────────────────────────────

export type UpcomingDeadline = {
  policy: Policy;
  product: Product;
  daysRemaining: number;
};

export async function upcomingDeadlines(
  database: Database,
  userId: string,
  kind: "return" | "warranty",
  opts: { withinDays?: number; today?: string; includeUnverified?: boolean } = {},
): Promise<UpcomingDeadline[]> {
  const today = opts.today ?? todayIso();
  const within = opts.withinDays ?? 365;
  const offset = `+${within} days`;

  const rows = await database
    .select({ policy: policies, product: products })
    .from(policies)
    .innerJoin(products, eq(policies.productId, products.id))
    .where(
      and(
        eq(policies.userId, userId),
        eq(policies.kind, kind),
        sql`${policies.deadlineDate} IS NOT NULL`,
        // Parameters are bound, never interpolated into the SQL string.
        sql`${policies.deadlineDate} >= date(${today})`,
        sql`${policies.deadlineDate} <= date(${today}, ${offset})`,
        opts.includeUnverified ? sql`1=1` : eq(policies.verificationStatus, "verified"),
      ),
    )
    .orderBy(asc(policies.deadlineDate));

  return rows.map(({ policy, product }) => ({
    policy,
    product,
    daysRemaining: Math.round(
      (Date.parse(`${policy.deadlineDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    ),
  }));
}

export async function expiringWarranties(
  database: Database,
  userId: string,
  opts: { withinDays?: number; today?: string } = {},
): Promise<UpcomingDeadline[]> {
  return upcomingDeadlines(database, userId, "warranty", opts);
}

export async function needsReviewPolicies(database: Database, userId: string): Promise<ProductWithPolicies[]> {
  const all = await listProducts(database, userId, { includePolicies: true });
  return all.filter((p) => p.policies.some((pol) => pol.verificationStatus === "needs_review"));
}

// ── Reminders ────────────────────────────────────────────────────────────────

export async function listReminders(
  database: Database,
  userId: string,
  opts: { status?: Reminder["status"]; upcomingOnly?: boolean; today?: string } = {},
): Promise<Reminder[]> {
  const today = opts.today ?? todayIso();
  const conditions = [eq(reminders.userId, userId)];
  if (opts.status) conditions.push(eq(reminders.status, opts.status));
  if (opts.upcomingOnly) {
    conditions.push(sql`${reminders.remindOn} >= date(${today})`);
    conditions.push(isNull(reminders.dismissedAt));
  }
  return database
    .select()
    .from(reminders)
    .where(and(...conditions))
    .orderBy(asc(reminders.remindOn));
}

export async function createReminder(
  database: Database,
  userId: string,
  input: { productId: string; policyId?: string | null; kind: Reminder["kind"]; label: string; remindOn: string; leadDays?: number },
): Promise<Reminder> {
  const id = newId("rem");
  await database.insert(reminders).values({
    id,
    userId,
    productId: input.productId,
    policyId: input.policyId ?? null,
    kind: input.kind,
    label: input.label,
    remindOn: input.remindOn,
    leadDays: input.leadDays ?? 0,
    status: "pending",
  });
  const rows = await database.select().from(reminders).where(eq(reminders.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("Failed to read back created reminder");
  return row;
}

export async function dismissReminder(database: Database, userId: string, reminderId: string): Promise<boolean> {
  const result = await database
    .update(reminders)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)))
    .returning({ id: reminders.id });
  return result.length > 0;
}

// ── Counts for the dashboard ─────────────────────────────────────────────────

export async function dashboardStats(database: Database, userId: string, today = todayIso()) {
  const [productRows, policyRows, reminderRows] = await Promise.all([
    database.select({ id: products.id }).from(products).where(eq(products.userId, userId)),
    database.select({ status: policies.verificationStatus, kind: policies.kind, deadlineDate: policies.deadlineDate })
      .from(policies)
      .where(eq(policies.userId, userId)),
    database
      .select({ id: reminders.id })
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, "pending"), sql`${reminders.remindOn} >= date(${today})`)),
  ]);

  const verifiedPolicies = policyRows.filter((p) => p.status === "verified").length;
  return {
    products: productRows.length,
    policies: policyRows.length,
    verifiedPolicies,
    needsReview: policyRows.length - verifiedPolicies,
    pendingReminders: reminderRows.length,
  };
}
