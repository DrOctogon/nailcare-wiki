"use client";

import { useId, useMemo, useState } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { area, line, curveStepAfter } from "d3-shape";
import { bisector } from "d3-array";
import { timeFormat } from "d3-time-format";

import type { GrowthPoint } from "@/lib/wiki/vault";
import { useMeasure } from "./use-measure";

interface GrowthAreaChartProps {
  data: GrowthPoint[];
}

interface Row extends GrowthPoint {
  d: Date;
}

const HEIGHT = 240;
const MARGIN = { top: 14, right: 18, bottom: 26, left: 40 };
const fmtAxis = timeFormat("%b %-d");
const fmtFull = timeFormat("%b %-d, %Y");
const bisectDate = bisector<Row, Date>((r) => r.d).center;

export function GrowthAreaChart({ data }: GrowthAreaChartProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const gradientId = useId();
  const [hover, setHover] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(
    () => data.map((p) => ({ ...p, d: new Date(`${p.date}T00:00:00`) })),
    [data],
  );

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { x, y, areaPath, linePath, xTicks, yTicks } = useMemo(() => {
    const x = scaleTime()
      .domain([rows[0]?.d ?? new Date(), rows[rows.length - 1]?.d ?? new Date()])
      .range([0, innerW]);
    const maxY = rows.length ? rows[rows.length - 1].cumulative : 0;
    const y = scaleLinear().domain([0, maxY || 1]).nice().range([innerH, 0]);

    const areaGen = area<Row>()
      .x((r) => x(r.d))
      .y0(innerH)
      .y1((r) => y(r.cumulative))
      .curve(curveStepAfter);
    const lineGen = line<Row>()
      .x((r) => x(r.d))
      .y((r) => y(r.cumulative))
      .curve(curveStepAfter);

    return {
      x,
      y,
      areaPath: areaGen(rows) ?? "",
      linePath: lineGen(rows) ?? "",
      xTicks: x.ticks(Math.min(5, rows.length)).map((t) => ({ t, xPos: x(t) })),
      yTicks: y.ticks(4).map((t) => ({ t, yPos: y(t) })),
    };
  }, [rows, innerW, innerH]);

  if (rows.length === 0) {
    return (
      <div className="catalog-meta flex h-[240px] items-center justify-center">
        No dated pages yet.
      </div>
    );
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - bounds.left;
    const date = x.invert(mx);
    const idx = bisectDate(rows, date);
    setHover(rows[Math.max(0, Math.min(idx, rows.length - 1))] ?? null);
  };

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Cumulative pages over time">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* Y grid + labels */}
            {yTicks.map(({ t, yPos }) => (
              <g key={t}>
                <line
                  x1={0}
                  x2={innerW}
                  y1={yPos}
                  y2={yPos}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
                <text
                  x={-8}
                  y={yPos}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground"
                  fontSize={11}
                >
                  {t}
                </text>
              </g>
            ))}
            {/* X labels */}
            {xTicks.map(({ t, xPos }) => (
              <text
                key={t.getTime()}
                x={xPos}
                y={innerH + 18}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={11}
              >
                {fmtAxis(t)}
              </text>
            ))}

            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
              d={linePath}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover crosshair + marker */}
            {hover && (
              <g>
                <line
                  x1={x(hover.d)}
                  x2={x(hover.d)}
                  y1={0}
                  y2={innerH}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.6}
                />
                <circle
                  cx={x(hover.d)}
                  cy={y(hover.cumulative)}
                  r={4.5}
                  fill="var(--chart-1)"
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              </g>
            )}

            {/* Capture layer */}
            <rect
              x={0}
              y={0}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </g>
        </svg>
      )}

      {hover && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: MARGIN.left + x(hover.d),
            top: MARGIN.top + y(hover.cumulative) - 10,
          }}
        >
          <div className="font-medium tabular-nums">{hover.cumulative} pages</div>
          <div className="text-muted-foreground">
            {fmtFull(hover.d)} · +{hover.added}
          </div>
        </div>
      )}
    </div>
  );
}
