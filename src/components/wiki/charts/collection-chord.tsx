"use client";

import { useMemo, useState } from "react";
import { descending } from "d3-array";
import { chord as d3chord, ribbon as d3ribbon } from "d3-chord";
import type { Chord, ChordGroup, ChordSubgroup } from "d3-chord";
import { arc as d3arc } from "d3-shape";

import type { CollectionChords } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";
import { useMeasure } from "./use-measure";

interface CollectionChordProps {
  data: CollectionChords;
}

/** Square cap so the diagram never dominates the dashboard card. */
const MAX_SIZE = 400;

// Opacity tiers for the ribbons (a ribbon = a link bundle between two arcs).
const RIBBON_REST = 0.35; // idle
const RIBBON_ON = 0.85; // touches the hovered group
const RIBBON_OFF = 0.12; // dimmed while another group is hovered

/**
 * Chord diagram of inter-collection links. Each collection is an arc on the
 * ring; each ribbon is the flow of links between two collections, colored by
 * its SOURCE collection's accent. Hovering an arc isolates the flows that
 * touch it. Square, responsive, and label-safe down to ~390px.
 */
export function CollectionChord({ data }: CollectionChordProps) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const total = useMemo(
    () => data.matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0),
    [data.matrix],
  );

  // Layout is radius-independent — depends only on the matrix.
  const chords = useMemo(() => {
    const layout = d3chord().padAngle(0.06).sortSubgroups(descending);
    return layout(data.matrix);
  }, [data.matrix]);

  // Square: the SVG side is the measured width, capped.
  const size = Math.min(width, MAX_SIZE);
  const outerR = size * 0.3;
  const ringThickness = Math.max(8, size * 0.03);
  const innerR = outerR - ringThickness;
  const labelPad = 7;
  const labelFontPx = size < 380 ? 8 : 9;
  // Chars that fit radially between the ring and the viewBox edge (conservative
  // mono advance ≈ 0.68em) — so long labels abbreviate instead of clipping.
  const maxChars = Math.max(
    3,
    Math.floor((size / 2 - outerR - labelPad) / (labelFontPx * 0.68)),
  );

  const arcGen = useMemo(
    () => d3arc<ChordGroup>().innerRadius(innerR).outerRadius(outerR),
    [innerR, outerR],
  );
  const ribbonGen = useMemo(
    () => d3ribbon<Chord, ChordSubgroup>().radius(innerR),
    [innerR],
  );

  if (data.dirs.length === 0 || total === 0) return null;

  const truncate = (label: string) =>
    label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}…` : label;

  return (
    <div ref={ref} className="flex w-full justify-center overflow-hidden">
      {size > 0 && (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Links between collections, chord diagram"
        >
          <g transform={`translate(${size / 2},${size / 2})`}>
            {/* Ribbons (link bundles) sit beneath the ring. */}
            <g>
              {chords.map((d: Chord, i) => {
                const srcAccent = dirMeta(data.dirs[d.source.index]).accent;
                const active =
                  hover === null ||
                  d.source.index === hover ||
                  d.target.index === hover;
                const opacity =
                  hover === null
                    ? RIBBON_REST
                    : active
                      ? RIBBON_ON
                      : RIBBON_OFF;
                const srcLabel = dirMeta(data.dirs[d.source.index]).label;
                const tgtLabel = dirMeta(data.dirs[d.target.index]).label;
                return (
                  <path
                    key={`ribbon-${i}`}
                    d={ribbonGen(d) ?? undefined}
                    fill={srcAccent}
                    stroke="var(--background)"
                    strokeWidth={0.5}
                    style={{ opacity, transition: "opacity 0.2s ease" }}
                  >
                    <title>{`${d.source.value} links · ${srcLabel} → ${tgtLabel}`}</title>
                  </path>
                );
              })}
            </g>

            {/* Group arcs + radial labels; each is a hover target. */}
            {chords.groups.map((group: ChordGroup) => {
              const dir = data.dirs[group.index];
              const meta = dirMeta(dir);
              const angle = (group.startAngle + group.endAngle) / 2;
              const rotate = (angle * 180) / Math.PI - 90;
              const flip = angle > Math.PI;
              const dim = hover !== null && hover !== group.index;
              return (
                <g
                  key={`group-${group.index}`}
                  onPointerEnter={() => setHover(group.index)}
                  onPointerLeave={() => setHover(null)}
                  style={{
                    opacity: dim ? 0.45 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
                  <path
                    d={arcGen(group) ?? undefined}
                    fill={meta.accent}
                    stroke="var(--background)"
                    strokeWidth={1}
                  >
                    <title>{meta.label}</title>
                  </path>
                  <g transform={`rotate(${rotate}) translate(${outerR + labelPad},0)`}>
                    <text
                      className="catalog-meta"
                      transform={flip ? "rotate(180)" : undefined}
                      textAnchor={flip ? "end" : "start"}
                      dominantBaseline="middle"
                      style={{ fontSize: labelFontPx, letterSpacing: "0.04em" }}
                    >
                      {truncate(meta.label)}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
