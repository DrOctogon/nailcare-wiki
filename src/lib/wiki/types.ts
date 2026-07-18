// Core domain types for the Obsidian wiki content layer.

export type WikiType =
  | "entity"
  | "concept"
  | "source"
  | "question"
  | "comparison"
  | "derived"
  | "reference"
  | "fold"
  | "meta"
  | "unknown";

/** A resolved (or unresolved) wikilink extracted from frontmatter or body. */
export interface WikiLink {
  /** Raw target title as written inside [[ ]] (heading anchor stripped). */
  target: string;
  /** Display label (after | alias, or the target). */
  label: string;
  /** Resolved page slug, or null when the target page does not exist. */
  slug: string | null;
}

/** Lightweight page summary — safe to ship to the client for lists/search/graph. */
export interface WikiPageMeta {
  slug: string;
  title: string;
  type: WikiType;
  /** Top-level directory under wiki/ (entities, concepts, …). */
  dir: string;
  address: string | null;
  tags: string[];
  status: string | null;
  domain: string | null;
  created: string | null;
  updated: string | null;
  excerpt: string;
  wordCount: number;
  backlinkCount: number;
  outboundCount: number;
  isIndex: boolean;
}

/** Full page including rendered HTML and link graph — server-side only. */
export interface WikiPage extends WikiPageMeta {
  html: string;
  related: WikiLink[];
  outboundLinks: WikiLink[];
  backlinks: string[];
  /** Slugs of the most semantically-similar pages (precomputed from embeddings). */
  semanticRelated: string[];
  headings: { id: string; text: string; depth: number }[];
  filePath: string;
}

export interface GraphNode {
  id: string; // slug
  title: string;
  type: WikiType;
  dir: string;
  val: number; // degree
  /** Louvain community index — nodes that cluster together in the link graph. */
  community: number;
  /** PageRank score (0–1), used to size nodes by structural importance. */
  pagerank: number;
  /** Precomputed layout coordinates from server-side ForceAtlas2. */
  x: number;
  y: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface WikiGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}
