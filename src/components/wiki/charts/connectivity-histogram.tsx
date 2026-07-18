"use client";

import { useMemo, useState } from "react";
import { scaleBand, scaleLinear } from "d3-scale";

import type { HistogramBin } from "@/lib/wiki/vault";
import { useMeasure } from "./use-measure";

interface ConnectivityHistogramProps {
  data: HistogramBin[];
}

const HEIGHT = 240;
const MARGIN = { top: 18, right: 8, bottom: 28, left: 32 };

export function ConnectivityHistogram({ data }: ConnectivityHistogramProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { x, y, yTicks } = useMemo(() => {
    const x = scaleBand<string>()
      .domain(data.map((d) => d.label))
      .range([0, innerW])
      .padding(0.28);
    const maxY = data.reduce((m, d) => Math.max(m, d.count), 0);
    const y = scaleLinear().domain([0, maxY || 1]).nice().range([innerH, 0]);
    return { x, y, yTicks: y.ticks(4).map((t) => ({ t, yPos: y(t) })) };
  }, [data, innerW, innerH]);

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Distribution of pages by backlink count"
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
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

            {data.map((bin, i) => {
              const bx = x(bin.label) ?? 0;
              const bw = x.bandwidth();
              const by = y(bin.count);
              const bh = innerH - by;
              const active = hover === i;
              return (
                <g
                  key={bin.label}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                >
                  {/* full-height hit target */}
                  <rect x={bx} y={0} width={bw} height={innerH} fill="transparent" />
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={Math.max(0, bh)}
                    rx={4}
                    fill="var(--chart-1)"
                    opacity={hover === null || active ? 1 : 0.5}
                  />
                  <text
                    x={bx + bw / 2}
                    y={by - 6}
                    textAnchor="middle"
                    className="fill-foreground"
                    fontSize={11}
                    fontWeight={active ? 600 : 400}
                  >
                    {bin.count}
                  </text>
                  <text
                    x={bx + bw / 2}
                    y={innerH + 18}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={11}
                  >
                    {bin.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
