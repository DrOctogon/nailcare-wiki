import Link from "next/link";
import {
  FileText,
  Link2,
  Tags as TagsIcon,
  Network,
  ArrowRight,
  Flame,
  Clock,
} from "lucide-react";

import {
  getStats,
  getMostLinked,
  getRecentlyUpdated,
  getAllTags,
  getGrowthSeries,
  getConnectivityHistogram,
  getCollectionSizes,
  getActivityCalendar,
  getCollectionGrowth,
  getCollectionChords,
} from "@/lib/wiki/vault";
import { dirMeta, DIR_ORDER } from "@/lib/wiki/labels";
import { StatCard } from "@/components/wiki/stat-card";
import { PageCard } from "@/components/wiki/page-card";
import { GrowthAreaChart } from "@/components/wiki/charts/growth-area-chart";
import { ActivityHeatmap } from "@/components/wiki/charts/activity-heatmap";
import { CollectionStreamgraph } from "@/components/wiki/charts/collection-streamgraph";
import { CollectionChord } from "@/components/wiki/charts/collection-chord";
import { CollectionsBarChart } from "@/components/wiki/charts/collections-bar-chart";
import { ConnectivityHistogram } from "@/components/wiki/charts/connectivity-histogram";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function DashboardPage() {
  const [
    stats,
    hot,
    recent,
    tags,
    growth,
    connectivity,
    collectionSizes,
    activity,
    collectionGrowth,
    collectionChords,
  ] = await Promise.all([
    getStats(),
    getMostLinked(6),
    getRecentlyUpdated(4),
    getAllTags(),
    getGrowthSeries(),
    getConnectivityHistogram(),
    getCollectionSizes(),
    getActivityCalendar(),
    getCollectionGrowth(),
    getCollectionChords(),
  ]);

  const byDir = new Map(stats.byDir.map((d) => [d.dir, d.count]));
  const collections = DIR_ORDER.filter((d) => byDir.has(d));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      {/* Hero */}
      <section className="hero-glow reveal mb-12">
        <p className="catalog-meta lacquer-tick">Compounding knowledge vault</p>
        <h1 className="font-display mt-1 max-w-3xl text-4xl text-balance md:text-6xl">
          A living web of research
        </h1>
        <p className="text-muted-foreground font-reading mt-5 max-w-2xl text-lg leading-relaxed">
          {stats.total} interlinked notes across concepts, entities, sources and
          open questions — with {stats.totalLinks.toLocaleString()} connections.
          Search anything with{" "}
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">
            ⌘K
          </kbd>
          .
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/graph"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Network className="h-4 w-4" /> Open the knowledge graph
          </Link>
          <Link
            href="/browse/concepts"
            className="hover:bg-accent inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            Browse concepts <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="reveal reveal-2 mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total pages"
          value={stats.total}
          icon={FileText}
          accent="var(--chart-1)"
        />
        <StatCard
          label="Connections"
          value={stats.totalLinks.toLocaleString()}
          icon={Link2}
          accent="var(--chart-2)"
        />
        <StatCard
          label="Unique tags"
          value={stats.totalTags}
          icon={TagsIcon}
          accent="var(--chart-4)"
        />
        <StatCard
          label="Collections"
          value={collections.length}
          icon={Network}
          accent="var(--chart-5)"
        />
      </section>

      {/* Vault analytics */}
      <section className="reveal reveal-3 mb-12">
        <h2 className="font-display lacquer-tick mb-4 text-xl md:text-2xl">
          Vault analytics
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Knowledge growth
              </CardTitle>
              <CardDescription>
                Cumulative pages by the day each note was created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GrowthAreaChart data={growth} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Daily activity
              </CardTitle>
              <CardDescription>
                Notes touched each day — the day each note was last updated or
                created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityHeatmap data={activity} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Collection growth
              </CardTitle>
              <CardDescription>
                How each collection accumulated over time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CollectionStreamgraph data={collectionGrowth} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Pages by collection
              </CardTitle>
              <CardDescription>How the vault breaks down by type.</CardDescription>
            </CardHeader>
            <CardContent>
              <CollectionsBarChart data={collectionSizes} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Connectivity
              </CardTitle>
              <CardDescription>
                Pages grouped by how many backlinks point at them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectivityHistogram data={connectivity} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Links between collections
              </CardTitle>
              <CardDescription>
                How often notes in each collection reference the others.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CollectionChord data={collectionChords} />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Collections */}
      <section className="reveal reveal-4 mb-12">
        <h2 className="font-display mb-4 text-xl md:text-2xl">Collections</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((dir) => {
            const meta = dirMeta(dir);
            return (
              <Link key={dir} href={`/browse/${dir}`} className="group block">
                <Card className="hover:border-primary/40 gap-2 transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle
                        className="flex items-center gap-2"
                        style={{ color: meta.accent }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: meta.accent }}
                        />
                        {meta.label}
                      </CardTitle>
                      <span className="text-muted-foreground tabular-nums">
                        {byDir.get(dir)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">
                      {meta.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="reveal reveal-5 grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Most linked */}
        <section className="lg:col-span-2">
          <h2 className="font-display mb-4 flex items-center gap-2 text-xl md:text-2xl">
            <Flame className="text-chart-1 h-5 w-5" /> Most connected
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {hot.map((page) => (
              <PageCard key={page.slug} page={page} showDir />
            ))}
          </div>
        </section>

        {/* Recently updated + tags */}
        <aside className="space-y-8">
          <section>
            <h2 className="font-display mb-4 flex items-center gap-2 text-xl">
              <Clock className="text-chart-2 h-5 w-5" /> Recently updated
            </h2>
            <Card>
              <CardContent className="divide-y p-0">
                {recent.map((page) => (
                  <Link
                    key={page.slug}
                    href={`/wiki/${page.slug}`}
                    className="hover:bg-accent block px-4 py-3 transition-colors"
                  >
                    <div className="line-clamp-1 text-sm font-medium">
                      {page.title}
                    </div>
                    <div className="catalog-meta mt-1">
                      {page.updated} · {dirMeta(page.dir).singular}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="font-display mb-4 flex items-center gap-2 text-xl">
              <TagsIcon className="text-chart-4 h-5 w-5" /> Popular tags
            </h2>
            <Separator className="mb-4" />
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, 24).map(({ tag, count }) => (
                <Link key={tag} href={`/tags/${encodeURIComponent(tag)}`}>
                  <Badge
                    variant="outline"
                    className="hover:bg-accent cursor-pointer gap-1"
                  >
                    {tag}
                    <span className="text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
