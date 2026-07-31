import "server-only";

// Server-side chunk-level RAG retrieval as a two-stage pipeline:
//
//   Stage 1 — hybrid recall: an Orama index fuses BM25 keyword scoring with
//   MiniLM vector similarity to pull a generous candidate pool (`FETCH_N`) that
//   catches both semantically-close chunks and keyword-only matches the pure
//   vector side would miss.
//
//   Stage 2 — MMR rerank: Maximal Marginal Relevance trims the pool down to
//   `limit`, trading a little relevance for diversity so near-duplicate chunks
//   from the same note don't crowd out the answer.
//
// The precomputed per-chunk vectors live in `.index/vault-chunks.json` (read
// from disk — NOT web-served). The index (Orama db + id→chunk map) is built
// once, lazily, and cached for the life of the process.

import fs from "node:fs/promises";
import path from "node:path";
import {
  create,
  insertMultiple,
  search,
  type AnyOrama,
  type Vector,
} from "@orama/orama";

// Orama's generic `search` over-infers the schema type and trips TS2589. Call it
// through a loose, non-generic alias — runtime behavior is identical.
type LooseSearch = (
  db: AnyOrama,
  params: Record<string, unknown>,
) => Promise<{ hits: { id: string | number; score: number }[] }>;
const searchLoose = search as unknown as LooseSearch;

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

/** A recall candidate: the stored chunk plus its cosine relevance to the query. */
interface Candidate {
  id: string;
  slug: string;
  title: string;
  dir: string;
  text: string;
  vector: number[];
  rel: number;
}

/** What the MMR reranker needs from each candidate. */
interface MmrItem {
  vector: number[];
  rel: number;
}

const CHUNKS_PATH = path.join(process.cwd(), ".index", "vault-chunks.json");

// Stage-1 recall depth: pull well beyond `limit` so MMR has room to diversify.
const RECALL_MULTIPLIER = 3;
const RECALL_FLOOR = 24;
// Orama drops vector candidates below this cosine similarity from the fused set.
const SIMILARITY_THRESHOLD = 0.1;
// Hybrid fusion weights: lean on the vector side, let BM25 rescue keyword hits.
const HYBRID_WEIGHTS = { text: 0.4, vector: 0.6 } as const;
// MMR relevance/diversity tradeoff (λ): 0.7 favors relevance, penalizes dupes.
const MMR_LAMBDA = 0.7;

/** Cosine similarity of two L2-normalized vectors — sum of elementwise products. */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Maximal Marginal Relevance: greedily pick `limit` items, each time maximizing
 * `λ·rel − (1−λ)·maxSimilarityToAlreadySelected`. Pure helper so the diversity
 * behavior is unit-testable in isolation.
 */
export function mmr<T extends MmrItem>(
  candidates: readonly T[],
  limit: number,
  lambda: number = MMR_LAMBDA,
): T[] {
  const selected: T[] = [];
  const pool: T[] = [...candidates];

  while (selected.length < limit && pool.length > 0) {
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const diversity =
        selected.length > 0
          ? Math.max(...selected.map((s) => dot(pool[i].vector, s.vector)))
          : 0;
      const score = lambda * pool[i].rel - (1 - lambda) * diversity;
      if (score > best) {
        best = score;
        bestIdx = i;
      }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }

  return selected;
}

interface VaultIndex {
  db: ReturnType<typeof create> | null;
  chunksById: Map<string, StoredChunk>;
  dim: number;
}

let indexPromise: Promise<VaultIndex> | null = null;

/**
 * Read + parse `.index/vault-chunks.json` and build the Orama db + id→chunk map.
 * Missing/unreadable/empty index degrades to `{ db: null, ... }` rather than
 * throwing, so callers can retry after a reindex.
 */
