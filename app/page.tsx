import { CalendarClock, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { DemoControls } from "@/components/demo-controls";
import { PageHeader } from "@/components/page-header";
import { DeadlineLine, deadlineState } from "@/components/policy-status";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/data/client";
import { dashboardStats, listProducts, upcomingDeadlines } from "@/lib/data/repository";
import { todayIso } from "@/lib/policy/deadline";
import { currentUserId } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await currentUserId();
  const database = db();
  const today = todayIso();

  const [stats, products, returns, warranties] = await Promise.all([
    dashboardStats(database, userId, today),
    listProducts(database, userId, { includePolicies: true }),
    upcomingDeadlines(database, userId, "return", { today, withinDays: 120 }),
    upcomingDeadlines(database, userId, "warranty", { today, withinDays: 365 }),
  ]);

  const hasDemo = products.some((p) => p.source === "demo");
  const needsReview = products.filter((p) => p.policies.some((pol) => pol.verificationStatus === "needs_review"));
  const isEmpty = products.length === 0;

  return (
    <>
      <PageHeader
        eyebrow={formatDate(today)}
        title="What needs your attention"
        description="Verified deadlines only. Anything still unconfirmed is flagged as needing review, never presented as a date you can rely on."
        actions={
          <>
            <DemoControls hasDemoData={hasDemo} />
            <Link href="/upload" className="hidden sm:inline-flex">
              <Button>
                <Upload aria-hidden />
                Upload invoice
              </Button>
            </Link>
          </>
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No products tracked yet"
          description="Upload an invoice to have its return window and warranty extracted — or start with synthetic demo data to see how the dashboards behave."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <DemoControls hasDemoData={false} />
              <Link href="/products/new">
                <Button variant="outline" size="sm">
                  Add a product manually
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Products" value={stats.products} hint="Tracked records" />
            <StatCard label="Verified policies" value={stats.verifiedPolicies} tone="success" hint="Confirmed by you" />
            <StatCard
              label="Needs review"
              value={stats.needsReview}
              tone={stats.needsReview > 0 ? "warning" : "default"}
              hint={stats.needsReview > 0 ? "Unverified — not counted as deadlines" : "Nothing outstanding"}
            />
            <StatCard label="Pending reminders" value={stats.pendingReminders} hint="Scheduled from today" />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="returns-heading">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle id="returns-heading">Upcoming return deadlines</CardTitle>
                    <CardDescription>Next 120 days · verified policies only</CardDescription>
                  </div>
                  <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-0">
                  {returns.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                      No verified return windows closing in the next 120 days.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {returns.map(({ policy, product, daysRemaining }) => (
                        <li key={policy.id}>
                          <Link
                            href={`/products/${product.id}`}
                            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-medium">{product.name}</p>
                              <p className="truncate text-[12px] text-muted-foreground">
                                {product.seller ?? "Seller not recorded"}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <DeadlineLine policy={policy} todayIso={today} compact />
                              <Badge tone={deadlineState(policy, today) === "urgent" ? "danger" : "neutral"}>
                                {daysRemaining === 0 ? "Last day" : `${daysRemaining}d`}
                              </Badge>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="warranty-heading">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle id="warranty-heading">Warranty expiry</CardTitle>
                    <CardDescription>Next 12 months · verified policies only</CardDescription>
                  </div>
                  <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="p-0">
                  {warranties.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                      No verified warranties expiring in the next 12 months.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {warranties.map(({ policy, product }) => (
                        <li key={policy.id}>
                          <Link
                            href={`/products/${product.id}`}
                            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-medium">{product.name}</p>
                              <p className="truncate text-[12px] text-muted-foreground">
                                {policy.durationValue} {policy.durationUnit} · {policy.source.replace(/_/g, " ")}
                              </p>
                            </div>
                            <DeadlineLine policy={policy} todayIso={today} compact />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>

          {needsReview.length > 0 ? (
            <section aria-labelledby="review-heading">
              <Card className="border-warning/30 bg-warning-muted/40">
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle id="review-heading">Policies that need your review</CardTitle>
                    <CardDescription>
                      These were proposed during extraction but are not backed by confirmed evidence. Their dates are
                      excluded from the dashboards above.
                    </CardDescription>
                  </div>
                  <Badge tone="warning">{needsReview.length} open</Badge>
                </CardHeader>
                <CardContent className="grid gap-2 p-0">
                  <ul className="divide-y divide-warning/20">
                    {needsReview.map((product) => (
                      <li key={product.id}>
                        <Link
                          href={`/products/${product.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-warning-muted/60"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium">{product.name}</span>
                            <span className="block truncate text-[12px] text-muted-foreground">
                              {product.policies
                                .filter((p) => p.verificationStatus === "needs_review")
                                .map((p) => (p.kind === "return" ? "Return policy" : "Warranty"))
                                .join(", ")}{" "}
                              unverified
                            </span>
                          </span>
                          <span className="shrink-0 text-[12px] font-medium text-primary">Review →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
