import { isValidIsoDate } from "@/lib/policy/deadline";
import type { Policy } from "@/lib/data/schema";

/**
 * One all-day event per *verified* deadline.
 *
 * Dates are VALUE=DATE, so a calendar app does not shift them across
 * timezones. DTEND is exclusive in the spec, so a deadline of 29 Oct occupies
 * that single day. Unverified policies are omitted — an export must not look
 * like a confirmed date.
 */

export interface CalendarEventInput {
  uid: string;
  deadlineDate: string;
  summary: string;
  description: string;
}

const CRLF = "\r\n";

export function policyCalendarEvent(productName: string, policy: Policy): CalendarEventInput | null {
  if (policy.verificationStatus !== "verified" || !policy.deadlineDate || !isValidIsoDate(policy.deadlineDate)) {
    return null;
  }
  const what = policy.kind === "warranty" ? "Warranty expires" : "Return window closes";
  const counting = policy.countingConvention === "business" ? "business days (weekends skipped, holidays not included)" : "calendar days";
  const end = policy.inclusiveEnd ? "the last day is included" : "the last day is excluded";
  const evidence = policy.evidence?.trim() ? ` Evidence: ${policy.evidence.trim()}` : "";
  return {
    uid: `${policy.id}@returnrakshak.local`,
    deadlineDate: policy.deadlineDate,
    summary: `${what}: ${productName}`,
    description: `${policy.durationValue} ${policy.durationUnit}, ${counting}, ${end}.${evidence}`,
  };
}

export function toIcsCalendar(events: CalendarEventInput[], now: Date = new Date()): string {
  const stamp = toUtcStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ReturnRakshak//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of events) {
    if (!isValidIsoDate(event.deadlineDate)) continue;
    const start = event.deadlineDate.replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${nextDate(start)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}

export function icsFilename(productName: string): string {
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `returnrakshak-${slug || "deadlines"}.ics`;
}

function escapeText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\r\n", "\\n").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

/** Fold at 75 octets. Continuation lines start with a single space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let width = 75;
  while (start < bytes.length) {
    let end = Math.min(start + width, bytes.length);
    // Don't split a UTF-8 code point.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    width = 74;
  }
  return parts.join(`${CRLF} `);
}

function toUtcStamp(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function nextDate(compact: string): string {
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}
