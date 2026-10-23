import { ArrowUpRight, Package, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { VerificationBadge, deadlineState } from "@/components/policy-status";
import { Card } from "@/components/ui/card";
import type { Policy } from "@/lib/data/schema";
import type { ProductWithPolicies } from "@/lib/data/repository";
import { cn, daysBetween, formatDate, formatMoney } from "@/lib/utils";

function DeadlineRow({ label, policy, todayIso }: { label: string; policy: Policy | undefined; todayIso: string }) {
  if (!policy) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="text-muted-foreground">Not tracked</dd>
      </div>
    );
  }

  const state = deadlineState(policy, todayIso);
  const verified = state !== "unverified";
  const days = verified ? daysBetween(todayIso, policy.deadlineDate!) : null;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">
        {verified ? (
          <span
            className={cn(
              "font-medium tabular-nums",
              state === "expired" && "text-muted-foreground",
              state === "urgent" && "text-danger",
              state === "upcoming" && "text-warning",
            )}
          >
            {formatDate(policy.deadlineDate)}
            <span className="ml-1.5 font-normal text-muted-foreground">
              {state === "expired" ? "closed" : days === 0 ? "last day" : `${days}d`}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-warning">
            Needs review
          </span>
        )}
      </dd>
    </div>
  );
}

export function ProductCard({ product, todayIso }: { product: ProductWithPolicies; todayIso: string }) {
  const ret = product.policies.find((p) => p.kind === "return");
  const warranty = product.policies.find((p) => p.kind === "warranty");
  const verifiedCount = product.policies.filter((p) => p.verificationStatus === "verified").length;

  return (
    <Card className="group transition-shadow hover:shadow-raised">
      <Link href={`/products/${product.id}`} className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-primary-muted text-primary">
              <Package aria-hidden className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground" title={product.name}>
                {product.name}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={product.seller ?? undefined}>
                {product.seller ?? "Seller not recorded"}
              </p>
            </div>
          </div>
          <ArrowUpRight
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary"
          />
        </div>

        <dl className="mt-1 space-y-1.5 border-t border-border/70 pt-3 text-[12.5px]">
          <DeadlineRow label="Return" policy={ret} todayIso={todayIso} />
          <DeadlineRow label="Warranty" policy={warranty} todayIso={todayIso} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="font-medium tabular-nums">{formatMoney(product.priceMinor, product.currency)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Bought</dt>
            <dd className="tabular-nums">{formatDate(product.purchaseDate)}</dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {product.source === "demo" ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Demo</span>
          ) : null}
          {product.policies.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">No policies yet</span>
          ) : verifiedCount === product.policies.length ? (
            <VerificationBadge status="verified" />
          ) : (
            <VerificationBadge status="needs_review" />
          )}
          {product.policies.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck aria-hidden className="size-3" />
              {verifiedCount}/{product.policies.length} verified
            </span>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
