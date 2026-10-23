"use client";

import { Database, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function DemoControls({ hasDemoData }: { hasDemoData: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "load" | "clear">(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "load" | "clear") {
    if (action === "clear" && !window.confirm("Remove all demo products and their reminders? Your own records are untouched.")) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/demo/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => router.refresh());
    } catch {
      setError("Could not update demo data.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => call("load")} loading={busy === "load" || pending} disabled={hasDemoData}>
          <Database aria-hidden />
          {hasDemoData ? "Demo data loaded" : "Load demo data"}
        </Button>
        {hasDemoData ? (
          <Button variant="ghost" size="sm" onClick={() => call("clear")} loading={busy === "clear"}>
            <Trash2 aria-hidden />
            Remove demo
          </Button>
        ) : null}
      </div>
      {error ? (
        <span role="alert" className="text-[11.5px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
