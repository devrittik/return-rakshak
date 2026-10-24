import { describe, expect, it } from "vitest";
import { MockAiProvider, extractWithRules } from "@/lib/ai/mock";
import { checkConsistency, FIELD_KEYS } from "@/lib/ai/schema";

const FULL_INVOICE = `
TAX INVOICE
Seller: SonicWave Electronics
Buyer: Sample Buyer
Product: Aurora ANC Headphones
Purchase date: 2026-10-11
Invoice no: SW-000123
Total: INR 8499.00
Return accepted within 15 days of delivery.
Warranty: 24 months manufacturer warranty.
`;

describe("rule-based extraction", () => {
  it("reads the labelled fields from a complete invoice", () => {
    const model = extractWithRules(FULL_INVOICE);

    expect(model.productName.value).toBe("Aurora ANC Headphones");
    expect(model.seller.value).toBe("SonicWave Electronics");
    expect(model.purchaseDate.value).toBe("2026-10-11");
    expect(model.price.value).toBe(849_900);
    expect(model.currency.value).toBe("INR");
    expect(model.returnPolicy.durationValue).toBe(15);
    expect(model.returnPolicy.durationUnit).toBe("days");
    expect(model.warranty.durationValue).toBe(24);
    expect(model.warranty.durationUnit).toBe("months");
    expect(model.missingFields).toEqual([]);
  });

  it("knows a delivery-based return window does not start at purchase", () => {
    const model = extractWithRules(FULL_INVOICE);
    expect(model.returnPolicy.startBasis).toBe("delivery_date");
  });

  it("records a purchase-date basis when the text says so", () => {
    const model = extractWithRules("Warranty: 12 months from the date of purchase. Product: Blender Pro");
    expect(model.warranty.startBasis).toBe("purchase_date");
  });

  it("leaves the basis unknown when the text is silent", () => {
    const model = extractWithRules("Product: Widget. Warranty: 6 months. Total: INR 100");
    expect(model.warranty.startBasis).toBe("unknown");
  });

  it("never invents a product name that isn't there", () => {
    const model = extractWithRules("Seller: Some Shop. Total: INR 250.00");
    expect(model.productName.value).toBeNull();
    expect(model.productName.provenance).toBe("missing");
    expect(model.missingFields).toContain("productName");
  });

  it("never invents a purchase date from an unlabelled invoice with no dates", () => {
    const model = extractWithRules("Seller: Some Shop. Product: Kettle. Total: USD 39.99");
    expect(model.purchaseDate.value).toBeNull();
    expect(model.missingFields).toContain("purchaseDate");
  });

  it("uses the only date in the document when no label is present", () => {
    const model = extractWithRules("Invoice 25/12/2026 for a Desk Lamp, total Rs. 1,299.00");
    expect(model.purchaseDate.value).toBe("2026-12-25");
    expect(model.purchaseDate.confidence).toBe("high");
  });

  it("flags an ambiguous numeric date instead of guessing silently", () => {
    const model = extractWithRules("Purchase date: 03/04/2026. Product: Mixer");
    expect(model.purchaseDate.value).toBe("2026-04-03");
    expect(model.purchaseDate.confidence).toBe("medium");
    expect(model.uncertaintyNotes.join(" ")).toMatch(/ambiguous/i);
  });

  it("parses month-name dates", () => {
    expect(extractWithRules("Purchase date: 12 March 2026. Product: Fan").purchaseDate.value).toBe("2026-03-12");
    expect(extractWithRules("Purchase date: 1 Sept 26. Product: Fan").purchaseDate.value).toBe("2026-09-01");
  });

  it("converts years to months and handles symbols", () => {
    const model = extractWithRules("Product: Router. Total: $129.99. Warranty: 2 years.");
    expect(model.warranty.durationValue).toBe(24);
    expect(model.warranty.durationUnit).toBe("months");
    expect(model.currency.value).toBe("USD");
    expect(model.price.value).toBe(12_999);
  });

  it("rejects impossible dates rather than coercing them", () => {
    const model = extractWithRules("Purchase date: 31/02/2026. Product: Ghost Item");
    expect(model.purchaseDate.value).toBeNull();
  });

  it("keeps missingFields exactly in sync with the values", () => {
    for (const text of [FULL_INVOICE, "Seller: A. Product: B", "Total: INR 10", "nothing useful here at all"]) {
      const model = extractWithRules(text);
      expect(checkConsistency(model)).toEqual([]);
      const expectedMissing = FIELD_KEYS.filter((key) => {
        if (key === "returnPolicy" || key === "warranty") return model[key].durationValue === null;
        return model[key].value === null;
      });
      expect([...model.missingFields].sort()).toEqual([...expectedMissing].sort());
    }
  });

  it("is deterministic", () => {
    const first = extractWithRules(FULL_INVOICE);
    const second = extractWithRules(FULL_INVOICE);
    expect(second).toEqual(first);
  });
});

describe("MockAiProvider", () => {
  it("returns a validated result with provenance metadata", async () => {
    const result = await new MockAiProvider().extractFields({ text: FULL_INVOICE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.provider).toBe("mock");
    expect(result.meta.model).toBe("rule-based-v1");
    expect(result.data.productName.value).toBe("Aurora ANC Headphones");
  });

  it("refuses text too short to be an invoice", async () => {
    const result = await new MockAiProvider().extractFields({ text: "hi" });
    expect(result).toMatchObject({ ok: false, code: "invalid_output" });
  });

  it("never marks an extracted policy as verified — that is the user's call", async () => {
    const result = await new MockAiProvider().extractFields({ text: FULL_INVOICE });
    if (!result.ok) throw new Error("expected success");
    expect(result.data.returnPolicy.provenance).toBe("invoice");
    expect(result.data.returnPolicy.confidence).not.toBe("high");
  });
});
