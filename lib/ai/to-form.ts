import { addCalendarDays } from "@/lib/policy/deadline";
import type { ExtractionModel, PolicyClaim } from "./schema";

/**
 * Converts an extraction proposal into review-screen defaults.
 *
 * This is where "the model proposes, the user decides" becomes concrete:
 *  - every value is copied, never completed;
 *  - a policy's *start date* is only pre-filled when the invoice says where the
 *    clock starts. "Within 15 days of delivery" leaves the date blank for the
 *    user, because the app cannot know the delivery date.
 */
export interface ReviewDefaults {
  name: string;
  seller: string;
  purchaseDate: string;
  price: string;
  currency: string;
  returnDurationValue: string;
  returnDurationUnit: "days" | "months";
  returnStartDate: string;
  returnStartBasis: PolicyClaim["startBasis"];
  returnEvidence: string;
  hasReturn: boolean;
  warrantyDurationValue: string;
  warrantyDurationUnit: "days" | "months";
  warrantyStartDate: string;
  warrantyStartBasis: PolicyClaim["startBasis"];
  warrantyEvidence: string;
  hasWarranty: boolean;
}

function priceToInput(priceMinor: number | null): string {
  if (priceMinor === null) return "";
  return (priceMinor / 100).toFixed(2).replace(/\.00$/, "");
}

/** Start date is only suggested when the basis is unambiguous. */
export function suggestedStart(
  basis: PolicyClaim["startBasis"],
  purchaseDate: string | null,
  deliveryDate: string | null,
): string {
  if (basis === "purchase_date" && purchaseDate) return purchaseDate;
  if (basis === "delivery_date" && deliveryDate) return deliveryDate;
  return "";
}

export function toReviewDefaults(model: ExtractionModel, deliveryDate: string | null = null): ReviewDefaults {
  const purchaseDate = model.purchaseDate.value ?? "";
  const hasReturn = model.returnPolicy.durationValue !== null;
  const hasWarranty = model.warranty.durationValue !== null;

  return {
    name: model.productName.value ?? "",
    seller: model.seller.value ?? "",
    purchaseDate,
    price: priceToInput(model.price.value),
    currency: model.currency.value ?? "INR",

    hasReturn,
    returnDurationValue: hasReturn ? String(model.returnPolicy.durationValue) : "7",
    returnDurationUnit: model.returnPolicy.durationUnit ?? "days",
    returnStartDate: hasReturn ? suggestedStart(model.returnPolicy.startBasis, purchaseDate, deliveryDate) : "",
    returnStartBasis: model.returnPolicy.startBasis,
    returnEvidence: model.returnPolicy.evidence ?? "",

    hasWarranty,
    warrantyDurationValue: hasWarranty ? String(model.warranty.durationValue) : "12",
    warrantyDurationUnit: model.warranty.durationUnit ?? "months",
    warrantyStartDate: hasWarranty ? suggestedStart(model.warranty.startBasis, purchaseDate, deliveryDate) : "",
    warrantyStartBasis: model.warranty.startBasis,
    warrantyEvidence: model.warranty.evidence ?? "",
  };
}

/** How confident the proposal is, per field, for the review badges. */
export function confidenceFor(model: ExtractionModel, key: keyof ExtractionModel): string {
  const entry = model[key];
  if (entry && typeof entry === "object" && "confidence" in entry) return String(entry.confidence);
  return "low";
}

export function sevenDaysAfter(isoDate: string): string {
  return isoDate ? addCalendarDays(isoDate, 7) : "";
}
