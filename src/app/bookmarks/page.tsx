import type { Metadata } from "next";
import Link from "next/link";
import { BookmarkCheck } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { BookmarksView } from "@/components/wiki/bookmarks-view";

export const metadata: Metadata = {
  title: "Reading Queue",
  description: "Notes you've saved to read — stored locally.",
};

export default function BookmarksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Reading Queue</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-10">
        <p className="catalog-meta lacquer-tick">Saved for later</p>
        <h1 className="font-display mt-1 flex items-center gap-2.5 text-3xl text-balance md:text-4xl">
          <BookmarkCheck className="text-chart-4 h-8 w-8" />
          Reading Queue
        </h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Notes you&apos;ve saved to read — stored locally.
        </p>
      </header>

      <BookmarksView />
    </div>
  );
}
