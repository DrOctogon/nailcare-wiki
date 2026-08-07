import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import pagerank from "graphology-metrics/centrality/pagerank.js";
import forceAtlas2 from "graphology-layout-forceatlas2";
import circular from "graphology-layout/circular.js";

import { WIKI_DIR, BROWSE_DIRS } from "./config";
import { slugify, normalizeTitle } from "./slug";
import { renderMarkdown, parseWikiTarget, type Resolver } from "./markdown";
import neighborsData from "./neighbors.json";
import type {
  WikiGraph,
  WikiLink,
  WikiPage,
  WikiPageMeta,
  WikiType,
} from "./types";

const VALID_TYPES = new Set<WikiType>([
  "entity",
  "concept",
  "source",
  "question",
  "comparison",
  "derived",
  "reference",
  "fold",
  "meta",
]);

/**
 * Obsidian pages conventionally repeat the frontmatter title as a leading `# H1`.
 * The page header already renders the title, so strip that duplicate H1 to avoid
 * showing it twice (and to keep it out of the table of contents).
 */
function stripLeadingTitle(body: string, title: string): string {
  const trimmed = body.replace(/^\s+/, "");
  const m = /^#\s+(.+?)\s*(?:\n|$)/.exec(trimmed);
  if (m && normalizeTitle(m[1]) === normalizeTitle(title)) {
    return trimmed.slice(m[0].length);
  }
  return body;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  // YAML parses unquoted ISO dates (created: 2026-07-10) into Date objects.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function buildExcerpt(body: string): string {
  const text = body
    .replace(/^#.*$/gm, "") // drop heading lines
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t) // wikilink → label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // md link → text
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 220) return text;
  return text.slice(0, 217).replace(/\s+\S*$/, "") + "…";
}

/** Max chars of cleaned body shipped per doc in the client search index. */
const SEARCH_BODY_CAP = 600;

/**
 * Cleaned, capped plain-text body for keyword search. Uses the same
 * markdown-stripping approach as {@link buildExcerpt} (wikilink → label,
 * md link → text, drop symbols, collapse whitespace) plus code-fence removal,
 * then caps at {@link SEARCH_BODY_CAP} chars so the client-shipped index stays
 * small (~600 chars × ~400 notes).
 */
function buildSearchBody(body: string): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/^#.*$/gm, "") // drop heading lines
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t) // wikilink → label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // md link → text
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= SEARCH_BODY_CAP) return text;
  return text.slice(0, SEARCH_BODY_CAP - 1).replace(/\s+\S*$/, "") + "…";
}

