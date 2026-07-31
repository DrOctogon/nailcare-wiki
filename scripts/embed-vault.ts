/**
 * Build-time semantic index for the vault.
 *
 * Embeds every page locally with a small sentence-transformer (all-MiniLM-L6-v2,
 * 384-dim) via @huggingface/transformers — no network egress of vault content;
 * only the model weights are fetched from the HF hub on first run and cached.
 *
 * Incremental: each run content-hashes every note and reuses cached page +
 * chunk vectors for notes whose hash matches the prior manifest, only calling
 * the model for new or changed notes. Neighbors are always recomputed over the
 * full current vector set so added/removed notes are reflected.
 *
 * Outputs:
 *   - src/lib/wiki/neighbors.json   → { slug: [topK slugs] }  (imported server-side)
 *   - public/vault-vectors.json     → { model, dim, docs:[{slug,title,dir,vector}] }
 *                                     (fetched on demand by the client semantic search)
 *   - .index/vault-chunks.json      → { model, dim, chunks:[{id,slug,title,dir,text,vector}] }
 *   - .index/manifest.json          → { builtAt, model, dim, notes:{ slug: hash } }
 *
 * Run:  pnpm embed
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { pipeline } from "@huggingface/transformers";

import { slugify, normalizeTitle } from "../src/lib/wiki/slug.ts";
import { cleanBody, chunkText, noteHash } from "../src/lib/wiki/embed-text.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAULT_ROOT =
  process.env.WIKI_VAULT_PATH ?? path.join(ROOT, "..", "claude-obsidian");
const WIKI_DIR = path.join(VAULT_ROOT, "wiki");
const INDEX_DIR = path.join(ROOT, ".index");
const MANIFEST_PATH = path.join(INDEX_DIR, "manifest.json");
const MODEL = "Xenova/all-MiniLM-L6-v2";
const TOP_K = 6;

interface Manifest {
  builtAt: string;
  model: string;
  dim: number;
  notes: Record<string, string>;
}

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

/** Strip markdown/wikilink noise to a compact text blob for page embedding. */
function toEmbedText(title: string, body: string): string {
  return `${title}. ${cleanBody(body)}`.slice(0, 1600);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalized, so dot === cosine
}

/** A parsed vault note plus its content fingerprint, before embedding. */
interface RawNote {
  slug: string;
  title: string;
  dir: string;
  text: string;
  body: string;
  hash: string;
}

/** Load the prior manifest, or null when the index has never been built. */
async function loadPriorManifest(): Promise<Manifest | null> {
  try {
    const buf = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(buf) as Manifest;
  } catch {
    return null;
  }
}

/** Load prior page vectors keyed by slug (rounded, already normalized). */
async function loadPriorPageVectors(
  vectorsPath: string,
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  try {
    const buf = await fs.readFile(vectorsPath, "utf8");
    const parsed = JSON.parse(buf) as {
      docs?: { slug?: string; vector?: number[] }[];
    };
    for (const d of parsed.docs ?? []) {
      if (typeof d.slug === "string" && Array.isArray(d.vector)) {
        map.set(d.slug, d.vector);
      }
    }
  } catch {
    // No prior vectors — everything embeds fresh.
  }
  return map;
}

/** Load prior chunks grouped by slug, preserving file (chunk-index) order. */
async function loadPriorChunks(
  chunksPath: string,
): Promise<Map<string, { id: string; text: string; vector: number[] }[]>> {
  const map = new Map<string, { id: string; text: string; vector: number[] }[]>();
  try {
    const buf = await fs.readFile(chunksPath, "utf8");
    const parsed = JSON.parse(buf) as {
      chunks?: { id?: string; slug?: string; text?: string; vector?: number[] }[];
    };
    for (const ch of parsed.chunks ?? []) {
      if (
        typeof ch.slug !== "string" ||
        typeof ch.id !== "string" ||
        typeof ch.text !== "string" ||
        !Array.isArray(ch.vector)
      ) {
        continue;
      }
      const arr = map.get(ch.slug) ?? [];
      arr.push({ id: ch.id, text: ch.text, vector: ch.vector });
      map.set(ch.slug, arr);
    }
  } catch {
    // No prior chunks — everything embeds fresh.
  }
  return map;
}

