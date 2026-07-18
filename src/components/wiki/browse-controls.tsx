"use client";

import * as React from "react";
import { ArrowDownAZ, Link2, Search } from "lucide-react";

import type { WikiPageMeta } from "@/lib/wiki/types";
import { PageCard } from "@/components/wiki/page-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SortKey = "az" | "backlinks";

interface BrowseControlsProps {
  pages: WikiPageMeta[];
  showDir?: boolean;
}

export function BrowseControls({ pages, showDir = false }: BrowseControlsProps) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("backlinks");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? pages.filter((p) => p.title.toLowerCase().includes(q))
      : pages;

    const sorted = [...matched].sort((a, b) =>
      sort === "az"
        ? a.title.localeCompare(b.title)
        : b.backlinkCount - a.backlinkCount ||
          a.title.localeCompare(b.title),
    );

    return sorted;
  }, [pages, query, sort]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title…"
            aria-label="Filter pages by title"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={sort === "az" ? "default" : "outline"}
            onClick={() => setSort("az")}
            aria-pressed={sort === "az"}
          >
            <ArrowDownAZ className="h-3.5 w-3.5" /> A–Z
          </Button>
          <Button
            size="sm"
            variant={sort === "backlinks" ? "default" : "outline"}
            onClick={() => setSort("backlinks")}
            aria-pressed={sort === "backlinks"}
          >
            <Link2 className="h-3.5 w-3.5" /> Most linked
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          No pages match “{query}”.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((page) => (
            <PageCard key={page.slug} page={page} showDir={showDir} />
          ))}
        </div>
      )}
    </div>
  );
}
