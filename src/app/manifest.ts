import type { MetadataRoute } from "next";

// Web app manifest for the installable Vault Explorer PWA.
// Next.js serves this from `/manifest.webmanifest` (referenced in layout metadata).
//
// Colors mirror the app's `--background` token from globals.css:
//   light  --background: oklch(1 0 0)      → #ffffff
//   dark   --background: oklch(0.145 0 0)  → ~#0a0a0a (theme_color for app chrome)
//
// Icons: no dedicated PWA PNGs exist in the project yet, so this references the
// bundled favicon. Adding purpose-built 192x192 and 512x512 PNGs (one maskable)
// would materially improve installability and the home-screen icon quality.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vault Explorer",
    short_name: "Vault",
    description:
      "A beautifully crafted browser for a compounding Obsidian knowledge vault.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
        purpose: "maskable",
      },
    ],
  };
}