interface RawRecord {
  slug: string;
  title: string;
  type: WikiType;
  dir: string;
  isIndex: boolean;
  filePath: string;
  data: Record<string, unknown>;
  body: string;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      out.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

interface VaultData {
  pages: Map<string, WikiPage>;
  metas: WikiPageMeta[];
  graph: WikiGraph;
  /** slug → cleaned, capped note body for the client keyword index. */
  searchBodies: Map<string, string>;
}

// Module-level singleton. React's cache() is request-scoped, so during static
// export every page would re-parse the whole vault (658 pages × 309 files →
// build timeout). A process-wide promise parses the vault exactly once per
// build worker instead.
let vaultPromise: Promise<VaultData> | null = null;

function loadVault(): Promise<VaultData> {
  if (!vaultPromise) vaultPromise = buildVault();
  return vaultPromise;
}

async function buildVault(): Promise<VaultData> {
  const files = await walk(WIKI_DIR);

  // ---- Pass 1: read frontmatter, assign unique slugs, build resolver maps. ----
  const raws: RawRecord[] = [];
  const usedSlugs = new Set<string>();
  const titleToSlug = new Map<string, string>();
  const basenameToSlug = new Map<string, string>();

  for (const filePath of files) {
    const rel = path.relative(WIKI_DIR, filePath);
    const segments = rel.split(path.sep);
    const dir = segments.length > 1 ? segments[0] : "";
    const basename = path.basename(filePath, ".md");
    const isIndex = basename === "_index" || basename.startsWith("_");

    let source: string;
    try {
      source = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const { data, content } = matter(source);
    const title = firstString(data.title) ?? basename;
    const rawType = firstString(data.type) ?? "unknown";
    const type = (VALID_TYPES.has(rawType as WikiType) ? rawType : "unknown") as WikiType;

    let slug = slugify(title);
    while (usedSlugs.has(slug)) slug = `${slug}-${usedSlugs.size}`;
    usedSlugs.add(slug);

    titleToSlug.set(normalizeTitle(title), slug);
    basenameToSlug.set(normalizeTitle(basename), slug);

    raws.push({ slug, title, type, dir, isIndex, filePath, data, body: content });
  }

  const resolve: Resolver = (target) => {
    const key = normalizeTitle(target);
    return titleToSlug.get(key) ?? basenameToSlug.get(key) ?? null;
  };

  // ---- Pass 2: render HTML, resolve links, collect outbound edges. ----
  const pages = new Map<string, WikiPage>();
  const backlinkSets = new Map<string, Set<string>>();

  const addBacklink = (targetSlug: string, fromSlug: string) => {
    if (targetSlug === fromSlug) return;
    let set = backlinkSets.get(targetSlug);
    if (!set) backlinkSets.set(targetSlug, (set = new Set()));
    set.add(fromSlug);
  };

  for (const rec of raws) {
    const { html, headings, links } = await renderMarkdown(
      stripLeadingTitle(rec.body, rec.title),
      resolve,
    );

    const related: WikiLink[] = asStringArray(rec.data.related).map((entry) => {
      const cleaned = entry.replace(/^\[\[|\]\]$/g, "");
      const { target, label } = parseWikiTarget(cleaned);
      return { target, label, slug: resolve(target) };
    });

    // Dedup outbound links by slug (resolved) or target (unresolved).
    const seen = new Set<string>();
    const outboundLinks: WikiLink[] = [];
    for (const link of [...links, ...related]) {
      const key = link.slug ?? `?${normalizeTitle(link.target)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      outboundLinks.push(link);
      if (link.slug) addBacklink(link.slug, rec.slug);
    }

    const page: WikiPage = {
      slug: rec.slug,
      title: rec.title,
      type: rec.type,
      dir: rec.dir,
      address: firstString(rec.data.address),
      tags: asStringArray(rec.data.tags),
      status: firstString(rec.data.status),
      domain: firstString(rec.data.domain),
      created: firstString(rec.data.created),
      updated: firstString(rec.data.updated),
      excerpt: buildExcerpt(rec.body),
      wordCount: rec.body.split(/\s+/).filter(Boolean).length,
      backlinkCount: 0,
      outboundCount: outboundLinks.length,
      isIndex: rec.isIndex,
      html,
      related,
      outboundLinks,
      backlinks: [],
      semanticRelated: [],
      headings,
      filePath: rec.filePath,
    };
    pages.set(rec.slug, page);
  }

  // ---- Finalize backlinks. ----
  for (const page of pages.values()) {
    const set = backlinkSets.get(page.slug);
    page.backlinks = set ? [...set] : [];
    page.backlinkCount = page.backlinks.length;
  }

  // ---- Attach precomputed semantic neighbors (empty until `pnpm embed` runs). ----
  const neighbors = neighborsData as Record<string, string[]>;
  for (const page of pages.values()) {
    const candidates = neighbors[page.slug] ?? [];
    page.semanticRelated = candidates.filter((slug) => {
      const target = pages.get(slug);
      return target != null && !target.isIndex && slug !== page.slug;
    });
  }

  const metas = [...pages.values()]
    .map(toMeta)
    .sort((a, b) => a.title.localeCompare(b.title));

  // Derive the compact keyword-search body once per build, straight from the
  // raw markdown (WikiPage keeps only rendered HTML + excerpt, not the source).
  const searchBodies = new Map<string, string>();
  for (const rec of raws) {
    searchBodies.set(rec.slug, buildSearchBody(rec.body));
  }

  const graph = buildGraph(pages);

  return { pages, metas, graph, searchBodies };
}

function toMeta(page: WikiPage): WikiPageMeta {
  return {
    slug: page.slug,
    title: page.title,
    type: page.type,
    dir: page.dir,
    address: page.address,
    tags: page.tags,
    status: page.status,
    domain: page.domain,
    created: page.created,
    updated: page.updated,
    excerpt: page.excerpt,
    wordCount: page.wordCount,
    backlinkCount: page.backlinkCount,
    outboundCount: page.outboundCount,
    isIndex: page.isIndex,
  };
}

function buildGraph(pages: Map<string, WikiPage>): WikiGraph {
  const degree = new Map<string, number>();
  const edgeKeys = new Set<string>();
  const links: WikiGraph["links"] = [];

  // Meta pages (Wiki Index, Hot Cache, Operation Log, …) link to nearly
  // everything — they form a navigational hairball that hides the real
  // structure, so keep them out of the graph.
  const inGraph = (p: WikiPage) => !p.isIndex && p.type !== "meta";

  for (const page of pages.values()) {
    if (!inGraph(page)) continue;
    for (const link of page.outboundLinks) {
      if (!link.slug || link.slug === page.slug) continue;
      const target = pages.get(link.slug);
      if (!target || !inGraph(target)) continue;
      const key = `${page.slug}->${link.slug}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      links.push({ source: page.slug, target: link.slug });
      degree.set(page.slug, (degree.get(page.slug) ?? 0) + 1);
      degree.set(link.slug, (degree.get(link.slug) ?? 0) + 1);
    }
  }

  // Only include connected nodes — isolated singletons scatter far from the
  // main component and add no navigational value.
  const connected = [...pages.values()].filter(
    (p) => inGraph(p) && (degree.get(p.slug) ?? 0) > 0,
  );

  // ---- Graph analytics (server-side, once per build) ----------------------
  // Build an undirected graphology graph, then compute Louvain communities,
  // PageRank, and a ForceAtlas2 layout so the client can paint instantly
  // without running its own physics simulation.
  const g = new Graph({ type: "undirected", multi: false });
  for (const p of connected) g.addNode(p.slug);
  for (const link of links) {
    if (!g.hasNode(link.source) || !g.hasNode(link.target)) continue;
    if (!g.hasEdge(link.source, link.target)) {
      g.addUndirectedEdge(link.source, link.target);
    }
  }

  let communities: Record<string, number> = {};
  const pageranks: Record<string, number> = {};
  try {
    communities = louvain(g);
  } catch {
    // Falls back to a single community if the algorithm can't converge.
  }
  try {
    Object.assign(pageranks, pagerank(g));
  } catch {
    // Falls back to degree-based sizing below.
  }

  // Seed a circular layout then relax it with ForceAtlas2 for a stable spread.
  circular.assign(g);
  const settings = forceAtlas2.inferSettings(g);
  forceAtlas2.assign(g, { iterations: 220, settings });

  const nodes = connected.map((p) => ({
    id: p.slug,
    title: p.title,
    type: p.type,
    dir: p.dir,
    val: 1 + (degree.get(p.slug) ?? 0),
    community: communities[p.slug] ?? 0,
    pagerank: pageranks[p.slug] ?? 0,
    x: (g.getNodeAttribute(p.slug, "x") as number) ?? 0,
    y: (g.getNodeAttribute(p.slug, "y") as number) ?? 0,
  }));

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// Public API — all memoized through the single loadVault() call.
// ---------------------------------------------------------------------------

export const getAllPageMetas = cache(async (): Promise<WikiPageMeta[]> => {
  return (await loadVault()).metas;
});

export const getPage = cache(async (slug: string): Promise<WikiPage | null> => {
  return (await loadVault()).pages.get(slug) ?? null;
});

/** Resolve a page's precomputed semantic neighbors to full metas, in order. */
export const getSemanticRelated = cache(
  async (slug: string, limit = 5): Promise<WikiPageMeta[]> => {
    const { pages } = await loadVault();
    const page = pages.get(slug);
    if (!page) return [];
    const out: WikiPageMeta[] = [];
    for (const neighborSlug of page.semanticRelated) {
      const neighbor = pages.get(neighborSlug);
      if (neighbor) out.push(toMeta(neighbor));
      if (out.length >= limit) break;
    }
    return out;
  },
);

export const getPagesByDir = cache(async (dir: string): Promise<WikiPageMeta[]> => {
  return (await getAllPageMetas()).filter((p) => p.dir === dir && !p.isIndex);
});

export const getGraph = cache(async (): Promise<WikiGraph> => {
  return (await loadVault()).graph;
});

export interface TagCount {
  tag: string;
  count: number;
}

export const getAllTags = cache(async (): Promise<TagCount[]> => {
  const counts = new Map<string, number>();
  for (const meta of await getAllPageMetas()) {
    if (meta.isIndex) continue;
    for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
});

export const getPagesByTag = cache(async (tag: string): Promise<WikiPageMeta[]> => {
  const key = tag.toLowerCase();
  return (await getAllPageMetas()).filter(
    (p) => !p.isIndex && p.tags.some((t) => t.toLowerCase() === key),
  );
});

export interface VaultStats {
  total: number;
  byDir: { dir: string; count: number }[];
  totalLinks: number;
  totalTags: number;
}

export const getStats = cache(async (): Promise<VaultStats> => {
  const metas = (await getAllPageMetas()).filter((p) => !p.isIndex);
  const byDirMap = new Map<string, number>();
  let totalLinks = 0;
  for (const m of metas) {
    if (m.dir) byDirMap.set(m.dir, (byDirMap.get(m.dir) ?? 0) + 1);
    totalLinks += m.outboundCount;
  }
  const byDir = [...byDirMap.entries()]
    .map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count);
  const tags = await getAllTags();
  return { total: metas.length, byDir, totalLinks, totalTags: tags.length };
});

/** Most-linked-to pages — used for the dashboard "hot" list. */
export const getMostLinked = cache(async (limit = 8): Promise<WikiPageMeta[]> => {
  return [...(await getAllPageMetas())]
    .filter((p) => !p.isIndex)
    .sort((a, b) => b.backlinkCount - a.backlinkCount)
    .slice(0, limit);
});

export interface SearchDoc {
  slug: string;
  title: string;
  dir: string;
  type: WikiType;
  excerpt: string;
  tags: string[];
  /** Cleaned, capped note body (~600 chars) for full-text keyword search. */
  body: string;
}

/** Lightweight, client-shippable index for the command-palette search. */
export const getSearchIndex = cache(async (): Promise<SearchDoc[]> => {
  const { metas, searchBodies } = await loadVault();
  return metas
    .filter((p) => !p.isIndex)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      dir: p.dir,
      type: p.type,
      excerpt: p.excerpt,
      tags: p.tags,
      body: searchBodies.get(p.slug) ?? "",
    }));
});

