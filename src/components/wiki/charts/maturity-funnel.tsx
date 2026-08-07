"use client";

import { useMemo, useState } from "react";

import type { MaturityStage } from "@/lib/wiki/vault";
import { useMeasure } from "./use-measure";

interface MaturityFunnelProps {
  data: MaturityStage[];
}

/**
 * Lacquer color ramp across the maturity ladder: earlier stages read cool and
 * quiet (mostly `--chart-2`), later stages deepen toward the oxblood `--primary`
 * lacquer. `t` runs 0 (seed) → 1 (mature).
 */
function ladderFill(t: number): string {
  const primaryPct = Math.round(18 + t * 67); // 18% → 85% primary
  return `color-mix(in oklch, var(--primary) ${primaryPct}%, var(--chart-2))`;
}

/** Off-pipeline "other" stage — a neutral ledger gray, clearly not lacquer. */
const OTHER_FILL = "color-mix(in oklch, var(--muted-foreground) 30%, var(--muted))";

export function MaturityFunnel({ data }: MaturityFunnelProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const ladder = data.filter((d) => d.status !== "other");
    const ladderTotal = ladder.reduce((s, d) => s + d.count, 0);
    const total = data.reduce((s, d) => s + d.count, 0);
    const maxLadder = ladder.reduce((m, d) => Math.max(m, d.count), 1);
    const denom = ladderTotal > 0 ? ladderTotal : total || 1;
    const top = ladder.reduce<MaturityStage | null>(
      (best, d) => (best && best.count >= d.count ? best : d),
      null,
    );
    return { ladder, ladderTotal, total, maxLadder, denom, top };
  }, [data]);

  if (model.total === 0) return null;

  const compact = width > 0 && width < 360;
  const { ladder, maxLadder, denom, total, top } = model;

  const summary =
    `Knowledge maturity distribution across ${ladder.length} ladder ` +
    `stage${ladder.length === 1 ? "" : "s"}, ${total} notes total` +
    (top ? `; largest stage ${top.label} (${top.count}).` : ".");

  return (
    <div ref={ref} className="w-full overflow-hidden" role="img" aria-label={summary}>
      <ul className="flex flex-col" onMouseLeave={() => setHover(null)}>
        {data.map((stage, i) => {
          const isOther = stage.status === "other";
          const ladderIndex = isOther ? -1 : i;
          const t = ladder.length > 1 ? ladderIndex / (ladder.length - 1) : 1;
          const fill = isOther ? OTHER_FILL : ladderFill(Math.max(0, Math.min(1, t)));

          const proportion = Math.min(100, (stage.count / maxLadder) * 100);
          // Zero-count ladder stages keep a thin baseline so the pipeline's full
          // shape stays legible; non-zero stages get a small floor for visibility.
          const barWidth =
            stage.count === 0 ? "0.5rem" : `${Math.max(4, proportion)}%`;

          const pct = Math.round((stage.count / denom) * 100);
          const dim = hover !== null && hover !== i;

          return (
            <li
              key={stage.status}
              onMouseEnter={() => setHover(i)}
              className={[
                "group grid items-center gap-3 py-1 transition-opacity duration-200",
                compact
                  ? "grid-cols-[5rem_1fr_3rem]"
                  : "grid-cols-[6.5rem_1fr_3.25rem]",
                dim ? "opacity-45" : "opacity-100",
                isOther ? "border-border/60 mt-1 border-t pt-2" : "",
              ].join(" ")}
            >
              <span
                className="text-muted-foreground group-hover:text-foreground min-w-0 truncate text-right text-sm transition-colors"
                title={stage.label}
              >
                {stage.label}
              </span>

              <span className="relative flex h-7 items-center justify-center">
                <span
                  className="h-full rounded-md transition-[width,filter] duration-500 ease-out group-hover:brightness-110"
                  style={{ width: barWidth, background: fill }}
                />
              </span>

              <span className="flex flex-col items-end leading-tight">
                <span className="text-foreground font-mono text-sm tabular-nums">
                  {stage.count}
                </span>
                <span className="catalog-meta tabular-nums">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
