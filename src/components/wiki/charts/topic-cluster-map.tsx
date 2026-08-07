"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { scaleLinear, scaleSqrt } from "d3-scale";

import type { TopicClusters } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";
import { useMeasure } from "./use-measure";

interface TopicClusterMapProps {
  data: TopicClusters;
}

// Padding (px) reserved around the scatter so bubbles — even the largest, in
// their hovered/enlarged state — never clip against the container edge.
const PAD = 18;
const MIN_R = 2;
const MAX_R = 11;
const HOVER_SCALE = 1.35;
const IDLE_OPACITY = 0.85;
const DIM_OPACITY = 0.35;

// Cohesive palette: fixed lightness + chroma, hue rotated by the golden angle so
// adjacent community indices land far apart on the wheel yet stay tonally
// unified (deliberate, lacquered — not clown colors). Consistent per community.
function colorForCommunity(community: number): string {
  const hue = ((community * 137.5) % 360 + 360) % 360;
  return `oklch(0.62 0.13 ${hue.toFixed(1)})`;
}

interface Placed {
  node: TopicClusters["nodes"][number];
  cx: number;
  cy: number;
  r: number;
  color: string;
}

export function TopicClusterMap({ data }: TopicClusterMapProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);
  const router = useRouter();

  const height = Math.round(width * 0.62);

  const placed = useMemo<Placed[]>(() => {
    if (width <= 0 || data.nodes.length === 0) return [];

    // Fit the raw layout bounds into the padded container.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minPR = Infinity;
    let maxPR = -Infinity;
    for (const n of data.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
      if (n.pagerank < minPR) minPR = n.pagerank;
      if (n.pagerank > maxPR) maxPR = n.pagerank;
    }

    const x = scaleLinear()
      .domain([minX, maxX === minX ? minX + 1 : maxX])
      .range([PAD, width - PAD]);
    const y = scaleLinear()
      .domain([minY, maxY === minY ? minY + 1 : maxY])
      .range([PAD, height - PAD]);
    // sqrt scale → radius, so bubble *area* reads proportional to PageRank.
    const r = scaleSqrt()
      .domain([minPR, maxPR === minPR ? minPR + 1 : maxPR])
      .range([MIN_R, MAX_R]);

    const items = data.nodes.map((node) => ({
      node,
      cx: x(node.x),
      cy: y(node.y),
      r: r(node.pagerank),
      color: colorForCommunity(node.community),
    }));
    // Draw large bubbles first so small ones settle on top and stay hittable.
    items.sort((a, b) => b.r - a.r);
    return items;
  }, [data.nodes, width, height]);

  if (data.nodes.length === 0) return null;

  const activeLabel = hovered
    ? placed.find((p) => p.node.id === hovered) ?? null
    : null;

  // Ensure the hovered bubble renders last (on top) so its enlargement shows.
  const ordered = activeLabel
    ? [...placed.filter((p) => p.node.id !== hovered), activeLabel]
    : placed;

  return (
    <div ref={ref} className="relative w-full overflow-hidden">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Topic clusters — notes grouped by link community"
        >
          {ordered.map((p) => {
            const active = hovered === p.node.id;
            const dim = hovered !== null && !active;
            return (
              <circle
                key={p.node.id}
                cx={p.cx}
                cy={p.cy}
                r={active ? p.r * HOVER_SCALE : p.r}
                fill={p.color}
                opacity={dim ? DIM_OPACITY : active ? 1 : IDLE_OPACITY}
                stroke="var(--background)"
                strokeWidth={0.75}
                className="cursor-pointer"
                style={{
                  transition: "r 0.15s ease, opacity 0.15s ease",
                }}
                onPointerEnter={() => setHovered(p.node.id)}
                onPointerLeave={() =>
                  setHovered((cur) => (cur === p.node.id ? null : cur))
                }
                onClick={() => router.push(`/wiki/${p.node.id}`)}
              >
                <title>{p.node.title}</title>
              </circle>
            );
          })}
        </svg>
      )}

      {/* Floating label near the hovered bubble, clamped inside the container. */}
      {activeLabel && (
        <div
          className="pointer-events-none absolute z-10 max-w-[min(16rem,calc(100%-1rem))]"
          style={{
            left: activeLabel.cx,
            top: Math.max(4, activeLabel.cy - activeLabel.r - 8),
            transform:
              activeLabel.cx > width / 2
                ? "translate(-100%, -100%)"
                : "translate(0, -100%)",
          }}
        >
          <div className="bg-card/95 rounded-md border px-2 py-1 shadow-sm backdrop-blur">
            <div className="text-foreground truncate text-xs font-medium">
              {activeLabel.node.title}
            </div>
            <div className="catalog-meta mt-0.5 text-[0.6rem]">
              {dirMeta(activeLabel.node.dir).label}
            </div>
          </div>
        </div>
      )}

      <p className="catalog-meta mt-3 text-[0.65rem]">
        {data.nodes.length} notes · {data.communities} clusters · sized by
        PageRank
      </p>
    </div>
  );
}
