import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

import { WIKI_DIR } from "./config";
import { slugify } from "./slug";
import { cleanBody, noteHash } from "./embed-text";

/**
 * How the built semantic index compares to the live vault on disk.
 *
 * `stale` is the headline signal: true whenever the index is missing, or the
 * vault has notes the index doesn't cover / no longer matches. `changed` counts
 * notes added-or-edited since the last build; `removed` counts indexed notes
 * that have since disappeared from the vault.
 */
export interface IndexFreshness {
  builtAt: string | null;
  total: number;
  changed: number;
  removed: number;
  stale: boolean;
}

interface Manifest {
  builtAt: string;
  model: string;
  dim: number;
  notes: Record<string, string>;
}

/** Recursively collect `.md` files under `dir`, skipping dot-directories. */
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

/**
 * Compute per-note content hashes for the live vault, keyed by the SAME slug
 * logic the embedding script and app use (so slugs line up exactly). Mirrors
 * the script's skip rules (`_index` and `_`-prefixed basenames).
 */
async function hashLiveVault(): Promise<Map<string, string>> {
  const files = await walk(WIKI_DIR);
  const used = new Set<string>();
  const hashes = new Map<string, string>();

  for (const filePath of files) {
    const basename = path.basename(filePath, ".md");
    if (basename === "_index" || basename.startsWith("_")) continue;

    const source = await fs.readFile(filePath, "utf8");
    const { data, content } = matter(source);
    const title =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : basename;

    let slug = slugify(title);
    while (used.has(slug)) slug = `${slug}-${used.size}`;
    used.add(slug);

    hashes.set(slug, noteHash(cleanBody(content)));
  }

  return hashes;
}

/**
 * Compare the built index manifest to the live vault. Degrades to `stale: true`
 * rather than throwing if the manifest or vault cannot be read.
 */
export async function getIndexFreshness(): Promise<IndexFreshness> {
  let live: Map<string, string>;
  try {
    live = await hashLiveVault();
  } catch {
    return { builtAt: null, total: 0, changed: 0, removed: 0, stale: true };
  }

  const total = live.size;

  let manifest: Manifest | null = null;
  try {
    const manifestPath = path.join(process.cwd(), ".index", "manifest.json");
    const buf = await fs.readFile(manifestPath, "utf8");
    manifest = JSON.parse(buf) as Manifest;
  } catch {
    manifest = null;
  }

  // Never built (or unreadable): every live note counts as changed.
  if (!manifest || typeof manifest.notes !== "object") {
    return { builtAt: null, total, changed: total, removed: 0, stale: true };
  }

  const indexed = manifest.notes;

  let changed = 0;
  for (const [slug, hash] of live) {
    if (indexed[slug] !== hash) changed++;
  }

  let removed = 0;
  for (const slug of Object.keys(indexed)) {
    if (!live.has(slug)) removed++;
  }

  const builtAt =
    typeof manifest.builtAt === "string" ? manifest.builtAt : null;

  return {
    builtAt,
    total,
    changed,
    removed,
    stale: changed > 0 || removed > 0,
  };
}
