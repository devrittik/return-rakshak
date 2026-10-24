import { checkConsistency, FIELD_KEYS, type ExtractionModel, type FieldKey, type PolicyClaim } from "./schema";
import type { AiExtractionResult, AiProvider } from "./types";

/**
 * Offline, deterministic extractor.
 *
 * This is deliberately a *rule engine*, not a language model: it finds labelled
 * values with explicit patterns and leaves everything else null. That makes the
 * whole app usable with no model, no network and no API key — and it makes the
 * "never invent a value" rule testable, because the same input always produces
 * the same output.
 *
 * It is not clever. Anything ambiguous is reported as low confidence with a
 * note, so the review screen can ask instead of assuming.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₹": "INR",
  "rs.": "INR",
  rs: "INR",
  inr: "INR",
  $: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (value: number) => String(value).padStart(2, "0");

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${date.getUTCFullYear()}-${pad(month)}-${pad(day)}`;
}

interface DateHit {
  iso: string;
  confidence: "high" | "medium" | "low";
  note?: string;
  index: number;
}

/**
 * Parses a date without guessing silently.
 * - ISO (YYYY-MM-DD) is unambiguous → high.
 * - "12 March 2026" / "12 Mar 26" → high.
 * - 12/03/2026 is genuinely ambiguous → read as DD/MM (the Indian convention),
 *   marked medium, with a note telling the user to check it.
 */
function parseDate(raw: string, index: number): DateHit | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const parsed = toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return parsed ? { iso: parsed, confidence: "high", index } : null;
  }

  const named = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2,4})$/.exec(raw);
  if (named) {
    const month = MONTHS[named[2]!.toLowerCase()];
    if (month) {
      let year = Number(named[3]);
      if (year < 100) year += year > 70 ? 1900 : 2000;
      const parsed = toIso(year, month, Number(named[1]));
      return parsed ? { iso: parsed, confidence: "high", index } : null;
    }
  }

  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(raw);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += year > 70 ? 1900 : 2000;

    // 25/12/2026 can only be DD/MM; 03/04/2026 could be either.
    const dayFirst = first > 12 ? true : second > 12 ? false : true;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    const parsed = toIso(year, month, day);
    if (!parsed) return null;
    return {
      iso: parsed,
      confidence: first <= 12 && second <= 12 ? "medium" : "high",
      note:
        first <= 12 && second <= 12
          ? `The date "${raw}" is ambiguous; read as day/month. Check it against the invoice.`
          : undefined,
      index,
    };
  }

  return null;
}

const DATE_PATTERN =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-]+[A-Za-z]{3,9}\.?,?[\s-]+\d{2,4})\b/g;

/** Finds the date closest to a label, or the only date in the document. */
function findLabeledDate(text: string, labelPatterns: RegExp[], allDates: DateHit[]): DateHit | null {
  for (const pattern of labelPatterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const windowStart = Math.max(0, match.index);
    const windowEnd = Math.min(text.length, match.index + 120);
    const window = text.slice(windowStart, windowEnd);
    const inner = new RegExp(DATE_PATTERN.source).exec(window);
    if (inner) {
      const hit = parseDate(inner[1]!, windowStart + inner.index);
      if (hit) return hit;
    }
  }
  return allDates.length === 1 ? allDates[0]! : null;
}

/**
 * Labels that reliably begin a new field. PDF text is frequently a single
 * flattened line, so "Seller: X Buyer: Y" must not be read as one value.
 */
const FIELD_LABELS =
  /\b(?:buyer|bill\s*to|ship\s*to|seller|sold\s+by|vendor|merchant|supplier|product(?:\s+name)?|item(?:\s+name)?|description|purchase\s*date|invoice\s*(?:no|number|date)|order\s*(?:no|number|date)|date|total|subtotal|amount(?:\s+paid)?|grand\s+total|tax|gst|qty|quantity|price|return|returns|warranty|warranties|guarantee|delivery|delivered)\b\s*[:\-]/i;

