import Link from "next/link";

import type { RankedNote } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";

interface TopNotesRankingProps {
  data: RankedNote[];
}

/**
 * "Most important notes" — a quiet, precise ranking of the vault's structurally
 * central pages by PageRank. A "start here" index rendered as a lollipop list:
 * mono rank index · dir-accent dot · note title (link) · hairline lollipop whose
 * length is normalized to the top note (100%) · backlink count.
 *
 * Server component: no client hooks, CSS %-width bars only.
 * Assumes `data` is pre-sorted descending by pagerank.
 */
export function TopNotesRanking({ data }: TopNotesRankingProps) {
  if (data.length === 0) return null;

  const max = data.reduce((m, d) => Math.max(m, d.pagerank), 0) || 1;

  return (
    <nav aria-label="Most important notes by PageRank">
      <p className="catalog-meta text-muted-foreground mb-3">
        By PageRank — structural importance
      </p>
      <ol className="divide-border/60 divide-y">
        {data.map((note, i) => {
          const meta = dirMeta(note.dir);
          const pct = Math.max(3, Math.min(100, (note.pagerank / max) * 100));
          const rank = String(i + 1).padStart(2, "0");
          const backlinks = `${note.backlinkCount} backlink${
            note.backlinkCount === 1 ? "" : "s"
          }`;

          return (
            <li key={note.slug}>
              <Link
                href={`/wiki/${note.slug}`}
                className="group focus-visible:ring-ring hover:bg-accent/60 grid min-h-9 grid-cols-[1.75rem_1fr] items-start gap-x-3 gap-y-2 rounded-md px-1.5 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="catalog-meta text-muted-foreground pt-0.5 tabular-nums">
                  {rank}
                </span>

                <span className="min-w-0">
                  {/* Title row: dot · title · backlinks — all on one line, no overflow */}
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: meta.accent }}
                    />
                    <span className="text-foreground group-hover:text-primary line-clamp-1 min-w-0 flex-1 text-sm font-medium transition-colors">
                      {note.title}
                    </span>
                    <span className="catalog-meta text-muted-foreground shrink-0 tabular-nums">
                      {backlinks}
                    </span>
                  </span>

                  {/* Lollipop: hairline track + accent segment ending in a small dot */}
                  <span
                    aria-hidden
                    className="relative ml-4 mt-2 flex h-1.5 items-center"
                  >
                    <span className="bg-border/70 absolute inset-x-0 h-px rounded-full" />
                    <span
                      className="absolute left-0 h-px rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%`, background: meta.accent }}
                    />
                    <span
                      className="absolute size-1.5 -translate-x-1/2 rounded-full"
                      style={{ left: `${pct}%`, background: meta.accent }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
