import { describe, expect, it } from "vitest";
import { checkConsistency, extractionSchema, requiredGaps, type ExtractionModel } from "@/lib/ai/schema";

const base = (): ExtractionModel => ({
  productName: { value: "Widget", provenance: "invoice", confidence: "high", evidence: "Product: Widget" },
  seller: { value: "Shop", provenance: "invoice", confidence: "high", evidence: null },
  purchaseDate: { value: "2026-10-11", provenance: "invoice", confidence: "high", evidence: null },
  price: { value: 12_345, provenance: "invoice", confidence: "medium", evidence: null },
  currency: { value: "INR", provenance: "invoice", confidence: "medium", evidence: null },
  returnPolicy: {
    durationValue: 10,
    durationUnit: "days",
    startBasis: "unknown",
    evidence: "10 days",
    provenance: "invoice",
    confidence: "medium",
  },
  warranty: {
    durationValue: null,
    durationUnit: null,
    startBasis: "unknown",
    evidence: null,
    provenance: "missing",
    confidence: "low",
  },
  missingFields: ["warranty"],
  uncertaintyNotes: ["The return window does not say what it starts from."],
});

describe("extractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    expect(extractionSchema.safeParse(base()).success).toBe(true);
  });

  it("rejects a policy with half a duration", () => {
    const broken = { ...base(), returnPolicy: { ...base().returnPolicy, durationUnit: null } };
    expect(extractionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    const broken = {
      ...base(),
      purchaseDate: { value: "2026-02-30", provenance: "invoice", confidence: "high" },
    };
    expect(extractionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a non-ISO date string", () => {
    const broken = { ...base(), purchaseDate: { value: "11/10/2026", provenance: "invoice", confidence: "high" } };
    expect(extractionSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a currency that isn't an ISO code", () => {
    expect(extractionSchema.safeParse({ ...base(), currency: { value: "rupees", provenance: "invoice", confidence: "high" } }).success).toBe(false);
  });

  it("rejects negative money and fractional minor units", () => {
    expect(extractionSchema.safeParse({ ...base(), price: { value: -5, provenance: "invoice", confidence: "low" } }).success).toBe(false);
    expect(extractionSchema.safeParse({ ...base(), price: { value: 12.5, provenance: "invoice", confidence: "low" } }).success).toBe(false);
  });

  it("rejects an unknown provenance value", () => {
    const broken = { ...base(), seller: { value: "Shop", provenance: "guess", confidence: "high" } };
    expect(extractionSchema.safeParse(broken).success).toBe(false);
  });

  it("caps uncertainty notes", () => {
    const broken = { ...base(), uncertaintyNotes: Array.from({ length: 11 }, (_, i) => `note ${i}`) };
    expect(extractionSchema.safeParse(broken).success).toBe(false);
  });
});

describe("checkConsistency", () => {
  it("passes when values and missingFields agree", () => {
    expect(checkConsistency(base())).toEqual([]);
  });

  it("catches a value that is also claimed missing", () => {
    const model = { ...base(), missingFields: ["warranty", "seller"] as ExtractionModel["missingFields"] };
    expect(checkConsistency(model)).toContain("seller has a value but is listed as missing");
  });

  it("catches an empty field that isn't listed as missing", () => {
    const model = { ...base(), missingFields: [] as ExtractionModel["missingFields"] };
    expect(checkConsistency(model)).toContain("warranty is empty but not listed as missing");
  });
});

describe("requiredGaps", () => {
  it("lists only what is genuinely absent", () => {
    expect(requiredGaps(base())).toEqual(["warranty"]);
  });

  it("is empty for a complete extraction", () => {
    const complete: ExtractionModel = {
      ...base(),
      warranty: { ...base().warranty, durationValue: 24, durationUnit: "months", provenance: "invoice" },
      missingFields: [],
    };
    expect(requiredGaps(complete)).toEqual([]);
  });
});
