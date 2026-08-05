"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Eye,
  Search,
  MessageCircleQuestion,
  FileText,
} from "lucide-react";

import type { AnalyticsSummary } from "@/app/api/analytics/route";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AnalyticsSummary };

const TYPE_META: Record<
  keyof AnalyticsSummary["byType"],
  { label: string; icon: typeof Eye }
> = {
  view: { label: "Page views", icon: Eye },
  search: { label: "Searches", icon: Search },
  ask: { label: "Vault questions", icon: MessageCircleQuestion },
};

/** A `view` path that points at a wiki note becomes a real link. */
function wikiHref(path: string): string | null {
  return path.startsWith("/wiki/") ? path : null;
}

export function InsightsView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch("/api/analytics", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (HTTP ${res.status}).`);
        return (await res.json()) as AnalyticsSummary;
      })
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Could not load insights.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading insights…</span>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">{state.message}</p>
        </CardContent>
      </Card>
    );
  }

  const { data } = state;

  if (data.total === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Activity className="text-muted-foreground h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            No activity logged yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Headline stats */}
      <section aria-label="Totals">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Total events"
            value={data.total}
            icon={Activity}
          />
          {(
            Object.keys(TYPE_META) as (keyof AnalyticsSummary["byType"])[]
          ).map((type) => {
            const meta = TYPE_META[type];
            return (
              <StatTile
                key={type}
                label={meta.label}
                value={data.byType[type]}
                icon={meta.icon}
              />
            );
          })}
        </div>
      </section>

      {/* Per-day activity */}
      <section aria-label="Activity by day">
        <Card>
          <CardHeader>
            <CardTitle>Activity by day</CardTitle>
            <CardDescription>
              Events logged locally, per calendar day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerDayChart data={data.perDay} />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Top viewed notes */}
        <Card>
          <CardHeader>
            <CardTitle>Top viewed notes</CardTitle>
            <CardDescription>Most-visited pages.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topPaths.length === 0 ? (
              <EmptyRow label="No page views yet." />
            ) : (
              <ul className="space-y-1.5">
                {data.topPaths.map((row) => {
                  const href = wikiHref(row.path);
                  const label =
                    row.path === "/" ? "Dashboard" : row.path.replace(/^\//, "");
                  return (
                    <li
                      key={row.path}
                      className="flex items-center gap-2 text-sm"
                    >
                      <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      {href ? (
                        <Link
                          href={href}
                          className="hover:text-foreground text-muted-foreground min-w-0 flex-1 truncate transition-colors"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground min-w-0 flex-1 truncate">
                          {label}
                        </span>
                      )}
                      <span className="text-foreground shrink-0 font-medium tabular-nums">
                        {row.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top searches */}
        <Card>
          <CardHeader>
            <CardTitle>Top searches</CardTitle>
            <CardDescription>Most-used search terms.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topSearches.length === 0 ? (
              <EmptyRow label="No searches yet." />
            ) : (
              <ul className="space-y-1.5">
                {data.topSearches.map((row) => (
                  <li
                    key={row.query}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">
                      {row.query}
                    </span>
                    <span className="text-foreground shrink-0 font-medium tabular-nums">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent asks */}
      <section aria-label="Recent questions">
        <Card>
          <CardHeader>
            <CardTitle>Recent questions</CardTitle>
            <CardDescription>
              Latest questions asked of the vault.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentAsks.length === 0 ? (
              <EmptyRow label="No questions asked yet." />
            ) : (
              <ul className="space-y-2.5">
                {data.recentAsks.map((ask, i) => (
                  <li
                    key={`${ask.ts}-${i}`}
                    className="flex items-start gap-2.5 text-sm"
                  >
                    <MessageCircleQuestion className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">{ask.query}</span>
                    <time
                      dateTime={ask.ts}
                      className="text-muted-foreground shrink-0 text-xs tabular-nums"
                    >
                      {formatTs(ask.ts)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: number;
  icon: typeof Eye;
}

function StatTile({ label, value, icon: Icon }: StatTileProps) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <Icon className="text-muted-foreground h-4 w-4" />
        <span className="text-foreground text-2xl font-semibold tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </CardContent>
    </Card>
  );
}

/** CSS-bar chart, single-hue, mirroring the dashboard collections chart. */
function PerDayChart({ data }: { data: AnalyticsSummary["perDay"] }) {
  if (data.length === 0) return <EmptyRow label="No activity yet." />;
  const max = data.reduce((m, d) => Math.max(m, d.count), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((row) => {
        const pct = Math.max(2, (row.count / max) * 100);
        return (
          <li key={row.date}>
            <div className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3">
              <span className="text-muted-foreground truncate text-right text-sm tabular-nums">
                {formatDay(row.date)}
              </span>
              <span className="bg-muted/60 relative h-6 overflow-hidden rounded-md">
                <span
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: "var(--chart-1)",
                  }}
                />
              </span>
              <span className="text-foreground text-right text-sm font-medium tabular-nums">
                {row.count}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-muted-foreground py-2 text-sm">{label}</p>;
}

/** `YYYY-MM-DD` → short `Mon D` label; falls back to the raw string. */
function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** ISO timestamp → short local date/time; falls back to the raw string. */
function formatTs(ts: string): string {
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return ts;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
