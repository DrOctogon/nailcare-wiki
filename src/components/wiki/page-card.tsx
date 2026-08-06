import Link from "next/link";
import { ArrowUpRight, Link2 } from "lucide-react";

import type { WikiPageMeta } from "@/lib/wiki/types";
import { dirMeta, statusVariant } from "@/lib/wiki/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

interface PageCardProps {
  page: WikiPageMeta;
  showDir?: boolean;
}

export function PageCard({ page, showDir = false }: PageCardProps) {
  const meta = dirMeta(page.dir);

  return (
    <Link href={`/wiki/${page.slug}`} className="group block h-full">
      <Card className="hover:border-primary/40 h-full gap-3 transition-colors">
        <CardHeader className="gap-2">
          <div className="catalog-meta flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            {showDir && (
              <span
                className="inline-flex items-center gap-1.5"
                style={{ color: meta.accent }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta.accent }}
                />
                {meta.singular}
              </span>
            )}
            {page.status && (
              <Badge variant={statusVariant(page.status)} className="text-[10px]">
                {page.status}
              </Badge>
            )}
          </div>
          <h3 className="group-hover:text-primary font-reading flex items-start gap-1.5 text-base font-medium leading-snug tracking-[-0.01em] text-balance transition-colors">
            <span className="line-clamp-2">{page.title}</span>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 -translate-x-1 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
          </h3>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
            {page.excerpt || "No summary available."}
          </p>
        </CardContent>
        <CardFooter className="catalog-meta flex-wrap gap-x-3 gap-y-1">
          {page.backlinkCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              {page.backlinkCount} backlink{page.backlinkCount === 1 ? "" : "s"}
            </span>
          )}
          {page.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="max-w-[9rem] truncate">
              #{tag}
            </span>
          ))}
        </CardFooter>
      </Card>
    </Link>
  );
}
