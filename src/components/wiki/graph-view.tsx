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
}

export function GraphView({ graph }: GraphViewProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <SigmaGraph graph={graph} />

      {/* Encoding caption */}
      <div className="bg-card/80 pointer-events-none absolute top-3 left-3 rounded-lg border px-3 py-2.5 text-xs shadow-sm backdrop-blur">
        <div className="text-foreground font-medium tracking-tight">
          {graph.nodes.length} notes · {graph.links.length} links
        </div>
        <div className="text-muted-foreground mt-1 leading-relaxed">
          Colored by <span className="text-foreground">cluster</span> · sized by{" "}
          <span className="text-foreground">PageRank</span>
        </div>
      </div>

      {/* Hint */}
      <div className="text-muted-foreground pointer-events-none absolute bottom-3 left-3 text-xs">
        Click a node to open · hover to isolate · scroll to zoom · drag to pan
      </div>
    </div>
  );
}