function findLabeledString(text: string, patterns: RegExp[]): { value: string; evidence: string } | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const raw = match?.[1];
    if (!match || !raw) continue;

    // PDF text often flattens to one line, so the captured tail may contain the
    // next field ("Seller: X Buyer: Y"). Cut at the next label.
    const nextLabel = FIELD_LABELS.exec(raw);
    let candidate = nextLabel ? raw.slice(0, nextLabel.index) : raw;
    candidate = candidate.split(/[\n|]/)[0] ?? candidate;

    const value = candidate
      .replace(/\s{2,}/g, " ")
      .replace(/[,;:.\-\s]+$/, "")
      .trim();

    if (value.length >= 2 && /[A-Za-z]/.test(value)) {
      return { value, evidence: `${match[0].slice(0, match[0].length - raw.length).trim()} ${value}`.slice(0, 200) };
    }
  }
  return null;
}

interface MoneyHit {
  amountMinor: number;
  currency: string | null;
  evidence: string;
}

function parseMoney(text: string): MoneyHit | null {
  const pattern =
    /(?:total|amount(?:\s+paid)?|grand\s+total|invoice\s+value|paid)\D{0,20}?((?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s?[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s?(?:₹|rs\.?|inr|usd|eur|gbp))/i;
  const match = pattern.exec(text);
  if (!match?.[1]) return null;

  const raw = match[1];
  const symbol = /₹|rs\.?|inr|\$|usd|€|eur|£|gbp/i.exec(raw)?.[0]?.toLowerCase().replace(/\.$/, "");
  const numeric = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  return {
    amountMinor: Math.round(numeric * 100),
    currency: symbol ? (CURRENCY_SYMBOLS[symbol] ?? null) : null,
    evidence: match[0].trim().slice(0, 200),
  };
}

interface DurationClaim {
  durationValue: number;
  durationUnit: "days" | "months";
  evidence: string;
  startBasis: "purchase_date" | "delivery_date" | "unknown";
  confidence: "high" | "medium" | "low";
}

/** The sentence containing a match — proximity must mean "same sentence". */
function sentenceAround(text: string, index: number, length: number): string {
  const before = text.slice(Math.max(0, index - 150), index);
  const startOffset = Math.max(before.lastIndexOf("."), before.lastIndexOf(";"), before.lastIndexOf("\n")) + 1;
  const after = text.slice(index + length, index + length + 150);
  const endCandidates = [after.indexOf("."), after.indexOf(";"), after.indexOf("\n")].filter((value) => value !== -1);
  const endOffset = endCandidates.length > 0 ? Math.min(...endCandidates) : after.length;
  return text.slice(Math.max(0, index - 150) + startOffset, index + length + endOffset);
}

function startBasisOf(context: string): "purchase_date" | "delivery_date" | "unknown" {
  const lower = context.toLowerCase();
  if (/(delivery|delivered|receipt|received|arrival)/.test(lower)) return "delivery_date";
  if (/(purchase|invoice|billing|order)\s*date|date of (purchase|invoice|order)/.test(lower)) return "purchase_date";
  return "unknown";
}

function findDuration(text: string, keywords: RegExp): DurationClaim | null {
  const pattern = new RegExp(
    `(\\d{1,3})\\s*[\\s-]?\\s*(day|days|month|months|year|years)\\b[^.]{0,60}?(?:${keywords.source})|(?:${keywords.source})[^.]{0,60}?(\\d{1,3})\\s*[\\s-]?\\s*(day|days|month|months|year|years)\\b`,
    "i",
  );
  const match = pattern.exec(text);
  if (!match) return null;

  const value = Number(match[1] ?? match[3]);
  const unitRaw = (match[2] ?? match[4] ?? "").toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return null;

  const durationUnit: "days" | "months" = unitRaw.startsWith("day") ? "days" : "months";
  const durationValue = unitRaw.startsWith("year") ? value * 12 : value;

  // The sentence around the claim decides where the clock starts — proximity is
  // not enough, because a neighbouring sentence may mention delivery.
  const context = sentenceAround(text, match.index, match[0].length);

  return {
    durationValue,
    durationUnit,
    evidence: match[0].trim().slice(0, 200),
    startBasis: startBasisOf(context),
    confidence: "medium",
  };
}

function claimOf(hit: DurationClaim | null): PolicyClaim {
  if (!hit) {
    return {
      durationValue: null,
      durationUnit: null,
      startBasis: "unknown",
      evidence: null,
      provenance: "missing",
      confidence: "low",
    };
  }
  return {
    durationValue: hit.durationValue,
    durationUnit: hit.durationUnit,
    startBasis: hit.startBasis,
    evidence: hit.evidence,
    provenance: "invoice",
    confidence: hit.confidence,
  };
}

export function extractWithRules(text: string): ExtractionModel {
  const normalised = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const notes: string[] = [];

  const allDates: DateHit[] = [];
  for (const match of normalised.matchAll(DATE_PATTERN)) {
    const hit = parseDate(match[1]!, match.index ?? 0);
    if (hit) allDates.push(hit);
  }
  for (const hit of allDates) if (hit.note) notes.push(hit.note);

  const purchaseDate = findLabeledDate(
    normalised,
    [/(?:purchase|invoice|order|billing|bill)\s*date\s*[:\-]?/i, /(?:dated|date)\s*[:\-]/i],
    allDates,
  );

  const product = findLabeledString(normalised, [
    /\bproduct(?:\s+name)?\s*[:\-]\s*([^\n|]{2,200})/i,
    /\bitem(?:\s+name)?\s*[:\-]\s*([^\n|]{2,200})/i,
    /\bdescription\s*[:\-]\s*([^\n|]{2,200})/i,
  ]);

  const seller = findLabeledString(normalised, [
    /\b(?:sold\s+by|seller|vendor|merchant|supplier)\s*[:\-]\s*([^\n|]{2,200})/i,
    /\bfrom\s*[:\-]\s*([^\n|]{2,200})/i,
  ]);

  const money = parseMoney(normalised);
  const warranty = findDuration(normalised, /warrant(?:y|ies)|guarantee/i);
  const returnClaim = findDuration(normalised, /return|replacement|refund|exchange/i);

  if (!purchaseDate) notes.push("No purchase date was found in the text.");
  if (purchaseDate && purchaseDate.confidence !== "high") {
    notes.push("The purchase date was read from an ambiguous format — please confirm it.");
  }
  if (returnClaim && returnClaim.startBasis === "unknown") {
    notes.push("The return window does not say what it starts from; set the start date yourself.");
  }
  if (warranty) notes.push("A warranty duration was found — confirm it before it counts as verified.");
  if (!money) notes.push("No total amount was recognised.");

  const model: ExtractionModel = {
    productName: product
      ? { value: product.value, provenance: "invoice", confidence: "high", evidence: product.evidence }
      : { value: null, provenance: "missing", confidence: "low", evidence: null },
    seller: seller
      ? { value: seller.value, provenance: "invoice", confidence: "high", evidence: seller.evidence }
      : { value: null, provenance: "missing", confidence: "low", evidence: null },
    purchaseDate: purchaseDate
      ? { value: purchaseDate.iso, provenance: "invoice", confidence: purchaseDate.confidence, evidence: null }
      : { value: null, provenance: "missing", confidence: "low", evidence: null },
    price: money
      ? { value: money.amountMinor, provenance: "invoice", confidence: "medium", evidence: money.evidence }
      : { value: null, provenance: "missing", confidence: "low", evidence: null },
    currency: money?.currency
      ? { value: money.currency, provenance: "invoice", confidence: "medium", evidence: null }
      : { value: null, provenance: "missing", confidence: "low", evidence: null },
    returnPolicy: claimOf(returnClaim),
    warranty: claimOf(warranty),
    missingFields: [],
    uncertaintyNotes: notes.slice(0, 10),
  };

  // Derived, never hand-written: consistency is structural, not a promise.
  model.missingFields = FIELD_KEYS.filter((key) => {
    if (key === "returnPolicy" || key === "warranty") return model[key].durationValue === null;
    return model[key].value === null;
  }) as FieldKey[];

  return model;
}

/** A provider you can always fall back to: no network, no model, no key. */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "rule-based-v1";

  async extractFields({ text }: { text: string }): Promise<AiExtractionResult> {
    const startedAt = Date.now();
    if (text.trim().length < 20) {
      return {
        ok: false,
        code: "invalid_output",
        message: "There isn't enough text to extract fields from.",
      };
    }

    const data = extractWithRules(text);
    const problems = checkConsistency(data);
    if (problems.length > 0) {
      return { ok: false, code: "invalid_output", message: "The extractor produced an inconsistent result.", issues: problems };
    }

    return { ok: true, data, meta: { provider: this.name, model: this.model, durationMs: Date.now() - startedAt } };
  }
}
