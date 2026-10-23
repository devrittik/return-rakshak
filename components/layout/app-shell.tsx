import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { MobileNav, SideNav } from "./nav";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="mx-auto flex w-full max-w-[1200px] gap-8 px-4 sm:px-6 lg:px-8">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-[228px] shrink-0 flex-col justify-between border-r border-border/70 py-6 pr-4 md:flex">
          <div className="space-y-7">
            <Link href="/" className="flex items-center gap-2.5 rounded px-1 py-1">
              <span className="flex size-9 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm">
                <ShieldCheck aria-hidden className="size-[18px]" />
              </span>
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight">ReturnRakshak</span>
                <span className="block text-[11px] text-muted-foreground">Return &amp; warranty guard</span>
              </span>
            </Link>
            <SideNav />
          </div>
          <div className="space-y-3 rounded border border-border bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
              <ShieldCheck aria-hidden className="size-3.5 text-primary" />
              Privacy by design
            </p>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Invoices are processed in memory and never stored. Only confirmed fields are saved.
            </p>
            <Link href="/privacy" className="inline-block text-[11.5px] font-medium text-primary underline-offset-2 hover:underline">
              Read the notice →
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-24 md:pb-8">
          <header className="sticky top-0 z-30 -mx-4 mb-6 flex items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-6 md:backdrop-blur-none">
            <div className="flex items-center gap-2 md:hidden">
              <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
                <ShieldCheck aria-hidden className="size-4" />
              </span>
              <span className="text-sm font-semibold tracking-tight">ReturnRakshak</span>
            </div>
            <div className="hidden flex-col md:flex">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Local mode · single user
              </span>
            </div>
            <ThemeToggle />
          </header>
          <main id="main" className="space-y-8">
            {children}
          </main>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
