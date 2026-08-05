"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import type { WikiGraph } from "@/lib/wiki/types";

// Sigma renders with WebGL and touches the DOM/canvas, so it must stay on the
// client. Dynamic-import with ssr:false keeps it out of the RSC pass entirely.
const SigmaGraph = dynamic(() => import("./sigma-graph"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full w-full items-center justify-center gap-2 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Building the graph…
    </div>
  ),
});

interface GraphViewProps {
  graph: WikiGraph;
  /** slug → tags, only for graph nodes that carry tags (payload kept small). */
  nodeTags: Record<string, string[]>;
  /** Most common tags among graph nodes, most frequent first. */
  topTags: { tag: string; count: number }[];
}

export function GraphView({ graph, nodeTags, topTags }: GraphViewProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <SigmaGraph graph={graph} nodeTags={nodeTags} topTags={topTags} />

      {/* Hint */}
      <div className="text-muted-foreground pointer-events-none absolute right-3 bottom-3 text-right text-xs">
        Click a node to open · hover to isolate · toggle Focus to explore
        neighbors · scroll to zoom · drag to pan
      </div>
    </div>
  );
}