export interface GrowthPoint {
  /** ISO day, e.g. "2026-07-13". */
  date: string;
  /** Pages first seen on this day. */
  added: number;
  /** Running total up to and including this day. */
  cumulative: number;
}

/**
 * Cumulative page count over time, by the day each page was created (falling
 * back to updated). One point per day that saw activity — the vault's
 * compounding curve.
 */
export const getGrowthSeries = cache(async (): Promise<GrowthPoint[]> => {
  const metas = await getAllPageMetas();
  const perDay = new Map<string, number>();

  for (const meta of metas) {
    if (meta.isIndex) continue;
    const date = meta.created ?? meta.updated;
    const match = date ? /^(\d{4}-\d{2}-\d{2})/.exec(date) : null;
    if (!match) continue;
    perDay.set(match[1], (perDay.get(match[1]) ?? 0) + 1);
  }

  const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let running = 0;
  return days.map(([date, added]) => {
    running += added;
    return { date, added, cumulative: running };
  });
});

export interface HistogramBin {
  label: string;
  count: number;
}

/** Distribution of pages by how many backlinks point at them. */
export const getConnectivityHistogram = cache(async (): Promise<HistogramBin[]> => {
  const metas = (await getAllPageMetas()).filter((p) => !p.isIndex);
  const bins: { label: string; test: (n: number) => boolean }[] = [
    { label: "0", test: (n) => n === 0 },
    { label: "1", test: (n) => n === 1 },
    { label: "2", test: (n) => n === 2 },
    { label: "3–4", test: (n) => n >= 3 && n <= 4 },
    { label: "5–9", test: (n) => n >= 5 && n <= 9 },
    { label: "10–19", test: (n) => n >= 10 && n <= 19 },
    { label: "20+", test: (n) => n >= 20 },
  ];
  return bins.map((bin) => ({
    label: bin.label,
    count: metas.filter((p) => bin.test(p.backlinkCount)).length,
  }));
});

