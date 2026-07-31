"use client";

// Client-side chunk-level semantic search for RAG context. Loads the
// precomputed per-chunk vectors (public/vault-chunks.json) and ranks them by
// cosine similarity against the query embedding. Reuses the same lazily-loaded
// MiniLM extractor as the page-level semantic search — the vault text never
// leaves the page. Loaded on first use so the default palette stays instant.

import { embedQuery } from "./semantic-search";

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

export interface ChunkHit {
  id: string;
  slug: string;
  title: string;
  dir: string;
  text: string;
  score: number;
}

let chunksPromise: Promise<StoredChunk[]> | null = null;

function loadChunks(): Promise<StoredChunk[]> {
  if (!chunksPromise) {
    chunksPromise = fetch("/vault-chunks.json")
      .then((res) => {
        if (!res.ok) throw new Error(`chunks ${res.status}`);
        return res.json() as Promise<ChunkFile>;
      })
      .then((file) => file.chunks)
      .catch((err) => {
        chunksPromise = null;
        throw err;
      });
  }
  return chunksPromise;
}

/** Warm the chunk vectors ahead of the first query. */
export function primeChunkSearch(): void {
  // Fire-and-forget warmup: swallow rejections here (the real query call
  // re-triggers and surfaces the error to the user).
  loadChunks().catch(() => {});
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both sides are L2-normalized
}

export async function chunkSearch(
  query: string,
  limit = 8,
): Promise<ChunkHit[]> {
  const q = query.trim();
  if (!q) return [];
  const [chunks, qv] = await Promise.all([loadChunks(), embedQuery(q)]);

  return chunks
    .map((chunk) => ({
      id: chunk.id,
      slug: chunk.slug,
      title: chunk.title,
      dir: chunk.dir,
      text: chunk.text,
      score: cosine(qv, chunk.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
