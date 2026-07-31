/**
 * Build-time semantic index for the vault.
 *
 * Embeds every page locally with a small sentence-transformer (all-MiniLM-L6-v2,
 * 384-dim) via @huggingface/transformers — no network egress of vault content;
 * only the model weights are fetched from the HF hub on first run and cached.
 *
 * Outputs:
 *   - src/lib/wiki/neighbors.json   → { slug: [topK slugs] }  (imported server-side)
 *   - public/vault-vectors.json     → { model, dim, docs:[{slug,title,dir,vector}] }
 *                                     (fetched on demand by the client semantic search)
 *
 * Run:  pnpm embed
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { pipeline } from "@huggingface/transformers";

import { slugify, normalizeTitle } from "../src/lib/wiki/slug.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAULT_ROOT =
  process.env.WIKI_VAULT_PATH ?? path.join(ROOT, "..", "claude-obsidian");
const WIKI_DIR = path.join(VAULT_ROOT, "wiki");
const MODEL = "Xenova/all-MiniLM-L6-v2";
const TOP_K = 6;

interface Doc {
  slug: string;
  title: string;
  dir: string;
  text: string;
  vector: number[];
}

interface Chunk {
  id: string;
  slug: string;
  title: string;
  dir: string;
  text: string;
  vector: number[];
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

/** Strip markdown/wikilink noise to a compact text blob (full, untruncated). */
function cleanBody(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#.*$/gm, (h) => h.replace(/^#+\s*/, ""))
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip markdown/wikilink noise to a compact text blob for page embedding. */
function toEmbedText(title: string, body: string): string {
  return `${title}. ${cleanBody(body)}`.slice(0, 1600);
}

/**
 * Split cleaned text into ~`size`-char windows on word boundaries with
 * `overlap` chars of context carried between adjacent windows. Empty or
 * whitespace-only chunks are dropped; text at or under `size` returns as one
 * chunk (or nothing when empty).
 */
function chunkText(text: string, size = 900, overlap = 150): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= size) return [trimmed];

  const words = trimmed.split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + 1 + word.length > size) {
      chunks.push(current);
      // Carry the trailing `overlap` chars into the next window for context.
      const tail = current.slice(Math.max(0, current.length - overlap));
      const boundary = tail.indexOf(" ");
      current = boundary >= 0 ? tail.slice(boundary + 1) : "";
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);

  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalized, so dot === cosine
}

async function main() {
  console.log(`Reading vault: ${WIKI_DIR}`);
  const files = await walk(WIKI_DIR);

  // Parse + assign slugs the same way the app does.
  const used = new Set<string>();
  const raw: {
    slug: string;
    title: string;
    dir: string;
    text: string;
    body: string;
  }[] = [];
  for (const filePath of files) {
    const rel = path.relative(WIKI_DIR, filePath);
    const segments = rel.split(path.sep);
    const dir = segments.length > 1 ? segments[0] : "";
    const basename = path.basename(filePath, ".md");
    if (basename === "_index" || basename.startsWith("_")) continue;

    const source = await fs.readFile(filePath, "utf8");
    const { data, content } = matter(source);
    const title =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : basename;
    void normalizeTitle(title);

    let slug = slugify(title);
    while (used.has(slug)) slug = `${slug}-${used.size}`;
    used.add(slug);

    raw.push({
      slug,
      title,
      dir,
      text: toEmbedText(title, content),
      body: cleanBody(content),
    });
  }
  console.log(`Embedding ${raw.length} pages with ${MODEL}…`);

  const extractor = await pipeline("feature-extraction", MODEL);
  const docs: Doc[] = [];
  let n = 0;
  for (const r of raw) {
    const output = await extractor(r.text, { pooling: "mean", normalize: true });
    docs.push({ ...r, vector: Array.from(output.data as Float32Array) });
    if (++n % 40 === 0) console.log(`  ${n}/${raw.length}`);
  }

  // Precompute top-K neighbors per page.
  console.log("Computing neighbors…");
  const neighbors: Record<string, string[]> = {};
  for (const a of docs) {
    const scored = docs
      .filter((b) => b.slug !== a.slug)
      .map((b) => ({ slug: b.slug, score: cosine(a.vector, b.vector) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, TOP_K)
      .map((x) => x.slug);
    neighbors[a.slug] = scored;
  }

  const neighborsPath = path.join(ROOT, "src/lib/wiki/neighbors.json");
  await fs.writeFile(neighborsPath, JSON.stringify(neighbors) + "\n");
  console.log(`Wrote ${neighborsPath}`);

  const dim = docs[0]?.vector.length ?? 0;
  const vectorsPath = path.join(ROOT, "public/vault-vectors.json");
  await fs.writeFile(
    vectorsPath,
    JSON.stringify({
      model: MODEL,
      dim,
      docs: docs.map((d) => ({
        slug: d.slug,
        title: d.title,
        dir: d.dir,
        vector: d.vector.map((v) => Math.round(v * 1e4) / 1e4),
      })),
    }),
  );
  console.log(`Wrote ${vectorsPath} (${docs.length} docs, dim ${dim})`);

  // Chunk pass: finer-grained embeddings for sharper RAG retrieval. Uses the
  // same extractor/model; each chunk is embedded with its title prefixed for
  // context, but the raw chunk text is what gets stored.
  console.log("Embedding chunks…");
  const chunks: Chunk[] = [];
  let c = 0;
  for (const r of raw) {
    const pieces = chunkText(r.body);
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const output = await extractor(`${r.title}. ${piece}`, {
        pooling: "mean",
        normalize: true,
      });
      chunks.push({
        id: `${r.slug}#${i}`,
        slug: r.slug,
        title: r.title,
        dir: r.dir,
        text: piece,
        vector: Array.from(output.data as Float32Array),
      });
      if (++c % 200 === 0) console.log(`  ${c} chunks`);
    }
  }

  const chunkDim = chunks[0]?.vector.length ?? dim;
  const chunksPath = path.join(ROOT, "public/vault-chunks.json");
  await fs.writeFile(
    chunksPath,
    JSON.stringify({
      model: MODEL,
      dim: chunkDim,
      chunks: chunks.map((ch) => ({
        id: ch.id,
        slug: ch.slug,
        title: ch.title,
        dir: ch.dir,
        text: ch.text,
        vector: ch.vector.map((v) => Math.round(v * 1e4) / 1e4),
      })),
    }),
  );
  console.log(`Wrote ${chunksPath} (${chunks.length} chunks, dim ${chunkDim})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
