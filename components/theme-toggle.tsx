"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";
const STORAGE_KEY = "rr-theme";

function apply(mode: Mode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "system";
    setMode(stored);
    apply(stored);
    setMounted(true);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply((localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function choose(next: Mode) {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  const options: { value: Mode; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5", !mounted && "invisible")}
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={mode === value}
          title={`${label} theme`}
          className={cn(
            "flex size-7 items-center justify-center rounded-full transition-colors [&_svg]:size-3.5",
            mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon aria-hidden />
          <span className="sr-only">{label} theme</span>
        </button>
      ))}
    </div>
  );
}
