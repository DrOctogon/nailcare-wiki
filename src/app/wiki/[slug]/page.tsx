import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, FileText, Link2, MapPin, Sparkles } from "lucide-react";

import {
  getAllPageMetas,
  getPage,
  getSemanticRelated,
} from "@/lib/wiki/vault";
import type { WikiLink, WikiPageMeta } from "@/lib/wiki/types";
import { dirMeta, statusVariant } from "@/lib/wiki/labels";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Toc } from "@/components/wiki/toc";
import { BacklinksPanel } from "@/components/wiki/backlinks-panel";
import { ExportMenu } from "@/components/wiki/export-menu";

interface WikiPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const metas = await getAllPageMetas();
  return metas.filter((page) => !page.isIndex).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: WikiPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.excerpt || undefined,
  };
}

export default async function WikiDetailPage({ params }: WikiPageProps) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  const meta = dirMeta(page.dir);

  const [allMetas, semanticRelated] = await Promise.all([
    getAllPageMetas(),
    getSemanticRelated(slug, 5),
  ]);
  const metaBySlug = new Map(allMetas.map((m) => [m.slug, m]));
  const backlinkPages = page.backlinks
    .map((backlinkSlug) => metaBySlug.get(backlinkSlug))
    .filter((m): m is WikiPageMeta => m !== undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/browse/${page.dir}`} />}>
              {meta.label}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{page.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* Main article */}
        <div className="min-w-0">
          <header className="mb-8">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: meta.accent }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.accent }}
                />
                {meta.singular}
              </div>
              <ExportMenu slug={page.slug} title={page.title} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              {page.title}
            </h1>
            {page.excerpt && (
              <p className="text-muted-foreground mt-3 max-w-2xl text-lg">
                {page.excerpt}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              {page.status && (
                <Badge variant={statusVariant(page.status)}>{page.status}</Badge>
              )}
              {page.domain && <Badge variant="outline">{page.domain}</Badge>}
              {page.address && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {page.address}
                </span>
              )}
              {page.updated && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {page.updated}
                </span>
              )}
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                <span className="tabular-nums">{page.wordCount}</span> words
              </span>
              {page.backlinkCount > 0 && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{page.backlinkCount}</span>{" "}
                  backlink{page.backlinkCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </header>

          <Separator className="mb-8" />

          <article
            className="wiki-prose max-w-none"
            dangerouslySetInnerHTML={{ __html: page.html }}
          />
        </div>

        {/* Right rail */}
        <aside className="hidden w-64 lg:block">
          <div className="sticky top-8 space-y-8">
            <Toc headings={page.headings} />
            <RelatedList related={page.related} />
            <SemanticRelated pages={semanticRelated} />
          </div>
        </aside>
      </div>

      <BacklinksPanel pages={backlinkPages} />
    </div>
  );
}

interface SemanticRelatedProps {
  pages: WikiPageMeta[];
}

/** "Related by meaning" — nearest neighbors from the embedding index. */
function SemanticRelated({ pages }: SemanticRelatedProps) {
  if (pages.length === 0) return null;

  return (
    <nav aria-label="Related by meaning">
      <div className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <Sparkles className="h-3.5 w-3.5" />
        Related by meaning
      </div>
      <ul className="space-y-2 text-sm">
        {pages.map((p) => {
          const m = dirMeta(p.dir);
          return (
            <li key={p.slug}>
              <Link
                href={`/wiki/${p.slug}`}
                className="group hover:border-primary/40 block rounded-lg border p-2.5 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: m.accent }}
                  />
                  <span className="group-hover:text-foreground text-muted-foreground line-clamp-2 transition-colors">
                    {p.title}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface RelatedListProps {
  related: WikiLink[];
}

function RelatedList({ related }: RelatedListProps) {
  if (related.length === 0) return null;

  return (
    <nav aria-label="Related pages">
      <div className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
        Related
      </div>
      <ul className="space-y-1 text-sm">
        {related.map((link, index) =>
          link.slug ? (
            <li key={`${link.slug}-${index}`}>
              <Link
                href={`/wiki/${link.slug}`}
                className="text-muted-foreground hover:text-foreground line-clamp-1 block py-0.5 transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ) : (
            <li
              key={`${link.target}-${index}`}
              className="text-muted-foreground/60 line-clamp-1 py-0.5"
            >
              {link.label}
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
