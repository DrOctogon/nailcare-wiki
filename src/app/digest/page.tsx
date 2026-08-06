import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  FolderOpen,
  Newspaper,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";

import { getAllPageMetas } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";
import type { WikiPageMeta, WikiType } from "@/lib/wiki/types";
import { StatCard } from "@/components/wiki/stat-card";
import { DigestView } from "@/components/wiki/digest-view";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Digest",
  description: "What changed recently in your vault.",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
/** How many changed notes to feed the local LLM theme summary. */
const SUMMARY_TITLE_LIMIT = 15;

/** A note that was created or updated inside the digest window. */
interface ChangedNote {
  slug: string;
  title: string;
  dir: string;
  type: WikiType;
  /** The effective most-recent activity date (updated, falling back to created). */
  date: string;
  ts: number;
  excerpt: string;
  kind: "new" | "updated";
}

interface DigestGroup {
  dir: string;
  notes: ChangedNote[];
}

interface DigestData {
  weekCount: number;
  weekNew: number;
  weekUpdated: number;
  monthCount: number;
  monthNew: number;
  monthUpdated: number;
  mostActiveDir: string | null;
  mostActiveCount: number;
  groups: DigestGroup[];
  recent: ChangedNote[];
}

/** Parse an ISO date (date-only or datetime) to epoch ms, or null. */
function toTs(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Derive the recent-changes digest from page metas. A note counts as changed in
 * a window when its most-recent activity (updated, else created) falls inside
 * it; it is "new" when it was *created* inside the 30-day window, else "updated".
 */
function buildDigest(metas: readonly WikiPageMeta[], now: number): DigestData {
  const weekCutoff = now - WEEK_MS;
  const monthCutoff = now - MONTH_MS;

  const changed: ChangedNote[] = [];
  for (const meta of metas) {
    if (meta.isIndex) continue;
    const createdTs = toTs(meta.created);
    const updatedTs = toTs(meta.updated);
    const activityTs =
      updatedTs !== null && createdTs !== null
        ? Math.max(updatedTs, createdTs)
        : (updatedTs ?? createdTs);
    if (activityTs === null || activityTs < monthCutoff) continue;

    const isNew = createdTs !== null && createdTs >= monthCutoff;
    changed.push({
      slug: meta.slug,
      title: meta.title,
      dir: meta.dir,
      type: meta.type,
      date: meta.updated ?? meta.created ?? "",
      ts: activityTs,
      excerpt: meta.excerpt,
      kind: isNew ? "new" : "updated",
    });
  }

  changed.sort((a, b) => b.ts - a.ts);

  let weekCount = 0;
  let weekNew = 0;
  let weekUpdated = 0;
  let monthNew = 0;
  let monthUpdated = 0;
  const dirCounts = new Map<string, number>();
  for (const note of changed) {
    if (note.kind === "new") monthNew++;
    else monthUpdated++;
    if (note.dir) dirCounts.set(note.dir, (dirCounts.get(note.dir) ?? 0) + 1);
    if (note.ts >= weekCutoff) {
      weekCount++;
      if (note.kind === "new") weekNew++;
      else weekUpdated++;
    }
  }

  let mostActiveDir: string | null = null;
  let mostActiveCount = 0;
  for (const [dir, count] of dirCounts) {
    if (count > mostActiveCount) {
      mostActiveDir = dir;
      mostActiveCount = count;
    }
  }

  // Group by collection, groups ordered by size (largest first), notes newest-first.
  const byDir = new Map<string, ChangedNote[]>();
  for (const note of changed) {
    const list = byDir.get(note.dir);
    if (list) list.push(note);
    else byDir.set(note.dir, [note]);
  }
  const groups: DigestGroup[] = [...byDir.entries()]
    .map(([dir, notes]) => ({ dir, notes }))
    .sort((a, b) => b.notes.length - a.notes.length);

  return {
    weekCount,
    weekNew,
    weekUpdated,
    monthCount: changed.length,
    monthNew,
    monthUpdated,
    mostActiveDir,
    mostActiveCount,
    groups,
    recent: changed.slice(0, SUMMARY_TITLE_LIMIT),
  };
}

/** Compact "time ago" label, computed at request time. */
function relativeTime(ts: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

export default async function DigestPage() {
  const metas = await getAllPageMetas();
  // Request-time "now" for recency windows and relative-time labels. This is a
  // server component rendered per request, so a fresh timestamp is intended.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const digest = buildDigest(metas, now);
  const changedTitles = digest.recent.map((n) => n.title);
  const activeMeta = digest.mostActiveDir ? dirMeta(digest.mostActiveDir) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Digest</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-8">
        <p className="catalog-meta lacquer-tick">Recent changes</p>
        <h1 className="font-display mt-1 flex items-center gap-2.5 text-3xl text-balance md:text-4xl">
          <Newspaper className="text-chart-4 h-8 w-8" />
          Digest
        </h1>
        <p className="text-muted-foreground font-reading mt-3 text-lg leading-relaxed">
          What changed recently in your vault.
        </p>
      </header>

      {/* Stat tiles */}
      <section aria-label="Recent activity totals" className="mb-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Changed this week"
            value={digest.weekCount}
            icon={CalendarDays}
            accent="var(--chart-2)"
            hint={`${digest.weekNew} new · ${digest.weekUpdated} updated`}
          />
          <StatCard
            label="Changed this month"
            value={digest.monthCount}
            icon={Sparkles}
            accent="var(--chart-4)"
            hint={`${digest.monthNew} new · ${digest.monthUpdated} updated`}
          />
          <StatCard
            label="Most active collection"
            value={activeMeta ? activeMeta.label : "—"}
            icon={FolderOpen}
            accent={activeMeta ? activeMeta.accent : undefined}
            hint={
              activeMeta
                ? `${digest.mostActiveCount} change${digest.mostActiveCount === 1 ? "" : "s"} this month`
                : "No changes this month"
            }
          />
        </div>
      </section>

      {/* Local-LLM theme summary */}
      <section aria-label="Theme summary" className="mb-8">
        <DigestView changedTitles={changedTitles} />
      </section>

      {/* Grouped recent changes */}
      <section aria-label="Recent changes by collection">
        {digest.groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                Nothing changed in the last 30 days.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {digest.groups.map((group) => {
              const meta = dirMeta(group.dir);
              return (
                <Card key={group.dir || "_root"}>
                  <CardHeader>
                    <CardTitle className="font-display flex items-center gap-2 text-lg">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: meta.accent }}
                        aria-hidden="true"
                      />
                      {meta.label}
                      <span className="text-muted-foreground text-sm font-normal tabular-nums">
                        {group.notes.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-0.5">
                      {group.notes.map((note) => (
                        <li key={note.slug}>
                          <Link
                            href={`/wiki/${note.slug}`}
                            className="group hover:bg-accent flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors"
                          >
                            <span
                              className={
                                note.kind === "new"
                                  ? "text-chart-2 flex h-5 w-5 shrink-0 items-center justify-center"
                                  : "text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center"
                              }
                              aria-hidden="true"
                            >
                              {note.kind === "new" ? (
                                <Plus className="h-3.5 w-3.5" />
                              ) : (
                                <Pencil className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <span className="group-hover:text-foreground min-w-0 flex-1 truncate text-sm">
                              {note.title}
                            </span>
                            <span
                              className={
                                note.kind === "new"
                                  ? "bg-chart-2/15 text-chart-2 hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline"
                                  : "bg-muted text-muted-foreground hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline"
                              }
                            >
                              {note.kind === "new" ? "new" : "updated"}
                            </span>
                            <time
                              className="text-muted-foreground shrink-0 text-xs tabular-nums"
                              dateTime={note.date || undefined}
                            >
                              {relativeTime(note.ts, now)}
                            </time>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