export interface CollectionSize {
  dir: string;
  count: number;
}

/** Page counts per browsable collection, largest first. */
export const getCollectionSizes = cache(async (): Promise<CollectionSize[]> => {
  const stats = await getStats();
  const browsable = new Set<string>(BROWSE_DIRS);
  return stats.byDir
    .filter((d) => browsable.has(d.dir))
    .sort((a, b) => b.count - a.count);
});

export interface TimelineBucket {
  /** Sort key, e.g. "2026-07". */
  period: string;
  /** Human label, e.g. "July 2026". */
  label: string;
  pages: WikiPageMeta[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Group pages into month buckets by their most recent date (updated, falling
 * back to created), newest first — the vault's growth over time.
 */
export const getTimeline = cache(async (): Promise<TimelineBucket[]> => {
  const metas = await getAllPageMetas();
  const buckets = new Map<string, WikiPageMeta[]>();

  for (const meta of metas) {
    if (meta.isIndex) continue;
    const date = meta.updated ?? meta.created;
    const match = date ? /^(\d{4})-(\d{2})/.exec(date) : null;
    if (!match) continue;
    const period = `${match[1]}-${match[2]}`;
    const list = buckets.get(period);
    if (list) list.push(meta);
    else buckets.set(period, [meta]);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([period, pages]) => {
      const [year, month] = period.split("-");
      return {
        period,
        label: `${MONTHS[Number(month) - 1]} ${year}`,
        pages: pages.sort((a, b) =>
          (b.updated ?? "").localeCompare(a.updated ?? ""),
        ),
      };
    });
});

/** Most-recently-updated pages. */
export const getRecentlyUpdated = cache(async (limit = 8): Promise<WikiPageMeta[]> => {
  return [...(await getAllPageMetas())]
    .filter((p) => !p.isIndex && p.updated)
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
    .slice(0, limit);
});

export interface ActivityDay {
  /** ISO day "YYYY-MM-DD". */
  date: string;
  /** Number of notes whose activity date falls on this day. */
  count: number;
}

/**
 * Per-day note activity across the vault — one entry per day that saw activity,
 * sorted ascending by date. Activity date = `updated ?? created` (the day a note
 * was last touched), matching getTimeline. Non-index, dated pages only.
 */
export const getActivityCalendar = cache(async (): Promise<ActivityDay[]> => {
  const metas = await getAllPageMetas();
  const perDay = new Map<string, number>();

  for (const meta of metas) {
    if (meta.isIndex) continue;
    const date = meta.updated ?? meta.created;
    const match = date ? /^(\d{4}-\d{2}-\d{2})/.exec(date) : null;
    if (!match) continue;
    perDay.set(match[1], (perDay.get(match[1]) ?? 0) + 1);
  }

  return [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));
});

export interface CollectionGrowthSeries {
  /** Browsable collection dirs, stable order (use BROWSE_DIRS filtered to those present). */
  dirs: string[];
  /** One point per day that saw a page created, ascending. `counts[dir]` = CUMULATIVE
      count of pages in that collection up to and including this day. Every point carries
      a value for EVERY dir in `dirs` (0 until that collection's first page). */
  points: { date: string; counts: Record<string, number> }[];
}

/**
 * Per-collection cumulative growth over time — one point per day that saw a page
 * created, each carrying a running cumulative count for every browsable
 * collection. Activity date = `created ?? updated` (created-first, mirroring
 * getGrowthSeries). Non-index pages in browsable dirs only. Powers the
 * dashboard streamgraph.
 */
export const getCollectionGrowth = cache(async (): Promise<CollectionGrowthSeries> => {
  const metas = await getAllPageMetas();
  const browsable = new Set<string>(BROWSE_DIRS);
  // day -> (dir -> pages added that day)
  const perDay = new Map<string, Map<string, number>>();

  for (const meta of metas) {
    if (meta.isIndex) continue;
    if (!browsable.has(meta.dir)) continue;
    const date = meta.created ?? meta.updated;
    const match = date ? /^(\d{4}-\d{2}-\d{2})/.exec(date) : null;
    if (!match) continue;
    const byDir = perDay.get(match[1]) ?? new Map<string, number>();
    byDir.set(meta.dir, (byDir.get(meta.dir) ?? 0) + 1);
    perDay.set(match[1], byDir);
  }

  // dirs = BROWSE_DIRS filtered to those with ≥1 dated page, preserving order.
  const seen = new Set<string>();
  for (const byDir of perDay.values()) {
    for (const dir of byDir.keys()) seen.add(dir);
  }
  const dirs: string[] = BROWSE_DIRS.filter((dir) => seen.has(dir));

  // Walk the sorted day axis, accumulating a running cumulative per dir.
  const running = new Map<string, number>(dirs.map((dir): [string, number] => [dir, 0]));
  const points = [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, byDir]) => {
      const counts: Record<string, number> = {};
      for (const dir of dirs) {
        const total = (running.get(dir) ?? 0) + (byDir.get(dir) ?? 0);
        running.set(dir, total);
        counts[dir] = total;
      }
      return { date, counts };
    });

