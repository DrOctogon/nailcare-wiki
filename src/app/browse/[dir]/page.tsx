import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileArchive, FileText } from "lucide-react";

import { getPagesByDir, getStats } from "@/lib/wiki/vault";
import { dirMeta, DIR_ORDER } from "@/lib/wiki/labels";
import { BrowseControls } from "@/components/wiki/browse-controls";
import { buttonVariants } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BrowsePageProps {
  params: Promise<{ dir: string }>;
}

export async function generateStaticParams(): Promise<{ dir: string }[]> {
  const stats = await getStats();
  const existing = new Set(stats.byDir.map((d) => d.dir));
  return DIR_ORDER.filter((dir) => existing.has(dir)).map((dir) => ({ dir }));
}

export async function generateMetadata({
  params,
}: BrowsePageProps): Promise<Metadata> {
  const { dir } = await params;
  const meta = dirMeta(dir);
  return {
    title: meta.label,
    description: meta.description,
  };
}

export default async function BrowsePage({ params }: BrowsePageProps) {
  const { dir } = await params;

  if (!DIR_ORDER.includes(dir)) {
    notFound();
  }

  const pages = await getPagesByDir(dir);
  if (pages.length === 0) {
    notFound();
  }

  const meta = dirMeta(dir);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{meta.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight md:text-4xl">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: meta.accent }}
            />
            {meta.label}
          </h1>
          <a
            href={`/api/export/${dir}`}
            download={`${dir}.zip`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "no-print shrink-0",
            })}
          >
            <FileArchive data-icon="inline-start" />
            Download .zip
          </a>
        </div>
        {meta.description && (
          <p className="text-muted-foreground mt-3 max-w-2xl text-lg">
            {meta.description}
          </p>
        )}
        <p className="text-muted-foreground mt-4 inline-flex items-center gap-1.5 text-sm">
          <FileText className="h-4 w-4" />
          <span className="tabular-nums">{pages.length}</span>{" "}
          {pages.length === 1 ? meta.singular.toLowerCase() : "pages"}
        </p>
      </header>

      <BrowseControls pages={pages} />
    </div>
  );
}
