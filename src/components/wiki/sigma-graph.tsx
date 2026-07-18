"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Graph from "graphology";
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";

import type { WikiGraph } from "@/lib/wiki/types";

interface SigmaGraphProps {
  graph: WikiGraph;
}

// Distinct, theme-agnostic cluster palette (reads well on the card background
// in both light and dark). Community index maps into this cyclically.
const COMMUNITY_COLORS = [
  "#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#ef4444",
  "#8b5cf6", "#14b8a6", "#f97316", "#06b6d4", "#a855f7", "#84cc16",
  "#e11d48", "#0ea5e9", "#d946ef", "#22c55e",
];

function colorForCommunity(community: number): string {
  return COMMUNITY_COLORS[community % COMMUNITY_COLORS.length];
}

function sizeForPagerank(pagerank: number, maxPagerank: number): number {
  const ratio = maxPagerank > 0 ? pagerank / maxPagerank : 0;
  return 3 + Math.sqrt(ratio) * 15;
}

/** Builds the graphology graph and loads it into Sigma once. */
function LoadGraph({ graph }: SigmaGraphProps) {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    const maxPagerank = graph.nodes.reduce(
      (max, n) => Math.max(max, n.pagerank),
      0,
    );
    const g = new Graph();
    for (const node of graph.nodes) {
      g.addNode(node.id, {
        x: node.x,
        y: node.y,
        size: sizeForPagerank(node.pagerank, maxPagerank),
        label: node.title,
        color: colorForCommunity(node.community),
      });
    }
    for (const link of graph.links) {
      if (!g.hasNode(link.source) || !g.hasNode(link.target)) continue;
      if (g.hasEdge(link.source, link.target)) continue;
      try {
        g.addEdge(link.source, link.target, {
          size: 0.25,
          color: "rgba(140,140,140,0.10)",
        });
      } catch {
        // ignore parallel/self edges
      }
    }
    loadGraph(g);
  }, [graph, loadGraph]);

  return null;
}

/** Wires click-to-navigate and hover highlighting. */
function GraphEvents({ graph }: SigmaGraphProps) {
  const router = useRouter();
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const setSettings = useSetSettings();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => router.push(`/wiki/${node}`),
      enterNode: ({ node }) => {
        const g = sigma.getGraph();
        const neighbors = new Set(g.neighbors(node));
        neighbors.add(node);
        setSettings({
          nodeReducer: (n, data) => {
            if (neighbors.has(n)) return data;
            return { ...data, color: "rgba(150,150,150,0.15)", label: "" };
          },
          edgeReducer: (edge, data) => {
            const [s, t] = g.extremities(edge);
            if (s === node || t === node) {
              return { ...data, color: "rgba(120,120,120,0.55)" };
            }
            return { ...data, hidden: true };
          },
        });
      },
      leaveNode: () => {
        setSettings({ nodeReducer: null, edgeReducer: null });
      },
    });
  }, [registerEvents, setSettings, sigma, router]);

  return null;
}

export default function SigmaGraph({ graph }: SigmaGraphProps) {
  const settings = useMemo(
    () => ({
      allowInvalidContainer: true,
      defaultEdgeColor: "rgba(130,130,130,0.14)",
      labelColor: { attribute: "color" as const },
      labelDensity: 0.6,
      labelGridCellSize: 70,
      labelRenderedSizeThreshold: 7,
      labelFont: "ui-sans-serif, system-ui, sans-serif",
      zIndex: true,
    }),
    [],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
        No connections to display yet.
      </div>
    );
  }

  return (
    <SigmaContainer
      style={{ height: "100%", width: "100%", background: "transparent" }}
      settings={settings}
    >
      <LoadGraph graph={graph} />
      <GraphEvents graph={graph} />
    </SigmaContainer>
  );
}
