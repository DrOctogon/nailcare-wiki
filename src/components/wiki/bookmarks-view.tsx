"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkX, Trash2 } from "lucide-react";

import type { WikiType } from "@/lib/wiki/types";
import { dirMeta, TYPE_LABEL } from "@/lib/wiki/labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type Bookmark,
  clearBookmarks,
  listBookmarks,
  removeBookmark,
  subscribe,
} from "@/lib/bookmarks";

/** Coarse relative-time label, e.g. "just now", "3h ago", "2d ago". */
function relativeTime(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Human label for a stored bookmark's type, tolerant of unknown values. */
function typeLabel(type: string): string {
  return TYPE_LABEL[type as WikiType] ?? "Note";
}

/**
 * Renders the reading queue. Reads localStorage on mount and re-reads whenever
 * the bookmarks store changes (this tab or another). SSR-safe: starts empty and
 * marks itself hydrated in an effect so the empty state doesn't flash on the
 * server render.
 */
export function BookmarksView() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const sync = (): void => {
      setBookmarks(listBookmarks());
      setNow(Date.now());
    };
    sync();
    // Intentional post-mount hydrate flag; not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    return subscribe(sync);
  }, []);

  const handleClearAll = (): void => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove all saved notes from your reading queue?")
    ) {
      return;
    }
    clearBookmarks();
  };

  if (!hydrated) {
    return <div className="min-h-40" aria-busy="true" />;
  }

  if (bookmarks.length === 0) {
    return (
      <Card className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-16 text-center">
        <BookmarkX className="h-8 w-8 opacity-60" />
        <p className="text-sm">
          No saved notes yet — open a note and tap the bookmark.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="catalog-meta">
          <span className="tabular-nums">{bookmarks.length}</span> saved note
          {bookmarks.length === 1 ? "" : "s"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 data-icon="inline-start" />
          Clear all
        </Button>
      </div>

      <ul className="space-y-2">
        {bookmarks.map((bookmark) => {
          const meta = dirMeta(bookmark.dir);
          return (
            <li key={bookmark.slug}>
              <Card className="hover:border-primary/40 flex flex-row items-center gap-3 px-4 py-3 transition-colors">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.accent }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/wiki/${bookmark.slug}`}
                    className="hover:text-primary block truncate font-medium tracking-tight transition-colors"
                  >
                    {bookmark.title}
                  </Link>
                  <div className="catalog-meta mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>{typeLabel(bookmark.type)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{meta.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>added {relativeTime(bookmark.addedAt, now)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeBookmark(bookmark.slug)}
                  aria-label={`Remove ${bookmark.title} from reading queue`}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 />
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
