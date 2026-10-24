import { z } from "zod";
import { isValidIsoDate } from "@/lib/policy/deadline";

const isoDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidIsoDate(value), { message: "Use a valid date (YYYY-MM-DD)" });

export const policySchema = z
  .object({
    kind: z.enum(["return", "warranty"]),
    durationValue: z.coerce.number().int().min(1, "Must be at least 1").max(600, "That looks too long"),
    durationUnit: z.enum(["days", "months"]),
    startDate: z.string().trim().refine(isValidIsoDate, { message: "Pick the date the window starts" }),
    countingConvention: z.enum(["calendar", "business"]).default("calendar"),
    inclusiveEnd: z.boolean().default(true),
    source: z.enum(["invoice", "seller_website", "manufacturer", "user_statement", "unknown"]).default("unknown"),
    evidence: z.string().trim().max(400).nullable().optional(),
    /** True only when the user explicitly confirms they checked it. */
    confirmed: z.boolean().default(false),
    notes: z.string().trim().max(400).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.countingConvention === "business" && value.durationUnit === "months") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["countingConvention"],
        message: "Business-day counting only works for a number of days, not months.",
      });
    }
  });

export type PolicyFormInput = z.infer<typeof policySchema>;

export const productCreateSchema = z.object({
  name: z.string().trim().min(2, "Give the product a name").max(120, "Keep it under 120 characters"),
  seller: z.string().trim().max(120).optional().or(z.literal("")),
  purchaseDate: isoDate.optional(),
  price: z
    .string()
    .trim()
    .regex(/^\d{0,9}(\.\d{1,2})?$/, "Enter an amount like 8499 or 8499.50")
    .optional()
    .or(z.literal("")),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").default("INR"),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  returnPolicy: policySchema.nullable().optional(),
  warrantyPolicy: policySchema.nullable().optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/** Corrections to a product that already exists. Policies are saved separately. */
export const productPatchSchema = z.object({
  name: z.string().trim().min(2, "Give the product a name").max(120, "Keep it under 120 characters"),
  seller: z.string().trim().max(120).optional().or(z.literal("")),
  purchaseDate: isoDate.optional(),
  price: z
    .string()
    .trim()
    .regex(/^\d{0,9}(\.\d{1,2})?$/, "Enter an amount like 8499 or 8499.50")
    .optional()
    .or(z.literal("")),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").default("INR"),
});

export type ProductPatchInput = z.infer<typeof productPatchSchema>;

/** Converts a human price ("8499.50") into integer minor units. */
export function toMinorUnits(price: string | undefined): number | null {
  if (!price) return null;
  const [whole = "0", frac = ""] = price.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  return Number.isFinite(minor) ? minor : null;
}
