"use client";

// Client-side hybrid search over the vault. Builds an Orama index in the browser
// that fuses BM25 keyword scoring with MiniLM vector similarity, reusing the same
// precomputed page vectors + in-page extractor as the semantic-search module.
// The index is built lazily on first use so the default keyword palette stays
// instant.

import { create, insertMultiple, search } from "@orama/orama";

import type { SearchDoc } from "./vault";
import { loadDocs, embedQuery } from "./semantic-search";

export interface HybridHit {
  slug: string;
  title: string;
  dir: string;
  score: number;
}

const schema = {
  title: "string",
  excerpt: "string",
  tags: "string[]",
  embedding: "vector[384]",
} as const;

async function buildDb(searchDocs: SearchDoc[]) {
  const vectors = await loadDocs();
  const vectorBySlug = new Map(vectors.map((v) => [v.slug, v.vector]));

  const db = create({ schema });

  // Only index docs that carry a precomputed vector — hybrid search needs the
  // embedding, and unvectored docs would poison the vector side of the fusion.
  const rows = searchDocs
    .map((doc) => {
      const embedding = vectorBySlug.get(doc.slug);
      if (!embedding) return null;
      return {
        id: doc.slug,
        title: doc.title,
        excerpt: doc.excerpt,
        tags: doc.tags,
        embedding,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  insertMultiple(db, rows);
  return db;
}

type HybridDb = Awaited<ReturnType<typeof buildDb>>;

let dbPromise: Promise<HybridDb> | null = null;

function ensureDb(searchDocs: SearchDoc[]): Promise<HybridDb> {
  if (!dbPromise) {
    dbPromise = buildDb(searchDocs).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Warm the Orama index + extractor ahead of the first query. */
export function primeHybrid(searchDocs: SearchDoc[]): void {
  // Fire-and-forget warmup: swallow rejections here (the real query call
  // re-triggers and surfaces the error to the user).
  ensureDb(searchDocs).catch(() => {});
  embedQuery("").catch(() => {});
}

export async function hybridSearch(
  query: string,
  searchDocs: SearchDoc[],
  limit = 12,
): Promise<HybridHit[]> {
  const q = query.trim();
  if (!q) return [];

  const [db, qv] = await Promise.all([ensureDb(searchDocs), embedQuery(q)]);

  const res = await search(db, {
    mode: "hybrid",
    term: q,
    vector: { value: qv, property: "embedding" },
    similarity: 0.1,
    hybridWeights: { text: 0.5, vector: 0.5 },
    limit,
  });

  // Resolve title + dir from the SearchDoc index rather than trusting Orama to
  // return non-schema fields; preserve Orama's ranked order.
  const bySlug = new Map(searchDocs.map((doc) => [doc.slug, doc]));

  return res.hits
    .map((hit) => {
      const doc = bySlug.get(String(hit.id));
      if (!doc) return null;
      return { slug: doc.slug, title: doc.title, dir: doc.dir, score: hit.score };
    })
    .filter((hit): hit is HybridHit => hit !== null);
}
