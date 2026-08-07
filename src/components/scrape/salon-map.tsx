"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";

import { useMeasure } from "@/components/wiki/charts/use-measure";
import worldTopology from "./world-110m.json";

interface SalonMapProps {
  /** [lng, lat] pairs (already filtered); may be up to ~60k. */
  points: [number, number][];
  /** Total matching rows, for the caption. Defaults to points.length. */
  total?: number;
  loading?: boolean;
}

// The vendored world-atlas TopoJSON is loaded once at module scope. It carries
// no runtime type of its own, so we derive `feature`'s expected argument type
// straight from the function signature and cast through `unknown` — fully
// self-contained, no dependency on a `topojson-specification` import.
type TopologyArg = Parameters<typeof feature>[0];
const LAND = feature(
  worldTopology as unknown as TopologyArg,
  (worldTopology as unknown as TopologyArg).objects.countries,
);

const ASPECT = 0.52;
const DOT_RADIUS = 1.4;
const DOT_ALPHA = 0.5;
const HAIRLINE = 0.6;

function readToken(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function SalonMap({ points, total, loading }: SalonMapProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const height = width > 0 ? Math.round(width * ASPECT) : 0;
  const isEmpty = !loading && points.length === 0;

  const caption = useMemo(() => {
    const plotted = points.length.toLocaleString();
    const matches = (total ?? points.length).toLocaleString();
    return `${plotted} plotted · ${matches} matches`;
  }, [points.length, total]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = ref.current;
    if (!canvas || !container || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Retina-crisp backing store; all drawing stays in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Tokens are read from the live container so light/dark themes resolve.
    const land = readToken(container, "--muted") || "#e5e5e5";
    const border = readToken(container, "--border") || "#cccccc";
    const accent = readToken(container, "--primary") || "#7a2230";

    const projection = geoNaturalEarth1().fitSize([width, height], LAND);
    const path = geoPath(projection, ctx);

    // Basemap: quiet land fill + hairline country borders, one path pass.
    ctx.beginPath();
    path(LAND);
    ctx.fillStyle = land;
    ctx.fill();
    ctx.lineWidth = HAIRLINE;
    ctx.strokeStyle = border;
    ctx.stroke();

    // Points: same projection, single pass, low-alpha dots so overlaps in
    // dense regions accumulate into a lacquer glow.
    ctx.fillStyle = accent;
    ctx.globalAlpha = DOT_ALPHA;
    for (let i = 0; i < points.length; i++) {
      const projected = projection(points[i]);
      if (!projected) continue;
      const [px, py] = projected;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      ctx.beginPath();
      ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [ref, width, height, points]);

  // Redraw on size / points change.
  useEffect(() => {
    draw();
  }, [draw]);

  // Best-effort redraw on theme flip (documentElement class toggles).
  useEffect(() => {
    const observer = new MutationObserver(() => draw());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={ref} className="relative w-full">
      <div
        role="img"
        aria-label="Map of salon locations"
        className="w-full overflow-hidden rounded-[var(--radius)] border border-border bg-background"
        style={{ height: height || undefined }}
      >
        {width > 0 && (
          <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 motion-safe:animate-pulse">
            <span className="catalog-meta text-muted-foreground">
              Plotting
            </span>
          </div>
        )}

        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="catalog-meta text-muted-foreground">
              No mapped results
            </span>
          </div>
        )}
      </div>

      <p className="catalog-meta mt-2 text-muted-foreground">{caption}</p>
    </div>
  );
}
