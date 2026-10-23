import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Data model — ReturnRakshak
 *
 * Deliberately absent: invoice files, OCR text, prompts, model responses.
 * The database only ever holds what the user reviewed and confirmed, plus the
 * minimum policy evidence needed to justify a deadline.
 *
 * Every table is scoped by `user_id` from day one so multi-user auth can be
 * switched on later without a data migration of the ownership column.
 */

const now = sql`(strftime('%s','now') * 1000)`;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    seller: text("seller"),
    /** Calendar date `YYYY-MM-DD` — not an instant, so no timezone drift. */
    purchaseDate: text("purchase_date"),
    /** Integer minor units (paise/cents). Floats are not money. */
    priceMinor: integer("price_minor"),
    /** ISO-4217, e.g. "INR". */
    currency: text("currency", { length: 3 }),
    category: text("category"),
    notes: text("notes"),
    /** Whether the record originated from a reviewed extraction or manual entry. */
    source: text("source", { enum: ["invoice_ai", "invoice_manual", "manual_entry", "demo"] })
      .notNull()
      .default("manual_entry"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("products_user_purchase_idx").on(t.userId, t.purchaseDate),
    index("products_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const policies = sqliteTable(
  "policies",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Denormalised owner key: lets us authorise without joining products. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["return", "warranty"] }).notNull(),

    durationValue: integer("duration_value").notNull(),
    durationUnit: text("duration_unit", { enum: ["days", "months"] }).notNull().default("days"),

    /** When the clock starts — not necessarily the purchase date. */
    startDate: text("start_date").notNull(),
    /** How the end of the window is counted. */
    countingConvention: text("counting_convention", { enum: ["calendar", "business"] })
      .notNull()
      .default("calendar"),
    /** true = the deadline day itself is still inside the window. */
    inclusiveEnd: integer("inclusive_end", { mode: "boolean" }).notNull().default(true),

    /** Cached deterministic result; NULL when the policy can't be computed yet. */
    deadlineDate: text("deadline_date"),

    source: text("source", {
      enum: ["invoice", "seller_website", "manufacturer", "user_statement", "unknown"],
    })
      .notNull()
      .default("unknown"),
    /** Short verbatim evidence the user confirmed — never a whole document. */
    evidence: text("evidence"),

    verificationStatus: text("verification_status", { enum: ["verified", "needs_review"] })
      .notNull()
      .default("needs_review"),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),

    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("policies_product_idx").on(t.productId),
    index("policies_user_deadline_idx").on(t.userId, t.deadlineDate),
    index("policies_user_status_idx").on(t.userId, t.verificationStatus),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    policyId: text("policy_id").references(() => policies.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["return_deadline", "warranty_expiry", "custom"] }).notNull(),
    label: text("label").notNull(),
    /** Calendar date the user should be nudged. */
    remindOn: text("remind_on").notNull(),
    /** Offset from the deadline, in days, for regeneration after edits. */
    leadDays: integer("lead_days").notNull().default(0),
    status: text("status", { enum: ["pending", "dismissed", "sent"] }).notNull().default("pending"),
    dismissedAt: integer("dismissed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("reminders_user_status_idx").on(t.userId, t.status, t.remindOn),
    index("reminders_product_idx").on(t.productId),
    index("reminders_policy_idx").on(t.policyId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  policies: many(policies),
  reminders: many(reminders),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  user: one(users, { fields: [products.userId], references: [users.id] }),
  policies: many(policies),
  reminders: many(reminders),
}));

export const policiesRelations = relations(policies, ({ one, many }) => ({
  product: one(products, { fields: [policies.productId], references: [products.id] }),
  user: one(users, { fields: [policies.userId], references: [users.id] }),
  reminders: many(reminders),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  product: one(products, { fields: [reminders.productId], references: [products.id] }),
  policy: one(policies, { fields: [reminders.policyId], references: [policies.id] }),
  user: one(users, { fields: [reminders.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
