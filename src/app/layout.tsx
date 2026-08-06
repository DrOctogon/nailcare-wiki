import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Newsreader, Geist_Mono } from "next/font/google";
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
import { WikilinkHover } from "@/components/wiki/wikilink-hover";

// "Lacquer & Ledger" type system: an editorial serif for display, a distinctive
// grotesque for UI, a reading serif for note prose, and a mono for catalog-card
// metadata. See globals.css @theme for how these map to Tailwind font utilities.
const fontDisplay = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const fontSans = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

const fontSerif = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
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
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontSerif.variable} ${geistMono.variable} h-full antialiased`}
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
          <WikilinkHover />
        </ThemeProvider>
      </body>
    </html>
  );
}
