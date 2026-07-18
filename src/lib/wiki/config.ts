import path from "node:path";

/**
 * Absolute path to the Obsidian vault's wiki directory.
 *
 * Local-only, live read: by default we resolve the sibling `claude-obsidian`
 * checkout relative to the Next.js project root. Override with WIKI_VAULT_PATH
 * (pointing at the vault root) if the vault lives elsewhere.
 */
const vaultRoot =
  process.env.WIKI_VAULT_PATH ??
  path.join(process.cwd(), "..", "claude-obsidian");

export const WIKI_DIR = path.join(vaultRoot, "wiki");

/** Top-level wiki directories we surface as browsable collections, in nav order. */
export const BROWSE_DIRS = [
  "concepts",
  "entities",
  "sources",
  "questions",
  "comparisons",
  "derived",
  "references",
] as const;

export type BrowseDir = (typeof BROWSE_DIRS)[number];
