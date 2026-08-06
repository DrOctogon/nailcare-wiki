import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Hash } from "lucide-react";

import { getAllTags, getPagesByTag } from "@/lib/wiki/vault";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PageCard } from "@/components/wiki/page-card";

interface TagPageProps {
  params: Promise<{ tag: string }>;
}

export async function generateStaticParams(): Promise<{ tag: string }[]> {
  const tags = await getAllTags();
  return tags.map((t) => ({ tag: t.tag }));
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `#${decoded}`,
    description: `Pages tagged #${decoded} in the knowledge vault.`,
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);

  const pages = await getPagesByTag(decoded);
  if (pages.length === 0) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/tags" />}>Tags</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>#{decoded}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-10">
        <div className="lacquer-tick mb-3">
          <span className="catalog-meta inline-flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Tag
          </span>
        </div>
        <h1 className="font-display flex items-baseline gap-1 text-3xl text-balance md:text-4xl">
          <span className="text-muted-foreground">#</span>
          {decoded}
        </h1>
        <p className="text-muted-foreground font-reading mt-3 text-lg">
          {pages.length.toLocaleString()} page{pages.length === 1 ? "" : "s"}{" "}
          tagged with this topic.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <PageCard key={page.slug} page={page} showDir />
        ))}
      </div>

      <div className="mt-10">
        <Link
          href="/tags"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> All tags
        </Link>
      </div>
    </div>
  );
}
