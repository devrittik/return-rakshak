import { AlertTriangle, BadgeCheck, CalendarClock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Policy } from "@/lib/data/schema";
import { cn, daysBetween, formatDate } from "@/lib/utils";

export type DeadlineState = "unverified" | "expired" | "urgent" | "upcoming" | "distant";

export function deadlineState(policy: Policy, todayIso: string): DeadlineState {
  if (policy.verificationStatus !== "verified" || !policy.deadlineDate) return "unverified";
  const days = daysBetween(todayIso, policy.deadlineDate);
  if (days < 0) return "expired";
  if (days <= 7) return "urgent";
  if (days <= 45) return "upcoming";
  return "distant";
}

/**
 * The single place that decides how a deadline is described.
 * An unverified policy can never render as a confirmed date — the label stays
 * "needs review" even when a computed date exists.
 */
export function VerificationBadge({ status }: { status: Policy["verificationStatus"] }) {
  return status === "verified" ? (
    <Badge tone="success">
      <BadgeCheck aria-hidden className="size-3" />
      Verified
    </Badge>
  ) : (
    <Badge tone="warning">
      <AlertTriangle aria-hidden className="size-3" />
      Needs review
    </Badge>
  );
}

export function DeadlineLine({ policy, todayIso, compact }: { policy: Policy; todayIso: string; compact?: boolean }) {
  const state = deadlineState(policy, todayIso);

  if (state === "unverified") {
    return (
      <p className={cn("flex items-center gap-1.5 text-[13px]", "text-warning")}>
        <ShieldAlert aria-hidden className="size-3.5 shrink-0" />
        <span>
          {policy.deadlineDate ? "Unverified deadline" : "No deadline yet"}
          {policy.deadlineDate ? ` · ${formatDate(policy.deadlineDate)}` : ""}
          {compact ? "" : " — confirm the policy to lock this in"}
        </span>
      </p>
    );
  }

  const days = daysBetween(todayIso, policy.deadlineDate!);
  const tone =
    state === "expired" ? "text-muted-foreground" : state === "urgent" ? "text-danger" : state === "upcoming" ? "text-warning" : "text-foreground";

  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-[13px]", tone)}>
      <CalendarClock aria-hidden className="size-3.5 shrink-0" />
      <span className="font-medium">{formatDate(policy.deadlineDate!)}</span>
      <span className="text-muted-foreground">
        {state === "expired"
          ? `· closed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
          : days === 0
            ? "· today is the last day"
            : `· ${days} day${days === 1 ? "" : "s"} left`}
      </span>
    </p>
  );
}

export function PolicyDuration({ policy }: { policy: Policy }) {
  return (
    <span className="tabular-nums">
      {policy.durationValue} {policy.durationUnit === "months" ? (policy.durationValue === 1 ? "month" : "months") : policy.durationValue === 1 ? "day" : "days"}
    </span>
  );
}
