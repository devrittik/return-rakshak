import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/data/client";
import * as schema from "@/lib/data/schema";
import {
  createProduct,
  createReminder,
  dashboardStats,
  deleteProduct,
  dismissReminder,
  getProduct,
  getLocalOwner,
  listProducts,
  listReminders,
  updatePolicy,
  upcomingDeadlines,
} from "@/lib/data/repository";
import { loadDemoData, clearDemoData } from "@/lib/data/demo";
import { todayIso } from "@/lib/policy/deadline";

/** Each test file gets its own in-memory libSQL database with real migrations. */
async function freshDb(): Promise<{ database: Database; client: Client; userId: string }> {
  const client = createClient({ url: ":memory:" });
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const userId = await getLocalOwner(database, "test@returnrakshak.invalid");
  return { database, client, userId };
}

let database: Database;
let client: Client;
let userId: string;

beforeEach(async () => {
  ({ database, client, userId } = await freshDb());
});

const returnPolicy = {
  kind: "return" as const,
  durationValue: 10,
  durationUnit: "days" as const,
  startDate: "2026-10-01",
  countingConvention: "calendar" as const,
  inclusiveEnd: true,
  source: "invoice" as const,
  evidence: "Returns accepted within 10 days.",
  verificationStatus: "verified" as const,
};

describe("owner bootstrap", () => {
  it("creates one owner and reuses it", async () => {
    const again = await getLocalOwner(database, "test@returnrakshak.invalid");
    expect(again).toBe(userId);
    const other = await getLocalOwner(database, "second@returnrakshak.invalid");
    expect(other).not.toBe(userId);
  });
});

describe("products", () => {
  it("creates a product with a policy and computes its deadline", async () => {
    const product = await createProduct(database, userId, {
      name: "Test Kettle",
      seller: "Test Seller",
      purchaseDate: "2026-10-01",
      priceMinor: 199_900,
      currency: "INR",
      policies: [returnPolicy],
    });

    expect(product.name).toBe("Test Kettle");
    expect(product.policies).toHaveLength(1);
    expect(product.policies[0]?.deadlineDate).toBe("2026-10-11");
    expect(product.policies[0]?.verificationStatus).toBe("verified");
  });

  it("never stores invoice text or binary columns", async () => {
    const columns = await client.execute("PRAGMA table_info(products)");
    const names = columns.rows.map((row) => String(row.name));
    expect(names).not.toContain("invoice_text");
    expect(names).not.toContain("raw_text");
    expect(names).not.toContain("file_blob");
  });

  it("lists only the owner's products", async () => {
    const otherUser = await getLocalOwner(database, "other@returnrakshak.invalid");
    await createProduct(database, userId, { name: "Mine" });
    await createProduct(database, otherUser, { name: "Not mine" });

    const mine = await listProducts(database, userId);
    expect(mine.map((p) => p.name)).toEqual(["Mine"]);
  });

  it("returns null when reading another user's product", async () => {
    const product = await createProduct(database, userId, { name: "Private" });
    const otherUser = await getLocalOwner(database, "other@returnrakshak.invalid");
    expect(await getProduct(database, otherUser, product.id)).toBeNull();
  });

  it("cascades deletes to policies and reminders", async () => {
    const product = await createProduct(database, userId, { name: "Doomed", policies: [returnPolicy] });
    const policy = product.policies[0]!;
    await createReminder(database, userId, {
      productId: product.id,
      policyId: policy.id,
      kind: "return_deadline",
      label: "Reminder",
      remindOn: "2026-10-09",
    });

    expect(await deleteProduct(database, userId, product.id)).toBe(true);
    expect(await deleteProduct(database, userId, product.id)).toBe(false);

    const policyRows = await client.execute("SELECT id FROM policies");
    const reminderRows = await client.execute("SELECT id FROM reminders");
    expect(policyRows.rows).toHaveLength(0);
    expect(reminderRows.rows).toHaveLength(0);
  });

  it("refuses to delete another user's product", async () => {
    const product = await createProduct(database, userId, { name: "Protected" });
    const otherUser = await getLocalOwner(database, "other@returnrakshak.invalid");
    expect(await deleteProduct(database, otherUser, product.id)).toBe(false);
    expect(await getProduct(database, userId, product.id)).not.toBeNull();
  });
});