  return { dirs, points };
});

export interface CollectionChords {
  /** Matrix index order — browsable dirs present among linked nodes, stable (BROWSE_DIRS order). */
  dirs: string[];
  /** Square matrix. matrix[i][j] = number of links FROM a page in dirs[i] TO a page in dirs[j]
      (diagonal = intra-collection links). */
  matrix: number[][];
}

/**
 * Inter-collection link matrix — how many links flow between each pair of
 * browsable collections (diagonal = intra-collection). Built from getGraph();
 * links touching non-browsable dirs are ignored. Powers the dashboard chord
 * diagram.
 */
export const getCollectionChords = cache(async (): Promise<CollectionChords> => {
  const graph = await getGraph();
  const browsable = new Set<string>(BROWSE_DIRS);

  // slug -> dir over all nodes, tracking which browsable dirs actually appear.
  const dirBySlug = new Map<string, string>();
  const present = new Set<string>();
  for (const node of graph.nodes) {
    dirBySlug.set(node.id, node.dir);
    if (browsable.has(node.dir)) present.add(node.dir);
  }

  const dirs: string[] = BROWSE_DIRS.filter((dir) => present.has(dir));
  const index = new Map<string, number>(dirs.map((dir, i): [string, number] => [dir, i]));

  const matrix = dirs.map(() => dirs.map(() => 0));
  for (const link of graph.links) {
    const sourceDir = dirBySlug.get(link.source);
    const targetDir = dirBySlug.get(link.target);
    if (sourceDir === undefined || targetDir === undefined) continue;
    const i = index.get(sourceDir);
    const j = index.get(targetDir);
    if (i === undefined || j === undefined) continue;
    matrix[i][j] += 1;
  }

  return { dirs, matrix };
});

