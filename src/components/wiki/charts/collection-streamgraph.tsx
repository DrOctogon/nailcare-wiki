"use client";

import { useMemo, useState } from "react";
import { scaleLinear, scaleUtc } from "d3-scale";
import {
  area,
  curveBasis,
  stack,
  stackOffsetWiggle,
  stackOrderInsideOut,
  type SeriesPoint,
} from "d3-shape";
import { utcFormat } from "d3-time-format";

import type { CollectionGrowthSeries } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";
import { useMeasure } from "./use-measure";

interface CollectionStreamgraphProps {
  data: CollectionGrowthSeries;
}

type Point = CollectionGrowthSeries["points"][number];

const HEIGHT = 260;
const MARGIN = { top: 14, right: 8, bottom: 24, left: 8 };
const fmtMonth = utcFormat("%b");

/**
 * Per-collection growth streamgraph — wiggle-offset stacked bands, one per
 * collection, colored by its sanctioned accent token. A true streamgraph:
 * no y-axis, smooth curveBasis silhouette, month ticks along the base.
 */
export function CollectionStreamgraph({ data }: CollectionStreamgraphProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { dirs, points } = data;

  // Parse the shared x domain as UTC dates, once.
  const dates = useMemo(
    () => points.map((p) => new Date(`${p.date}T00:00:00Z`)),
    [points],
  );

  const { bands, x, xTicks } = useMemo(() => {
    const x = scaleUtc()
      .domain([dates[0] ?? new Date(), dates[dates.length - 1] ?? new Date()])
      .range([0, innerW]);

    const stackGen = stack<Point, string>()
      .keys(dirs)
      .value((p, key) => p.counts[key] ?? 0)
      .offset(stackOffsetWiggle)
      .order(stackOrderInsideOut);

    const series = stackGen(points);

    // Wiggle offsets push values above and below zero — derive the full extent.
    let lo = 0;
    let hi = 0;
    for (const layer of series) {
      for (const s of layer) {
        if (s[0] < lo) lo = s[0];
        if (s[1] > hi) hi = s[1];
      }
    }
    const y = scaleLinear().domain([lo, hi || 1]).range([innerH, 0]);

    const areaGen = area<SeriesPoint<Point>>()
      .x((_, i) => x(dates[i]))
      .y0((s) => y(s[0]))
      .y1((s) => y(s[1]))
      .curve(curveBasis);

    const bands = series.map((layer) => ({
      dir: layer.key,
      d: areaGen(layer) ?? "",
    }));

    return {
      bands,
      x,
      xTicks: x.ticks(Math.min(6, Math.max(2, points.length))),
    };
  }, [dirs, points, dates, innerW, innerH]);

  if (points.length === 0 || dirs.length === 0) return null;

  const active = hover ? dirMeta(hover) : null;
  const latest = hover ? (points[points.length - 1]?.counts[hover] ?? 0) : 0;

  return (
    <div ref={ref} className="w-full">
      {/* Caption row — reserves height so hover never shifts layout. */}
      <div className="catalog-meta mb-2 flex h-4 items-center gap-2">
        {active ? (
          <>
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-[2px]"
              style={{ backgroundColor: active.accent }}
            />
            <span className="text-foreground">{active.label}</span>
            <span className="tabular-nums">{latest}</span>
          </>
        ) : (
          <span>Growth by collection</span>
        )}
      </div>

      <div className="overflow-hidden">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Collection growth over time, streamgraph"
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {bands.map(({ dir, d }) => {
                const accent = dirMeta(dir).accent;
                const opacity =
                  hover === null ? 0.85 : hover === dir ? 1 : 0.35;
                return (
                  <path
                    key={dir}
                    d={d}
                    fill={accent}
                    fillOpacity={opacity}
                    style={{ transition: "fill-opacity 0.2s ease" }}
                    onPointerEnter={() => setHover(dir)}
                    onPointerLeave={() => setHover(null)}
                  >
                    <title>{dirMeta(dir).label}</title>
                  </path>
                );
              })}

              {/* Month ticks along the base — no y-axis (streamgraph convention). */}
              {xTicks.map((t) => (
                <text
                  key={t.getTime()}
                  x={x(t)}
                  y={innerH + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono"
                  fontSize={10}
                >
                  {fmtMonth(t)}
                </text>
              ))}
            </g>
          </svg>
        )}
      </div>

      {/* Legend — one swatch per collection, catalog-card voice. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {dirs.map((dir) => {
          const meta = dirMeta(dir);
          return (
            <button
              key={dir}
              type="button"
              className="catalog-meta flex items-center gap-1.5"
              onPointerEnter={() => setHover(dir)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(dir)}
              onBlur={() => setHover(null)}
              style={{ opacity: hover === null || hover === dir ? 1 : 0.4 }}
            >
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-[2px]"
                style={{ backgroundColor: meta.accent }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
