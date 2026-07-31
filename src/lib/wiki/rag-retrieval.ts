import "server-only";

// Server-side chunk-level RAG retrieval. Holds the precomputed per-chunk
// vectors (`.index/vault-chunks.json`, read from disk — NOT web-served) and
// ranks them by cosine similarity against a query vector the client embeds in
// the browser. The chunk file is loaded once, lazily, and cached for the life
// of the process.

import fs from "node:fs/promises";
import path from "node:path";

interface StoredChunk {
  id: string;
  slug: string;
  title: string;
  dir: string;
  text: string;
  vector: number[];
}

interface ChunkFile {
  model: string;
  dim: number;
  chunks: StoredChunk[];
}

export interface RetrievedChunk {
  slug: string;
  title: string;
  dir: string;
  text: string;
  score: number;
}

const CHUNKS_PATH = path.join(process.cwd(), ".index", "vault-chunks.json");

let chunksPromise: Promise<StoredChunk[]> | null = null;

/**
 * Load the chunk vectors from disk once, caching the promise. If the file is
 * missing or unreadable (e.g. before `pnpm embed` has run), resolve to an empty
 * list and reset the singleton so a later call retries rather than caching the
 * failure permanently.
 */
function loadChunks(): Promise<StoredChunk[]> {
  if (!chunksPromise) {
    chunksPromise = fs
      .readFile(CHUNKS_PATH, "utf8")
      .then((buf) => {
        const file = JSON.parse(buf) as ChunkFile;
        return Array.isArray(file.chunks) ? file.chunks : [];
      })
      .catch(() => {
        // Missing/unreadable index: degrade to no chunks, and reset so a later
        // call (after the index is built) can retry.
        chunksPromise = null;
        return [];
      });
  }
  return chunksPromise;
}

/**
 * Drop the cached chunk promise so the next `retrieveChunks` re-reads
 * `.index/vault-chunks.json` from disk. Called after a successful reindex so a
 * long-lived server process picks up freshly embedded chunks without a restart.
 */
export function invalidateChunks(): void {
  chunksPromise = null;
}

/** Cosine similarity of two L2-normalized vectors (dot product). */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Retrieve the top-`limit` chunks by cosine similarity to `queryVector`.
 * Chunks whose vector length doesn't match the query are skipped. An empty
 * query vector or an empty index yields `[]`.
 */
export async function retrieveChunks(
  queryVector: number[],
  limit = 8,
): Promise<RetrievedChunk[]> {
  if (queryVector.length === 0) return [];

  const chunks = await loadChunks();
  if (chunks.length === 0) return [];

  const scored: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    if (chunk.vector.length !== queryVector.length) continue;
    scored.push({
      slug: chunk.slug,
      title: chunk.title,
      dir: chunk.dir,
      text: chunk.text,
      score: cosine(queryVector, chunk.vector),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