describe("policies", () => {
  it("keeps an unverified policy out of the dashboards", async () => {
    const today = todayIso();
    const product = await createProduct(database, userId, {
      name: "Unverified",
      policies: [{ ...returnPolicy, startDate: today, durationValue: 3, verificationStatus: "needs_review" }],
    });
    expect(product.policies[0]?.deadlineDate).not.toBeNull();

    const upcoming = await upcomingDeadlines(database, userId, "return", { today, withinDays: 30 });
    expect(upcoming).toHaveLength(0);

    const includingUnverified = await upcomingDeadlines(database, userId, "return", {
      today,
      withinDays: 30,
      includeUnverified: true,
    });
    expect(includingUnverified).toHaveLength(1);
  });

  it("recomputes the deadline when the policy changes", async () => {
    const product = await createProduct(database, userId, { name: "Mutable", policies: [returnPolicy] });
    const policy = product.policies[0]!;

    const updated = await updatePolicy(database, userId, policy.id, { durationValue: 30 });
    expect(updated?.deadlineDate).toBe("2026-10-31");

    const verified = await updatePolicy(database, userId, policy.id, { verificationStatus: "verified" });
    expect(verified?.verifiedAt).not.toBeNull();
    const unverified = await updatePolicy(database, userId, policy.id, { verificationStatus: "needs_review" });
    expect(unverified?.verifiedAt).toBeNull();
  });

  it("indexes deadlines for dashboard queries", async () => {
    const indexes = await client.execute("PRAGMA index_list(policies)");
    const names = indexes.rows.map((row) => String(row.name));
    expect(names).toContain("policies_user_deadline_idx");
  });
});

describe("reminders", () => {
  it("creates, lists and dismisses a reminder", async () => {
    const product = await createProduct(database, userId, { name: "Remind me" });
    const reminder = await createReminder(database, userId, {
      productId: product.id,
      kind: "custom",
      label: "Check the box",
      remindOn: "2026-12-01",
    });

    expect((await listReminders(database, userId, { status: "pending" })).map((r) => r.id)).toContain(reminder.id);
    expect(await dismissReminder(database, userId, reminder.id)).toBe(true);
    expect(await listReminders(database, userId, { status: "pending" })).toHaveLength(0);
    expect(await listReminders(database, userId, { status: "dismissed" })).toHaveLength(1);
  });

  it("does not let another user dismiss a reminder", async () => {
    const product = await createProduct(database, userId, { name: "Mine" });
    const reminder = await createReminder(database, userId, {
      productId: product.id,
      kind: "custom",
      label: "Private",
      remindOn: "2026-12-01",
    });
    const otherUser = await getLocalOwner(database, "other@returnrakshak.invalid");
    expect(await dismissReminder(database, otherUser, reminder.id)).toBe(false);
  });
});

describe("demo data", () => {
  it("is idempotent and fully removable", async () => {
    const first = await loadDemoData(database, userId);
    expect(first.created).toBe(3);
    const second = await loadDemoData(database, userId);
    expect(second.created).toBe(0);

    expect(await clearDemoData(database, userId)).toBe(3);
    expect(await listProducts(database, userId)).toHaveLength(0);
  });

  it("includes one policy that needs review, so the flag is demonstrable", async () => {
    await loadDemoData(database, userId);
    const stats = await dashboardStats(database, userId);
    expect(stats.needsReview).toBeGreaterThan(0);
    expect(stats.verifiedPolicies).toBeGreaterThan(0);
  });
});
