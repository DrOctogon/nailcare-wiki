import Link from "next/link";
import { Tags as TagsIcon, Hash } from "lucide-react";

import { getAllTags } from "@/lib/wiki/vault";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata = {
  title: "Tags",
  description: "Browse every tag used across the knowledge vault.",
};

/** Bucket a count into one of four size tiers based on its position in the range. */
function sizeTier(count: number, min: number, max: number): 0 | 1 | 2 | 3 {
  if (max <= min) return 1;
  const ratio = (count - min) / (max - min);
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.45) return 2;
  if (ratio >= 0.2) return 1;
  return 0;
}

const TIER_CLASS: Record<0 | 1 | 2 | 3, string> = {
  0: "text-sm font-normal",
  1: "text-base font-medium",
  2: "text-lg font-semibold",
  3: "text-xl font-semibold",
};

export default async function TagsPage() {
  const tags = await getAllTags();

  const counts = tags.map((t) => t.count);
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;

  // Tag cloud: alphabetical for scannability.
  const cloud = [...tags].sort((a, b) => a.tag.localeCompare(b.tag));
  // Secondary list: most-used first.
  const ranked = [...tags].sort((a, b) => b.count - a.count);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Tags</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-10">
        <div className="lacquer-tick mb-3">
          <span className="catalog-meta inline-flex items-center gap-2">
            <TagsIcon className="h-4 w-4" />
            Tags
          </span>
        </div>
        <h1 className="font-display text-3xl text-balance md:text-4xl">
          Every tag in the vault
        </h1>
        <p className="text-muted-foreground font-reading mt-3 max-w-2xl text-lg">
          {tags.length.toLocaleString()} tag{tags.length === 1 ? "" : "s"}{" "}
          connect notes across collections. Larger tags appear on more pages.
        </p>
      </header>

      {tags.length === 0 ? (
        <p className="text-muted-foreground">No tags found yet.</p>
      ) : (
        <>
          {/* Tag cloud */}
          <section className="mb-12">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
              {cloud.map(({ tag, count }) => {
                const tier = sizeTier(count, min, max);
                return (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className={`text-foreground/80 hover:text-primary inline-flex items-baseline gap-1 leading-none transition-colors ${TIER_CLASS[tier]}`}
                  >
                    <Hash className="text-muted-foreground h-[0.7em] w-[0.7em] self-center" />
                    {tag}
                    <span className="text-muted-foreground align-super text-[0.6em] tabular-nums">
                      {count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Ranked list */}
          <section>
            <h2 className="catalog-meta mb-4 flex items-center gap-2">
              <Hash className="h-4 w-4" /> Most used
            </h2>
            <Separator className="mb-4" />
            <Card>
              <CardContent className="grid grid-cols-1 gap-px p-0 sm:grid-cols-2 lg:grid-cols-3">
                {ranked.map(({ tag, count }) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="hover:bg-accent flex items-center justify-between gap-2 px-4 py-2.5 transition-colors"
                  >
                    <span className="line-clamp-1 text-sm font-medium">
                      #{tag}
                    </span>
                    <Badge variant="outline" className="tabular-nums">
                      {count}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
