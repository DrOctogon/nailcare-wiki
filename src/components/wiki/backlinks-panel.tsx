import { Link2 } from "lucide-react";

import type { WikiPageMeta } from "@/lib/wiki/types";
import { PageCard } from "@/components/wiki/page-card";

interface BacklinksPanelProps {
  pages: WikiPageMeta[];
}

export function BacklinksPanel({ pages }: BacklinksPanelProps) {
  return (
    <section className="mt-12">
      <h2 className="catalog-meta mb-4 flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        Linked from
        <span className="tabular-nums">({pages.length})</span>
      </h2>
      {pages.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-sm">
          No other pages link here yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <PageCard key={page.slug} page={page} showDir />
          ))}
        </div>
      )}
    </section>
  );
}
