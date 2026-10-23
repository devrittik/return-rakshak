import { Bell, CalendarCheck, CheckCircle2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/data/client";
import { listProducts, listReminders } from "@/lib/data/repository";
import { todayIso } from "@/lib/policy/deadline";
import { currentUserId } from "@/lib/session";
import { daysBetween, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const userId = await currentUserId();
  const today = todayIso();
  const database = db();
  const [pending, dismissed, products] = await Promise.all([
    listReminders(database, userId, { status: "pending" }),
    listReminders(database, userId, { status: "dismissed" }),
    listProducts(database, userId),
  ]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "Deleted product";
  const upcoming = pending.filter((r) => daysBetween(today, r.remindOn) >= 0);
  const overdue = pending.filter((r) => daysBetween(today, r.remindOn) < 0);

  function ReminderRow({ reminder }: { reminder: (typeof pending)[number] }) {
    const days = daysBetween(today, reminder.remindOn);
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium">{reminder.label}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {productName(reminder.productId)} · {formatDate(reminder.remindOn)}
            {days < 0 ? ` · ${Math.abs(days)}d overdue` : days === 0 ? " · today" : ` · in ${days}d`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={reminder.kind === "warranty_expiry" ? "info" : "primary"}>
            {reminder.kind === "warranty_expiry" ? "Warranty" : reminder.kind === "return_deadline" ? "Return" : "Custom"}
          </Badge>
          <ActionButton
            variant="ghost"
            size="sm"
            endpoint={`/api/reminders/${reminder.id}/dismiss`}
            aria-label={`Dismiss reminder for ${reminder.label}`}
          >
            <CheckCircle2 aria-hidden />
            Dismiss
          </ActionButton>
        </div>
      </li>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Follow-through"
        title="Reminders"
        description="Nudges generated from your confirmed policies. Unverified policies never generate a reminder."
      />

      {pending.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="No reminders scheduled"
          description="Once a policy is confirmed, its reminder appears here. You can also export any deadline as a calendar event."
          action={
            <Link href="/products">
              <Button size="sm" variant="outline">
                Go to products
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Coming up</CardTitle>
                <CardDescription>Due today or later</CardDescription>
              </div>
              <CalendarCheck aria-hidden className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-0">
              {upcoming.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">Nothing scheduled ahead.</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {upcoming.map((r) => (
                    <ReminderRow key={r.id} reminder={r} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Past due</CardTitle>
                <CardDescription>Still actionable — dismiss once handled</CardDescription>
              </div>
              <ShieldAlert aria-hidden className="size-4 text-warning" />
            </CardHeader>
            <CardContent className="p-0">
              {overdue.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">Nothing overdue. </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {overdue.map((r) => (
                    <ReminderRow key={r.id} reminder={r} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {dismissed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Dismissed</CardTitle>
            <CardDescription>Kept for reference, no longer counted in your dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/70">
              {dismissed.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12.5px] text-muted-foreground">
                  <span className="truncate">{r.label}</span>
                  <span className="shrink-0">{formatDate(r.remindOn)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
