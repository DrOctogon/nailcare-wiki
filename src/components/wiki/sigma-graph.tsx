"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import { Layers, RotateCcw, ScanEye, Search, X } from "lucide-react";

import type { WikiGraph } from "@/lib/wiki/types";
import { DIR_ORDER, dirMeta } from "@/lib/wiki/labels";

interface SigmaGraphProps {
  graph: WikiGraph;
  /** slug → tags, only for graph nodes that carry tags (payload kept small). */
  nodeTags: Record<string, string[]>;
  /** Most common tags among graph nodes, most frequent first. */
  topTags: { tag: string; count: number }[];
}

// Distinct, theme-agnostic cluster palette (reads well on the card background
// in both light and dark). Community index maps into this cyclically.
const COMMUNITY_COLORS = [
  "#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#ef4444",
  "#8b5cf6", "#14b8a6", "#f97316", "#06b6d4", "#a855f7", "#84cc16",
  "#e11d48", "#0ea5e9", "#d946ef", "#22c55e",
];

// Dim/emphasis colors shared by hover isolation and filter reducers.
const DIM_NODE = "rgba(150,150,150,0.15)";
const DIM_EDGE = "rgba(130,130,130,0.05)";
const HOVER_EDGE = "rgba(120,120,120,0.55)";

function colorForCommunity(community: number): string {
  return COMMUNITY_COLORS[community % COMMUNITY_COLORS.length];
}

function sizeForPagerank(pagerank: number, maxPagerank: number): number {
  const ratio = maxPagerank > 0 ? pagerank / maxPagerank : 0;
  return 3 + Math.sqrt(ratio) * 15;
}

interface NodeMeta {
  dir: string;
  titleLower: string;
  /** Lowercased tags for case-insensitive matching. */
  tags: string[];
}

/** A camera-focus request; `key` forces re-fire even for the same node. */
interface FocusRequest {
  id: string;
  key: number;
}

