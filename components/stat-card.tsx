import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-card">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-tight",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
