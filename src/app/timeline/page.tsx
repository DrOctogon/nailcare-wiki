import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { getTimeline } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Timeline",
  description: "How the vault grew over time.",
};

export default async function TimelinePage() {
  const buckets = await getTimeline();
  const peak = buckets.reduce((max, b) => Math.max(max, b.pages.length), 1);
  const total = buckets.reduce((sum, b) => sum + b.pages.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Timeline</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-10">
        <p className="catalog-meta lacquer-tick">Vault chronology</p>
        <h1 className="font-display mt-1 flex items-center gap-2.5 text-3xl text-balance md:text-4xl">
          <CalendarClock className="text-chart-2 h-8 w-8" />
          Timeline
        </h1>
        <p className="text-muted-foreground font-reading mt-3 text-lg leading-relaxed">
          {total.toLocaleString()} pages across {buckets.length} months — how the
          vault compounded over time.
        </p>
      </header>

      <div className="relative">
        {/* Vertical spine */}
        <div className="bg-border absolute top-2 bottom-2 left-[7px] w-px md:left-[calc(9rem+7px)]" />

        <ol className="space-y-10">
          {buckets.map((bucket) => (
            <li key={bucket.period} className="relative">
              <div className="md:flex md:gap-8">
                {/* Month label + volume bar */}
                <div className="mb-4 flex items-center gap-3 md:mb-0 md:w-36 md:flex-col md:items-end md:gap-1.5 md:pt-0.5">
                  <span className="bg-primary relative z-10 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-[var(--background)] md:order-2 md:self-start md:-ml-[calc(9rem-7px+7px)]" />
                  <div className="md:text-right">
                    <div className="catalog-meta text-foreground">
                      {bucket.label}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                      {bucket.pages.length} page
                      {bucket.pages.length === 1 ? "" : "s"}
                    </div>
                    <div className="mt-1.5 hidden md:flex md:justify-end">
                      <span
                        className="bg-chart-2/70 block h-1.5 rounded-full"
                        style={{
                          width: `${Math.max(8, (bucket.pages.length / peak) * 100)}px`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Entries */}
                <ul className="min-w-0 flex-1 space-y-1.5 pl-6 md:pl-0">
                  {bucket.pages.map((page) => {
                    const m = dirMeta(page.dir);
                    return (
                      <li key={page.slug}>
                        <Link
                          href={`/wiki/${page.slug}`}
                          className="group hover:bg-accent flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: m.accent }}
                          />
                          <span className="group-hover:text-foreground min-w-0 flex-1 truncate text-sm">
                            {page.title}
                          </span>
                          <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                            {m.singular}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