/** Builds the graphology graph and loads it into Sigma once. */
function LoadGraph({ graph }: { graph: WikiGraph }) {
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

interface FilterControllerProps {
  nodeMeta: Map<string, NodeMeta>;
  /** Currently-shown collections. When it equals every dir, no dir filtering. */
  activeDirs: ReadonlySet<string>;
  allDirCount: number;
  selectedTag: string | null;
  queryLower: string;
  /** When non-null, only these ids pass — the selected node + its neighbors. */
  focusSet: ReadonlySet<string> | null;
  focusNeighbors: boolean;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  focusRequest: FocusRequest | null;
}

/**
 * Applies all interactive filters through Sigma's node/edge reducers (never a
 * graph rebuild, so the precomputed ForceAtlas2 layout stays stable), wires
 * hover isolation, click-to-navigate / click-to-focus, and camera centering.
 *
 * Interaction model:
 *  - Focus-neighbors OFF (default): clicking a node navigates to /wiki/{id}.
 *  - Focus-neighbors ON: the first click on a node *selects* it (dimming
 *    everything but it and its 1-hop neighbors); clicking that same, already
 *    selected node again navigates to it. Clicking empty canvas clears the
 *    selection. A dedicated "Open" affordance in the toolbar navigates too.
 */
function FilterController({
  nodeMeta,
  activeDirs,
  allDirCount,
  selectedTag,
  queryLower,
  focusSet,
  focusNeighbors,
  selectedNode,
  onSelectNode,
  focusRequest,
}: FilterControllerProps) {
  const router = useRouter();
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const setSettings = useSetSettings();

  const [hovered, setHovered] = useState<string | null>(null);

  // Keep the latest interaction inputs in refs so click handlers stay fresh
  // without re-registering events on every state change. Writing refs in an
  // effect (not during render) satisfies react-hooks/refs.
  const focusNeighborsRef = useRef(focusNeighbors);
  const selectedNodeRef = useRef(selectedNode);
  useEffect(() => {
    focusNeighborsRef.current = focusNeighbors;
    selectedNodeRef.current = selectedNode;
  }, [focusNeighbors, selectedNode]);

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        if (focusNeighborsRef.current) {
          if (selectedNodeRef.current === node) {
            router.push(`/wiki/${node}`);
          } else {
            onSelectNode(node);
          }
        } else {
          router.push(`/wiki/${node}`);
        }
      },
      clickStage: () => {
        if (focusNeighborsRef.current) onSelectNode(null);
      },
      enterNode: ({ node }) => setHovered(node),
      leaveNode: () => setHovered(null),
    });
  }, [registerEvents, router, onSelectNode]);

  // Recompute the reducers whenever any filter or hover input changes.
  useEffect(() => {
    const g = sigma.getGraph();
    const tagLower = selectedTag?.toLowerCase() ?? null;
    const hasDirFilter = activeDirs.size < allDirCount;
    const hoverSet = hovered
      ? new Set<string>([hovered, ...g.neighbors(hovered)])
      : null;

    const matchNode = (id: string): boolean => {
      const m = nodeMeta.get(id);
      if (!m) return false;
      if (hasDirFilter && !activeDirs.has(m.dir)) return false;
      if (tagLower && !m.tags.includes(tagLower)) return false;
      if (focusSet && !focusSet.has(id)) return false;
      return true;
    };

    setSettings({
      nodeReducer: (node, data) => {
        if (!matchNode(node)) return { ...data, hidden: true };
        if (hoverSet) {
          return hoverSet.has(node)
            ? data
            : { ...data, color: DIM_NODE, label: "" };
        }
        if (queryLower && !nodeMeta.get(node)?.titleLower.includes(queryLower)) {
          return { ...data, color: DIM_NODE, label: "" };
        }
        return data;
      },
      edgeReducer: (edge, data) => {
        const [s, t] = g.extremities(edge);
        if (!matchNode(s) || !matchNode(t)) return { ...data, hidden: true };
        if (hoverSet) {
          return s === hovered || t === hovered
            ? { ...data, color: HOVER_EDGE }
            : { ...data, hidden: true };
        }
        if (queryLower) {
          const sm = nodeMeta.get(s)?.titleLower.includes(queryLower);
          const tm = nodeMeta.get(t)?.titleLower.includes(queryLower);
          if (!sm && !tm) return { ...data, color: DIM_EDGE };
        }
        return data;
      },
    });
  }, [
    sigma,
    setSettings,
    nodeMeta,
    activeDirs,
    allDirCount,
    selectedTag,
    queryLower,
    focusSet,
    hovered,
  ]);

  // Center + zoom the camera on a requested node (search Enter / suggestion).
  useEffect(() => {
    if (!focusRequest) return;
    const disp = sigma.getNodeDisplayData(focusRequest.id);
    if (!disp) return;
    void sigma
      .getCamera()
      .animate({ x: disp.x, y: disp.y, ratio: 0.4 }, { duration: 500 });
  }, [focusRequest, sigma]);

  return null;
}

const settings = {
  allowInvalidContainer: true,
  defaultEdgeColor: "rgba(130,130,130,0.14)",
  labelColor: { attribute: "color" as const },
  labelDensity: 0.6,
  labelGridCellSize: 70,
  labelRenderedSizeThreshold: 7,
  labelFont: "ui-sans-serif, system-ui, sans-serif",
  zIndex: true,
};

