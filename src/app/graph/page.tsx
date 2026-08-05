import Link from "next/link";
import type { Metadata } from "next";
import { Network } from "lucide-react";

import { getGraph, getAllPageMetas } from "@/lib/wiki/vault";
import { GraphView } from "@/components/wiki/graph-view";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Knowledge graph",
  description: "An interactive map of every note and the links between them.",
};

/** Number of most-common tags to offer in the graph's tag filter. */
const TOP_TAG_LIMIT = 20;

export default async function GraphPage() {
  const [graph, metas] = await Promise.all([getGraph(), getAllPageMetas()]);

  // Graph nodes carry `dir`/`type` but not tags, so join page metas here and
  // ship a compact slug→tags map (only graph slugs that actually have tags)
  // plus the most-common tags for the filter dropdown.
  const tagsBySlug = new Map(metas.map((m) => [m.slug, m.tags]));
  const nodeTags: Record<string, string[]> = {};
  const tagCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    const tags = tagsBySlug.get(node.id);
    if (!tags || tags.length === 0) continue;
    nodeTags[node.id] = tags;
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, TOP_TAG_LIMIT);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Knowledge Graph</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight md:text-4xl">
          <Network className="text-chart-5 h-7 w-7 shrink-0" />
          Knowledge graph
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          {graph.nodes.length.toLocaleString()} notes connected by{" "}
          {graph.links.length.toLocaleString()} links. Explore how the research
          weaves together — click any node to open it.
        </p>
      </header>

      <div className="bg-card h-[calc(100vh-12rem)] min-h-[420px] overflow-hidden rounded-xl border">
        <GraphView graph={graph} nodeTags={nodeTags} topTags={topTags} />
      </div>
    </div>
  );
}
