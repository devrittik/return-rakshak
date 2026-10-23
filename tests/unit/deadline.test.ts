import { describe, expect, it } from "vitest";
import {
  addBusinessDaysIso,
  addCalendarDays,
  addCalendarMonths,
  computeDeadline,
  isValidIsoDate,
  todayIso,
} from "@/lib/policy/deadline";

describe("isValidIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidIsoDate("2026-10-23")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects impossible or malformed dates", () => {
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
    expect(isValidIsoDate("23-10-2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("addCalendarDays", () => {
  it("crosses month boundaries", () => {
    expect(addCalendarDays("2026-01-28", 5)).toBe("2026-02-02");
    expect(addCalendarDays("2026-10-25", 10)).toBe("2026-11-04");
  });

  it("crosses year boundaries and leap days", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2023-02-28", 1)).toBe("2023-03-01");
  });

  it("is unaffected by timezone because dates are UTC calendar dates", () => {
    // 00:00 in every timezone still yields the same calendar day.
    expect(addCalendarDays("2026-03-01", 0)).toBe("2026-03-01");
  });
});

describe("addCalendarMonths", () => {
  it("clamps to the last valid day of shorter months", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addCalendarMonths("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("handles non-clamping cases exactly", () => {
    expect(addCalendarMonths("2026-01-15", 12)).toBe("2027-01-15");
    expect(addCalendarMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("supports leap-year anniversaries", () => {
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addCalendarMonths("2024-02-29", 48)).toBe("2028-02-29");
  });
});

describe("addBusinessDaysIso", () => {
  it("skips weekends", () => {
    // Friday 2026-10-23 + 1 business day = Monday 2026-10-26
    expect(addBusinessDaysIso("2026-10-23", 1).date).toBe("2026-10-26");
    expect(addBusinessDaysIso("2026-10-23", 5).date).toBe("2026-10-30");
    expect(addBusinessDaysIso("2026-10-23", 5).skipped).toBe(2);
  });

  it("returns the same date for a zero count", () => {
    expect(addBusinessDaysIso("2026-10-24", 0).date).toBe("2026-10-24");
  });
});

describe("computeDeadline", () => {
  it("computes an inclusive calendar deadline", () => {
    const result = computeDeadline({
      startDate: "2026-10-01",
      durationValue: 15,
      durationUnit: "days",
      inclusiveEnd: true,
    });
    expect(result).toEqual({ ok: true, deadlineDate: "2026-10-16", skippedDays: 0 });
  });

  it("shifts one day earlier when the end is exclusive", () => {
    const inclusive = computeDeadline({ startDate: "2026-10-01", durationValue: 15, durationUnit: "days", inclusiveEnd: true });
    const exclusive = computeDeadline({ startDate: "2026-10-01", durationValue: 15, durationUnit: "days", inclusiveEnd: false });
    expect(inclusive.ok && inclusive.deadlineDate).toBe("2026-10-16");
    expect(exclusive.ok && exclusive.deadlineDate).toBe("2026-10-15");
  });

  it("accepts a start date that is not the purchase date", () => {
    // Delivery-based return window.
    const result = computeDeadline({ startDate: "2026-09-28", durationValue: 7, durationUnit: "days" });
    expect(result.ok && result.deadlineDate).toBe("2026-10-05");
  });

  it("computes month-based warranties with month-end clamping", () => {
    const result = computeDeadline({ startDate: "2026-01-31", durationValue: 1, durationUnit: "months" });
    expect(result.ok && result.deadlineDate).toBe("2026-02-28");
  });

  it("counts business days when asked", () => {
    const result = computeDeadline({
      startDate: "2026-10-23",
      durationValue: 3,
      durationUnit: "days",
      countingConvention: "business",
    });
    // Fri 23 → Mon 26, Tue 27, Wed 28
    expect(result.ok && result.deadlineDate).toBe("2026-10-28");
  });

  it("rejects invalid start dates instead of guessing", () => {
    expect(computeDeadline({ startDate: "2026-02-30", durationValue: 7, durationUnit: "days" })).toEqual({
      ok: false,
      reason: "invalid_start_date",
    });
  });

  it("rejects negative or fractional durations", () => {
    expect(computeDeadline({ startDate: "2026-10-01", durationValue: -1, durationUnit: "days" })).toEqual({
      ok: false,
      reason: "invalid_duration",
    });
    expect(computeDeadline({ startDate: "2026-10-01", durationValue: 1.5, durationUnit: "days" })).toEqual({
      ok: false,
      reason: "invalid_duration",
    });
  });

  it("refuses business-day month arithmetic rather than approximating", () => {
    expect(
      computeDeadline({ startDate: "2026-10-01", durationValue: 2, durationUnit: "months", countingConvention: "business" }),
    ).toEqual({ ok: false, reason: "unsupported_convention" });
  });
});

describe("todayIso", () => {
  it("formats the current UTC date and ignores the local time-of-day", () => {
    expect(todayIso(new Date("2026-10-23T23:45:00Z"))).toBe("2026-10-23");
    expect(todayIso(new Date("2026-10-23T00:15:00Z"))).toBe("2026-10-23");
  });
});
