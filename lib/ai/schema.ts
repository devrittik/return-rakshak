import { z } from "zod";
import { isValidIsoDate } from "@/lib/policy/deadline";

/**
 * The contract between the model and the application.
 *
 * Two rules encoded here:
 *  1. Every field says where it came from (`provenance`) and how sure the model
 *     is (`confidence`). Nothing is silently filled in.
 *  2. A missing field is `value: null` + `provenance: "missing"` — never a
 *     plausible guess. The review screen surfaces these as blanks to fill.
 */

export const FIELD_KEYS = [
  "productName",
  "seller",
  "purchaseDate",
  "price",
  "currency",
  "returnPolicy",
  "warranty",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const provenanceSchema = z.enum(["invoice", "inferred", "missing"]);
export type Provenance = z.infer<typeof provenanceSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, "Dates must be YYYY-MM-DD")
  .refine(isValidIsoDate, "Not a real calendar date");

/** Wraps any nullable value with provenance + confidence. */
function withMeta<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value: value.nullable(),
    provenance: provenanceSchema.default("missing"),
    confidence: confidenceSchema.default("low"),
    /** Short verbatim snippet supporting the value, when the model cites one. */
    evidence: z.string().max(300).nullish(),
  });
}

export const policyClaimSchema = z
  .object({
    durationValue: z.number().int().min(1).max(600).nullable(),
    durationUnit: z.enum(["days", "months"]).nullable(),
    /**
     * What the text says the clock runs from. `unknown` is a first-class answer:
     * "within 15 days of delivery" cannot start on the purchase date.
     */
    startBasis: z.enum(["purchase_date", "delivery_date", "unknown"]).default("unknown"),
    evidence: z.string().max(300).nullish(),
    provenance: provenanceSchema.default("missing"),
    confidence: confidenceSchema.default("low"),
  })
  .refine(
    (claim) =>
      (claim.durationValue === null && claim.durationUnit === null) ||
      (claim.durationValue !== null && claim.durationUnit !== null),
    { message: "Duration needs both a value and a unit, or neither" },
  );

export const extractionSchema = z.object({
  productName: withMeta(z.string().min(1).max(160)),
  seller: withMeta(z.string().min(1).max(160)),
  purchaseDate: withMeta(isoDateSchema),
  price: withMeta(z.number().int().min(0)),
  currency: withMeta(z.string().regex(/^[A-Z]{3}$/, "ISO-4217 code, e.g. INR")),
  returnPolicy: policyClaimSchema,
  warranty: policyClaimSchema,
  /** Fields the model could not find. Must agree with the null values above. */
  missingFields: z.array(z.enum(FIELD_KEYS)).max(FIELD_KEYS.length).default([]),
  /** Plain-language caveats, e.g. "two dates appear; used the one labelled 'Invoice date'". */
  uncertaintyNotes: z.array(z.string().min(1).max(240)).max(10).default([]),
});

export type ExtractionModel = z.infer<typeof extractionSchema>;
export type PolicyClaim = z.infer<typeof policyClaimSchema>;

/**
 * Cross-field consistency: a model that claims a field is present while
 * returning null (or vice versa) is not trustworthy, so the whole response is
 * rejected rather than half-used.
 */
export function checkConsistency(model: ExtractionModel): string[] {
  const problems: string[] = [];

  const scalarPairs: [FieldKey, { value: unknown }][] = [
    ["productName", model.productName],
    ["seller", model.seller],
    ["purchaseDate", model.purchaseDate],
    ["price", model.price],
    ["currency", model.currency],
  ];
  const claimPairs: [FieldKey, PolicyClaim][] = [
    ["returnPolicy", model.returnPolicy],
    ["warranty", model.warranty],
  ];

  const checks: [FieldKey, boolean][] = [
    ...scalarPairs.map(([key, field]): [FieldKey, boolean] => [key, field.value !== null]),
    ...claimPairs.map(([key, claim]): [FieldKey, boolean] => [key, isClaimPresent(claim)]),
  ];

  for (const [key, present] of checks) {
    const listedMissing = model.missingFields.includes(key);
    if (present && listedMissing) problems.push(`${key} has a value but is listed as missing`);
    if (!present && !listedMissing) problems.push(`${key} is empty but not listed as missing`);
  }
  return problems;
}

export function isClaimPresent(claim: PolicyClaim): boolean {
  return claim.durationValue !== null && claim.durationUnit !== null;
}

/** The fields a user still has to supply before a product can be saved well. */
export function requiredGaps(model: ExtractionModel): FieldKey[] {
  return FIELD_KEYS.filter((key) => {
    if (key === "returnPolicy" || key === "warranty") return !isClaimPresent(model[key]);
    return model[key].value === null;
  });
}
