import { describe, expect, it } from "vitest";
import { icsFilename, policyCalendarEvent, toIcsCalendar } from "@/lib/calendar/ics";
import type { Policy } from "@/lib/data/schema";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: "pol_test",
    productId: "prd_test",
    userId: "usr_test",
    kind: "return",
    durationValue: 15,
    durationUnit: "days",
    startDate: "2026-10-14",
    countingConvention: "calendar",
    inclusiveEnd: true,
    deadlineDate: "2026-10-29",
    source: "invoice",
    evidence: "Return accepted within 15 days of delivery.",
    verificationStatus: "verified",
    verifiedAt: new Date("2026-10-24T00:00:00Z"),
    notes: null,
    createdAt: new Date("2026-10-24T00:00:00Z"),
    updatedAt: new Date("2026-10-24T00:00:00Z"),
    ...overrides,
  };
}

describe("calendar export", () => {
  it("emits one all-day event for a verified deadline and escapes punctuation", () => {
    const body = toIcsCalendar(
      [
        {
          uid: "pol_test@returnrakshak.local",
          deadlineDate: "2026-10-29",
          summary: "Return window closes: Lamp, Pro",
          description: "15 days; calendar days",
        },
      ],
      new Date("2026-10-24T18:05:00Z"),
    );

    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("DTSTART;VALUE=DATE:20261029");
    expect(body).toContain("DTEND;VALUE=DATE:20261030");
    expect(body).toContain("DTSTAMP:20261024T180500Z");
    expect(body).toContain("SUMMARY:Return window closes: Lamp\\, Pro");
    expect(body).toContain("DESCRIPTION:15 days\\; calendar days");
    expect(body.endsWith("\r\n")).toBe(true);
  });

  it("leaves an unverified policy out, even when a computed date exists", () => {
    expect(policyCalendarEvent("Secret Invoice Text", policy({ verificationStatus: "needs_review" }))).toBeNull();
    expect(policyCalendarEvent("Lamp", policy({ deadlineDate: null }))).toBeNull();
  });

  it("includes the short evidence quote and not a separate invoice body", () => {
    const event = policyCalendarEvent("Aurora ANC Headphones", policy());
    expect(event?.summary).toBe("Return window closes: Aurora ANC Headphones");
    expect(event?.description).toContain("Return accepted within 15 days of delivery.");
    expect(event?.description).not.toContain("TAX INVOICE");
  });

  it("builds a safe file name", () => {
    expect(icsFilename("Aurora ANC Headphones")).toBe("returnrakshak-aurora-anc-headphones.ics");
    expect(icsFilename("₹ kettle")).toBe("returnrakshak-kettle.ics");
    expect(icsFilename("...")).toBe("returnrakshak-deadlines.ics");
  });
});
