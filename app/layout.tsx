import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ReturnRakshak — return & warranty guard", template: "%s · ReturnRakshak" },
  description:
    "Track product return windows and warranty expiry dates from your invoices — without ever storing the invoices themselves.",
  applicationName: "ReturnRakshak",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#101418" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Theme is applied before paint to avoid a flash of the wrong scheme.
 * It reads only a local preference key — no cookies, no user data.
 */
const themeScript = `
(function(){try{var m=localStorage.getItem('rr-theme')||'system';
var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);
document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