async function buildIndex(): Promise<VaultIndex> {
  const empty: VaultIndex = {
    db: null,
    chunksById: new Map<string, StoredChunk>(),
    dim: 0,
  };

  let file: ChunkFile;
  try {
    const buf = await fs.readFile(CHUNKS_PATH, "utf8");
    file = JSON.parse(buf) as ChunkFile;
  } catch {
    // Missing/unreadable/malformed index: degrade to no chunks.
    return empty;
  }

  const rawChunks = Array.isArray(file.chunks) ? file.chunks : [];
  const dim =
    Number.isInteger(file.dim) && file.dim > 0
      ? file.dim
      : (rawChunks[0]?.vector?.length ?? 0);
  if (rawChunks.length === 0 || dim <= 0) return empty;

  // Orama rejects a batch containing a wrong-dimension vector, so keep only
  // chunks whose vector matches the index dimension (mirrors the old skip).
  const valid = rawChunks.filter(
    (chunk) => Array.isArray(chunk.vector) && chunk.vector.length === dim,
  );
  if (valid.length === 0) return empty;

  const chunksById = new Map<string, StoredChunk>();
  for (const chunk of valid) chunksById.set(chunk.id, chunk);

  // Dimension is dynamic (384 in prod, small in tests), so the schema can't be a
  // literal; type `db` as the loose AnyOrama to avoid Orama's deep generic
  // inference (which otherwise trips TS2589 on `search`). Orama validates the
  // vector dimension at runtime.
  const schema = {
    text: "string" as const,
    embedding: `vector[${dim}]` as Vector,
  };
  const db: AnyOrama = create({ schema });
  insertMultiple(
    db,
    valid.map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.vector,
    })),
  );

  return { db, chunksById, dim };
}

/**
 * Load the vault index once, caching the promise. If the build degraded to an
 * empty index (missing file), reset the singleton so a later call retries.
 */
function loadIndex(): Promise<VaultIndex> {
  if (!indexPromise) {
    indexPromise = buildIndex().then((index) => {
      if (!index.db) indexPromise = null;
      return index;
    });
  }
  return indexPromise;
}

/**
 * Drop the cached index so the next `retrieveChunks` re-reads
 * `.index/vault-chunks.json` from disk. Called after a successful reindex so a
 * long-lived server process picks up freshly embedded chunks without a restart.
 */
export function invalidateChunks(): void {
  indexPromise = null;
}

/**
 * Retrieve the top-`limit` chunks for `question` + `queryVector` via hybrid
 * recall (BM25 + vector) followed by an MMR diversity rerank. An empty query
 * vector, an empty/missing index, or a query whose dimension doesn't match the
 * index yields `[]` (never throws).
 */
export async function retrieveChunks(
  question: string,
  queryVector: number[],
  limit = 8,
): Promise<RetrievedChunk[]> {
  if (queryVector.length === 0) return [];

  const { db, chunksById, dim } = await loadIndex();
  if (!db || chunksById.size === 0) return [];
  // A mismatched query dimension can't be scored against the index — bail
  // rather than let Orama throw on the size mismatch.
  if (queryVector.length !== dim) return [];

  // Stage 1 — hybrid recall.
  const fetchN = Math.max(limit * RECALL_MULTIPLIER, RECALL_FLOOR);
  const term = question.trim();
  const res =
    term.length > 0
      ? await searchLoose(db, {
          mode: "hybrid",
          term,
          vector: { value: queryVector, property: "embedding" },
          similarity: SIMILARITY_THRESHOLD,
          hybridWeights: HYBRID_WEIGHTS,
          limit: fetchN,
        })
      : await searchLoose(db, {
          mode: "vector",
          vector: { value: queryVector, property: "embedding" },
          similarity: SIMILARITY_THRESHOLD,
          limit: fetchN,
        });

  const candidates: Candidate[] = [];
  for (const hit of res.hits) {
    const stored = chunksById.get(String(hit.id));
    if (!stored) continue; // hit id not in the map — skip defensively
    candidates.push({
      id: stored.id,
      slug: stored.slug,
      title: stored.title,
      dir: stored.dir,
      text: stored.text,
      vector: stored.vector,
      rel: dot(queryVector, stored.vector),
    });
  }

  // Stage 2 — MMR rerank down to `limit`.
  const selected = mmr(candidates, limit, MMR_LAMBDA);

  return selected.map((c) => ({
    slug: c.slug,
    title: c.title,
    dir: c.dir,
    text: c.text,
    score: c.rel,
  }));
}
