import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { getStats } from "@/lib/wiki/vault";
import { DIR_ORDER } from "@/lib/wiki/labels";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar, type CollectionNav } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { NavBeacon } from "@/lib/analytics";
import { PwaRegister } from "@/components/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Vault Explorer",
    template: "%s · Vault Explorer",
  },
  description:
    "A beautifully crafted browser for a compounding Obsidian knowledge vault.",
  applicationName: "Vault Explorer",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vault",
  },
};

// Next.js 16 expects theme-color in the viewport export (not in `metadata`).
// Values track the `--background` token from globals.css for each color scheme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const stats = await getStats();
  const byDir = new Map(stats.byDir.map((d) => [d.dir, d.count]));
  const collections: CollectionNav[] = DIR_ORDER.filter((d) =>
    byDir.has(d),
  ).map((dir) => ({ dir, count: byDir.get(dir) ?? 0 }));

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            <AppSidebar collections={collections} totalPages={stats.total} />
            <SidebarInset>
              <SiteHeader />
              <main className="flex-1">{children}</main>
            </SidebarInset>
          </SidebarProvider>
          <Toaster />
          <NavBeacon />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