export default function SigmaGraph({
  graph,
  nodeTags,
  topTags,
}: SigmaGraphProps) {
  const router = useRouter();

  // ---- Derived lookups (stable per graph) --------------------------------
  const nodeMeta = useMemo(() => {
    const map = new Map<string, NodeMeta>();
    for (const n of graph.nodes) {
      map.set(n.id, {
        dir: n.dir,
        titleLower: n.title.toLowerCase(),
        tags: (nodeTags[n.id] ?? []).map((t) => t.toLowerCase()),
      });
    }
    return map;
  }, [graph.nodes, nodeTags]);

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graph.nodes) map.set(n.id, n.title);
    return map;
  }, [graph.nodes]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      let s = map.get(a);
      if (!s) map.set(a, (s = new Set()));
      s.add(b);
    };
    for (const l of graph.links) {
      add(l.source, l.target);
      add(l.target, l.source);
    }
    return map;
  }, [graph.links]);

  const orderedDirs = useMemo(() => {
    const present = [...new Set(graph.nodes.map((n) => n.dir))];
    return present.sort((a, b) => {
      const ia = DIR_ORDER.indexOf(a);
      const ib = DIR_ORDER.indexOf(b);
      const ra = ia === -1 ? DIR_ORDER.length : ia;
      const rb = ib === -1 ? DIR_ORDER.length : ib;
      return ra - rb || a.localeCompare(b);
    });
  }, [graph.nodes]);

  // ---- Filter state -------------------------------------------------------
  const [activeDirs, setActiveDirs] = useState<Set<string>>(
    () => new Set(orderedDirs),
  );
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focusNeighbors, setFocusNeighbors] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const nonceRef = useRef(0);

  const queryLower = query.trim().toLowerCase();

  const focusSet = useMemo(() => {
    if (!focusNeighbors || !selectedNode) return null;
    const s = new Set<string>([selectedNode]);
    for (const nb of adjacency.get(selectedNode) ?? []) s.add(nb);
    return s;
  }, [focusNeighbors, selectedNode, adjacency]);

  // Nodes passing the hard filters (dir AND tag AND focus) — drives the count.
  const shownIds = useMemo(() => {
    const tagLower = selectedTag?.toLowerCase() ?? null;
    const hasDirFilter = activeDirs.size < orderedDirs.length;
    const ids = new Set<string>();
    for (const n of graph.nodes) {
      const m = nodeMeta.get(n.id);
      if (!m) continue;
      if (hasDirFilter && !activeDirs.has(m.dir)) continue;
      if (tagLower && !m.tags.includes(tagLower)) continue;
      if (focusSet && !focusSet.has(n.id)) continue;
      ids.add(n.id);
    }
    return ids;
  }, [graph.nodes, nodeMeta, activeDirs, orderedDirs.length, selectedTag, focusSet]);

  const searchMatches = useMemo(() => {
    if (!queryLower) return [];
    return graph.nodes.filter(
      (n) => shownIds.has(n.id) && n.title.toLowerCase().includes(queryLower),
    );
  }, [graph.nodes, shownIds, queryLower]);

  // ---- Handlers -----------------------------------------------------------
  const onSelectNode = useCallback(
    (id: string | null) => setSelectedNode(id),
    [],
  );

  const focusOn = useCallback((id: string) => {
    nonceRef.current += 1;
    setFocusRequest({ id, key: nonceRef.current });
  }, []);

  const toggleDir = useCallback((dir: string) => {
    setActiveDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);

  const handleSearchSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const first = searchMatches[0];
      if (first) focusOn(first.id);
    },
    [searchMatches, focusOn],
  );

  const handleSuggestion = useCallback(
    (id: string) => {
      setQuery(titleById.get(id) ?? "");
      focusOn(id);
    },
    [titleById, focusOn],
  );

  const reset = useCallback(() => {
    setActiveDirs(new Set(orderedDirs));
    setSelectedTag(null);
    setQuery("");
    setFocusNeighbors(false);
    setSelectedNode(null);
    setFocusRequest(null);
  }, [orderedDirs]);

  const total = graph.nodes.length;
  const shown = shownIds.size;
  const filtersActive =
    activeDirs.size < orderedDirs.length ||
    selectedTag !== null ||
    query.trim() !== "" ||
    focusNeighbors ||
    selectedNode !== null;

  if (graph.nodes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full w-full items-center justify-center text-sm">
        No connections to display yet.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <SigmaContainer
        style={{ height: "100%", width: "100%", background: "transparent" }}
        settings={settings}
      >
        <LoadGraph graph={graph} />
        <FilterController
          nodeMeta={nodeMeta}
          activeDirs={activeDirs}
          allDirCount={orderedDirs.length}
          selectedTag={selectedTag}
          queryLower={queryLower}
          focusSet={focusSet}
          focusNeighbors={focusNeighbors}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
          focusRequest={focusRequest}
        />
      </SigmaContainer>

      {/* ---- Controls toolbar --------------------------------------------- */}
      <div className="bg-card/85 absolute top-3 left-3 z-10 w-[min(20rem,calc(100%-1.5rem))] rounded-xl border p-3 shadow-sm backdrop-blur">
        {/* Search-to-focus */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes… (Enter to focus)"
            aria-label="Search notes by title"
            className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border pr-7 pl-8 text-xs outline-none focus-visible:ring-2"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Suggestions */}
          {query.trim() !== "" && searchMatches.length > 0 && (
            <ul className="bg-popover absolute top-9 z-20 max-h-44 w-full overflow-auto rounded-md border p-1 text-xs shadow-md">
              {searchMatches.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleSuggestion(n.id)}
                    className="hover:bg-accent hover:text-accent-foreground block w-full truncate rounded px-2 py-1 text-left"
                  >
                    {n.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        {/* Collection chips */}
        <div className="mt-3">
          <div className="text-muted-foreground mb-1.5 flex items-center gap-1 text-[0.65rem] font-medium tracking-wide uppercase">
            <Layers className="h-3 w-3" /> Collections
          </div>
          <div className="flex flex-wrap gap-1">
            {orderedDirs.map((dir) => {
              const on = activeDirs.has(dir);
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => toggleDir(dir)}
                  aria-pressed={on}
                  className={
                    "rounded-full border px-2 py-0.5 text-[0.7rem] transition-colors " +
                    (on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:text-foreground")
                  }
                >
                  {dirMeta(dir).label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tag filter */}
        {topTags.length > 0 && (
          <div className="mt-3">
            <label className="text-muted-foreground mb-1.5 block text-[0.65rem] font-medium tracking-wide uppercase">
              Tag
            </label>
            <select
              value={selectedTag ?? ""}
              onChange={(e) => setSelectedTag(e.target.value || null)}
              aria-label="Filter by tag"
              className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-xs outline-none focus-visible:ring-2"
            >
              <option value="">All tags</option>
              {topTags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Focus-neighbors toggle + selection */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFocusNeighbors((v) => !v)}
            aria-pressed={focusNeighbors}
            className={
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors " +
              (focusNeighbors
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:text-foreground")
            }
          >
            <ScanEye className="h-3.5 w-3.5" /> Focus neighbors
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!filtersActive}
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>

        {focusNeighbors && (
          <div className="text-muted-foreground mt-2 text-[0.7rem] leading-relaxed">
            {selectedNode ? (
              <span className="flex items-center gap-1.5">
                <span className="text-foreground truncate font-medium">
                  {titleById.get(selectedNode)}
                </span>
                <button
                  type="button"
                  onClick={() => router.push(`/wiki/${selectedNode}`)}
                  className="text-primary shrink-0 underline underline-offset-2"
                >
                  Open
                </button>
              </span>
            ) : (
              "Click a node to isolate it and its neighbors."
            )}
          </div>
        )}

        {/* Count readout */}
        <div className="text-muted-foreground mt-3 border-t pt-2 text-[0.7rem]">
          Showing{" "}
          <span className="text-foreground font-medium">
            {shown.toLocaleString()}
          </span>{" "}
          of {total.toLocaleString()} notes
          {query.trim() !== "" && (
            <> · {searchMatches.length.toLocaleString()} match</>
          )}
          <div className="mt-0.5">
            Colored by <span className="text-foreground">cluster</span> · sized by{" "}
            <span className="text-foreground">PageRank</span>
          </div>
        </div>
      </div>
    </div>
  );
}
