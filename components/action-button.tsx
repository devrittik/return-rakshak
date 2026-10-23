"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = Omit<ButtonProps, "onClick"> & {
  endpoint: string;
  method?: "POST" | "DELETE";
  confirmText?: string;
  redirectTo?: string;
  successMessage?: string;
};

/**
 * Small mutation wrapper: POST/DELETE → refresh server components.
 * Used for delete/dismiss/demo actions so no button is decorative.
 */
export function ActionButton({
  endpoint,
  method = "POST",
  confirmText,
  redirectTo,
  successMessage,
  children,
  ...props
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      if (successMessage) {
        // Non-blocking feedback; the list itself is the source of truth.
        window.setTimeout(() => setError(null), 0);
      }
      startTransition(() => {
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      });
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button {...props} onClick={run} loading={busy || pending}>
        {children}
      </Button>
      {error ? (
        <span role="alert" className="text-[11.5px] font-medium text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