export interface MaturityStage {
  status: string;
  label: string;
  count: number;
}

/** Canonical knowledge-maturity ladder, in pipeline order. */
const MATURITY_LADDER = ["seed", "developing", "stable", "evergreen", "mature"];

/**
 * Knowledge-maturity funnel — non-index pages bucketed along the canonical
 * maturity ladder (seed → developing → stable → evergreen → mature), with any
 * off-ladder status collected into a trailing "Other" stage. Pages with a null
 * status are ignored. The five ladder stages are always returned in order (even
 * at count 0, so the funnel keeps its shape); "Other" trails only when non-empty.
 */
export const getMaturityDistribution = cache(async (): Promise<MaturityStage[]> => {
  const counts = new Map<string, number>(
    MATURITY_LADDER.map((status): [string, number] => [status, 0]),
  );
  let other = 0;

  for (const meta of await getAllPageMetas()) {
    if (meta.isIndex) continue;
    if (meta.status == null) continue;
    const status = meta.status.toLowerCase();
    if (counts.has(status)) counts.set(status, (counts.get(status) ?? 0) + 1);
    else other += 1;
  }

  const stages: MaturityStage[] = MATURITY_LADDER.map((status) => ({
    status,
    label: status.charAt(0).toUpperCase() + status.slice(1),
    count: counts.get(status) ?? 0,
  }));
  if (other > 0) stages.push({ status: "other", label: "Other", count: other });
  return stages;
});

