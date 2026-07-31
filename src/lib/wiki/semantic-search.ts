"use client";

// Client-side semantic search. Lazily loads the same MiniLM model used at build
// time (via transformers.js, in-browser — the vault text never leaves the page)
// plus the precomputed page vectors, then ranks by cosine similarity. Everything
// is loaded on first use so the default keyword palette stays instant.

export interface VectorDoc {
  slug: string;
  title: string;
  dir: string;
  vector: number[];
}

interface VectorFile {
  model: string;
  dim: number;
  docs: VectorDoc[];
}

export interface SemanticHit {
  slug: string;
  title: string;
  dir: string;
  score: number;
}

type Extractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let docsPromise: Promise<VectorDoc[]> | null = null;
let extractorPromise: Promise<Extractor> | null = null;

const MODEL = "Xenova/all-MiniLM-L6-v2";

export function loadDocs(): Promise<VectorDoc[]> {
  if (!docsPromise) {
    docsPromise = fetch("/vault-vectors.json")
      .then((res) => {
        if (!res.ok) throw new Error(`vectors ${res.status}`);
        return res.json() as Promise<VectorFile>;
      })
      .then((file) => file.docs)
      .catch((err) => {
        docsPromise = null;
        throw err;
      });
  }
  return docsPromise;
}

function loadExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers")
      .then(({ pipeline, env }) => {
        // Pull weights from the HF CDN; never bundle-resolve local files.
        env.allowLocalModels = false;
        return pipeline("feature-extraction", MODEL) as unknown as Promise<Extractor>;
      })
      .catch((err) => {
        extractorPromise = null;
        throw err;
      });
  }
  return extractorPromise;
}

/** Warm the model + vectors ahead of the first query. */
export function primeSemanticSearch(): void {
  // Fire-and-forget warmup: swallow rejections here (the real query call
  // re-triggers and surfaces the error to the user).
  loadDocs().catch(() => {});
  loadExtractor().catch(() => {});
}

function cosine(a: number[], b: number[] | Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both sides are L2-normalized
}

/** Embed a query with the mean-pooled, L2-normalized MiniLM extractor. */
export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await loadExtractor();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

export async function semanticSearch(
  query: string,
  limit = 12,
): Promise<SemanticHit[]> {
  const q = query.trim();
  if (!q) return [];
  const [docs, qv] = await Promise.all([loadDocs(), embedQuery(q)]);

  return docs
    .map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      dir: doc.dir,
      score: cosine(qv, doc.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