async function main() {
  console.log(`Reading vault: ${WIKI_DIR}`);
  const files = await walk(WIKI_DIR);

  const neighborsPath = path.join(ROOT, "src/lib/wiki/neighbors.json");
  const vectorsPath = path.join(ROOT, "public/vault-vectors.json");
  const chunksPath = path.join(INDEX_DIR, "vault-chunks.json");

  // Load the prior index so unchanged notes can be reused without a model call.
  const priorManifest = await loadPriorManifest();
  const priorPageVectors = await loadPriorPageVectors(vectorsPath);
  const priorChunks = await loadPriorChunks(chunksPath);

  // Parse + assign slugs the same way the app does; fingerprint each note.
  const used = new Set<string>();
  const raw: RawNote[] = [];
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

    const body = cleanBody(content);
    raw.push({
      slug,
      title,
      dir,
      text: toEmbedText(title, content),
      body,
      hash: noteHash(body),
    });
  }

  const extractor = await pipeline("feature-extraction", MODEL);

  // Page pass: reuse the cached vector when the note's hash is unchanged and a
  // prior vector exists; otherwise embed fresh.
  const docs: Doc[] = [];
  let embedded = 0;
  let reused = 0;
  for (const r of raw) {
    const cachedVector = priorPageVectors.get(r.slug);
    if (priorManifest?.notes[r.slug] === r.hash && cachedVector) {
      docs.push({
        slug: r.slug,
        title: r.title,
        dir: r.dir,
        text: r.text,
        vector: cachedVector,
      });
      reused++;
    } else {
      const output = await extractor(r.text, {
        pooling: "mean",
        normalize: true,
      });
      docs.push({
        slug: r.slug,
        title: r.title,
        dir: r.dir,
        text: r.text,
        vector: Array.from(output.data as Float32Array),
      });
      embedded++;
      if (embedded % 40 === 0) console.log(`  embedded ${embedded}`);
    }
  }
  console.log(`Pages: embedded ${embedded}, reused ${reused} of ${raw.length}`);

  // Precompute top-K neighbors per page over ALL current vectors, so added and
  // removed notes are always reflected. Reused vectors are already rounded and
  // L2-normalized, so cosine over the mixed set is stable.
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

  await fs.mkdir(INDEX_DIR, { recursive: true });

  await fs.writeFile(neighborsPath, JSON.stringify(neighbors) + "\n");
  console.log(`Wrote ${neighborsPath}`);

  const dim = docs[0]?.vector.length ?? 0;
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

  // Chunk pass: finer-grained embeddings for sharper RAG retrieval. Reuse a
  // note's cached chunk vectors when its hash is unchanged and the cached chunk
  // count matches the freshly-computed pieces; otherwise embed each piece with
  // its title prefixed for context (raw chunk text is what gets stored).
  console.log("Embedding chunks…");
  const chunks: Chunk[] = [];
  let embeddedChunks = 0;
  let reusedChunks = 0;
  for (const r of raw) {
    const pieces = chunkText(r.body);
    const cachedChunks = priorChunks.get(r.slug);
    const canReuseChunks =
      priorManifest?.notes[r.slug] === r.hash &&
      cachedChunks !== undefined &&
      cachedChunks.length === pieces.length;

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (canReuseChunks && cachedChunks) {
        chunks.push({
          id: `${r.slug}#${i}`,
          slug: r.slug,
          title: r.title,
          dir: r.dir,
          text: piece,
          vector: cachedChunks[i].vector,
        });
        reusedChunks++;
        continue;
      }
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
      embeddedChunks++;
      if (embeddedChunks % 200 === 0) console.log(`  ${embeddedChunks} chunks`);
    }
  }
  console.log(
    `Chunks: embedded ${embeddedChunks}, reused ${reusedChunks} (${chunks.length} total)`,
  );

  const chunkDim = chunks[0]?.vector.length ?? dim;
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

  // Manifest last: records the content hashes this build indexed so the next
  // run and the freshness check can detect drift against the live vault.
  const manifest: Manifest = {
    builtAt: new Date().toISOString(),
    model: MODEL,
    dim,
    notes: Object.fromEntries(raw.map((r) => [r.slug, r.hash])),
  };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest) + "\n");
  console.log(`Wrote ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
