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
        <CardHeader className="gap-1.5">
          <div className="catalog-meta flex items-center gap-2">
            {showDir && (
              <span
                className="inline-flex items-center gap-1.5"
                style={{ color: meta.accent }}
              >
                <span
                  className="h-2 w-2 rounded-full"
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
          <h3 className="group-hover:text-primary font-reading flex items-start gap-1 text-base font-medium leading-snug transition-colors">
            <span className="line-clamp-2">{page.title}</span>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </h3>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="text-muted-foreground line-clamp-3 text-sm">
            {page.excerpt || "No summary available."}
          </p>
        </CardContent>
        <CardFooter className="catalog-meta gap-3">
          {page.backlinkCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              {page.backlinkCount} backlink{page.backlinkCount === 1 ? "" : "s"}
            </span>
          )}
          {page.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="truncate">
              #{tag}
            </span>
          ))}
        </CardFooter>
      </Card>
    </Link>
  );
}
