"use client";

import Link from "next/link";

import type { CollectionSize } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";

interface CollectionsBarChartProps {
  data: CollectionSize[];
}

export function CollectionsBarChart({ data }: CollectionsBarChartProps) {
  const max = data.reduce((m, d) => Math.max(m, d.count), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((row) => {
        const meta = dirMeta(row.dir);
        const pct = Math.max(2, (row.count / max) * 100);
        return (
          <li key={row.dir}>
            <Link
              href={`/browse/${row.dir}`}
              className="group grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3"
            >
              <span className="text-muted-foreground group-hover:text-foreground truncate text-right text-sm transition-colors">
                {meta.label}
              </span>
              <span className="bg-muted/60 relative h-6 overflow-hidden rounded-md">
                <span
                  className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 group-hover:brightness-110"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: "var(--chart-1)",
                  }}
                />
              </span>
              <span className="text-foreground text-right text-sm font-medium tabular-nums">
                {row.count}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
