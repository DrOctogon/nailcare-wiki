import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shiki initializes its highlighter lazily on each worker's first page; a few
  // pages can brush the default 60s ceiling during static export. Give the
  // generation more headroom so the build never flakes.
  staticPageGenerationTimeout: 180,
};

export default nextConfig;
