/**
 * Deterministic deadline arithmetic. No LLM output ever reaches this module —
 * a model may *propose* a duration, but the date is computed here, in code,
 * from an explicit start date and counting convention.
 *
 * Calendar rules: day and month addition with month-end clamping, inclusive or
 * exclusive ends, and business days that skip weekends. Indian public holidays
 * are not modelled — the policy form says so, rather than pretending a holiday
 * calendar is complete.
 */

export type CountingConvention = "calendar" | "business";
export type DurationUnit = "days" | "months";

export interface DeadlineInput {
  startDate: string; // YYYY-MM-DD
  durationValue: number;
  durationUnit: DurationUnit;
  countingConvention?: CountingConvention;
  inclusiveEnd?: boolean;
}

export type DeadlineResult =
  | { ok: true; deadlineDate: string; skippedDays: number }
  | { ok: false; reason: "invalid_start_date" | "invalid_duration" | "unsupported_convention" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/**
 * Adds months, clamping to the last valid day of the target month
 * (31 Jan + 1 month = 28/29 Feb), which is what consumer policy terms mean.
 */
export function addCalendarMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toIso(target);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function addBusinessDaysIso(iso: string, count: number): { date: string; skipped: number } {
  const date = toUtc(iso);
  let remaining = count;
  let skipped = 0;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isWeekend(date)) skipped += 1;
    else remaining -= 1;
  }
  return { date: toIso(date), skipped };
}

export function computeDeadline(input: DeadlineInput): DeadlineResult {
  if (!isValidIsoDate(input.startDate)) return { ok: false, reason: "invalid_start_date" };
  if (!Number.isInteger(input.durationValue) || input.durationValue < 0) {
    return { ok: false, reason: "invalid_duration" };
  }

  const convention = input.countingConvention ?? "calendar";
  const inclusiveEnd = input.inclusiveEnd ?? true;
  // An exclusive end means the window closes the day before the anniversary.
  const offset = inclusiveEnd ? 0 : -1;

  if (convention === "business") {
    if (input.durationUnit === "months") return { ok: false, reason: "unsupported_convention" };
    const { date, skipped } = addBusinessDaysIso(input.startDate, input.durationValue + offset);
    return { ok: true, deadlineDate: date, skippedDays: skipped };
  }

  if (convention !== "calendar") return { ok: false, reason: "unsupported_convention" };

  const raw =
    input.durationUnit === "months"
      ? addCalendarMonths(input.startDate, input.durationValue + offset)
      : addCalendarDays(input.startDate, input.durationValue + offset);

  return { ok: true, deadlineDate: raw, skippedDays: 0 };
}

export function todayIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}
