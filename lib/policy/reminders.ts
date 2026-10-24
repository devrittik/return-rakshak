import { addCalendarDays } from "@/lib/policy/deadline";

/**
 * How far ahead of a confirmed deadline the in-app nudge lands.
 * Returns are short, so two days is enough to act. Warranties are long, so
 * two weeks leaves time to find the paperwork. Public holidays are not part
 * of this offset — business-day policies already skip weekends only.
 */
export function reminderLeadDays(kind: "return" | "warranty"): number {
  return kind === "warranty" ? 14 : 2;
}

export function reminderSchedule(
  kind: "return" | "warranty",
  productName: string,
  deadlineDate: string,
): { kind: "return_deadline" | "warranty_expiry"; label: string; remindOn: string; leadDays: number } {
  const leadDays = reminderLeadDays(kind);
  return {
    kind: kind === "warranty" ? "warranty_expiry" : "return_deadline",
    label: kind === "warranty" ? `Warranty expires: ${productName}` : `Return window closes: ${productName}`,
    remindOn: addCalendarDays(deadlineDate, -leadDays),
    leadDays,
  };
}