export interface ClusterNode {
  id: string;
  title: string;
  dir: string;
  community: number;
  pagerank: number;
  x: number;
  y: number;
}

export interface TopicClusters {
  nodes: ClusterNode[];
  communities: number;
}

/**
 * Topic clusters for the community scatter map — every graph node projected to
 * its layout coordinates, Louvain community, and PageRank. `communities` is the
 * count of distinct community values across the nodes.
 */
export const getTopicClusters = cache(async (): Promise<TopicClusters> => {
  const { nodes } = await getGraph();
  const clusterNodes: ClusterNode[] = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    dir: n.dir,
    community: n.community,
    pagerank: n.pagerank,
    x: n.x,
    y: n.y,
  }));
  const communities = new Set(clusterNodes.map((n) => n.community)).size;
  return { nodes: clusterNodes, communities };
});

export interface RankedNote {
  slug: string;
  title: string;
  dir: string;
  pagerank: number;
  backlinkCount: number;
}

/**
 * Most structurally-important notes — graph nodes ranked by PageRank descending,
 * joined to their backlink count from the page metas. Nodes whose slug resolves
 * to an index page are skipped. Returns up to `limit` rows.
 */
export const getTopNotes = cache(async (limit = 15): Promise<RankedNote[]> => {
  if (limit <= 0) return [];
  const [{ nodes }, metas] = await Promise.all([getGraph(), getAllPageMetas()]);
  const metaBySlug = new Map(metas.map((m) => [m.slug, m]));

  const ranked = [...nodes].sort((a, b) => b.pagerank - a.pagerank);
  const out: RankedNote[] = [];
  for (const node of ranked) {
    const meta = metaBySlug.get(node.id);
    if (meta?.isIndex) continue;
    out.push({
      slug: node.id,
      title: node.title,
      dir: node.dir,
      pagerank: node.pagerank,
      backlinkCount: meta?.backlinkCount ?? 0,
    });
    if (out.length >= limit) break;
  }
  return out;
});
