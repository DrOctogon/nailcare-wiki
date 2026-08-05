import "server-only";

// Optional LLM reranking stage for RAG retrieval.
//
// After the hybrid + MMR pipeline produces a small candidate pool, we ask the
// local Ollama model to reorder those candidates by relevance to the question.
// This is strictly best-effort: a timeout, a fetch failure, or an unparseable
// response falls back to the original order. The reranker NEVER throws and NEVER
// drops a candidate — omitted candidates are appended in their original order.

/**
 * The structural subset of a retrieved chunk the reranker needs. Any object
 * carrying these fields (e.g. `RetrievedChunk`) can be reranked; extra fields
 * are preserved because the generic `T` flows through untouched.
 */
export interface Rerankable {
  slug: string;
  title: string;
  text: string;
}

interface RerankOptions {
  host: string;
  model: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Shape of the non-streaming `/api/chat` response we consume. */
interface OllamaChatResponse {
  message?: { content?: string };
}

const DEFAULT_TIMEOUT_MS = 4000;
// How much of each chunk's body to show the model — enough to judge relevance
// without blowing up the prompt.
const SNIPPET_CHARS = 300;

/**
 * Build the compact reranking prompt: a numbered candidate list plus a strict
 * instruction to return ONLY a JSON array of indices, most- to least-relevant.
 */
function buildRerankPrompt(question: string, candidates: readonly Rerankable[]): string {
  const list = candidates
    .map((c, i) => `[${i}] ${c.title}: ${c.text.slice(0, SNIPPET_CHARS)}`)
    .join("\n");

  return (
    `Question: ${question}\n\n` +
    `Candidate passages:\n${list}\n\n` +
    `Rank the candidates from MOST to LEAST relevant to the question. ` +
    `Respond with ONLY a JSON array of the candidate indices in ranked order ` +
    `(for example [3,0,1,2]). Include every index exactly once. No prose.`
  );
}

/**
 * Coerce the model's parsed JSON into a validated permutation of candidate
 * indices, or `null` if it isn't a usable array of in-range integers.
 * Accepts either a bare array `[3,0,1]` or an object `{ order: [...] }`.
 * Duplicate and out-of-range indices are dropped; the permutation may be
 * partial — the caller appends any missing candidates.
 */
function parseOrder(raw: unknown, count: number): number[] | null {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { order?: unknown }).order)
      ? (raw as { order: unknown[] }).order
      : null;
  if (!arr) return null;

  const seen = new Set<number>();
  const order: number[] = [];
  for (const value of arr) {
    if (typeof value !== "number" || !Number.isInteger(value)) continue;
    if (value < 0 || value >= count) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    order.push(value);
  }
  return order;
}

/**
 * Reorder `candidates` by an index permutation, appending any candidate whose
 * index the permutation omitted (in original order) so nothing is ever dropped.
 */
function applyOrder<T>(candidates: readonly T[], order: readonly number[]): T[] {
  const reordered: T[] = order.map((i) => candidates[i]);
  const used = new Set(order);
  for (let i = 0; i < candidates.length; i++) {
    if (!used.has(i)) reordered.push(candidates[i]);
  }
  return reordered;
}

/**
 * Rerank `candidates` by asking the local LLM to order them by relevance to
 * `question`. Best-effort: on timeout, fetch error, or any parse/validation
 * failure it returns `candidates` unchanged. Never throws, never drops a
 * candidate.
 */
export async function llmRerank<T extends Rerankable>(
  question: string,
  candidates: T[],
  opts: RerankOptions,
): Promise<T[]> {
  if (candidates.length <= 1) return candidates;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Combine the internal timeout with the caller's signal: aborting either one
  // aborts the rerank fetch.
  const onExternalAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(`${opts.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: buildRerankPrompt(question, candidates) }],
        stream: false,
        format: "json",
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return candidates;

    const data = (await res.json()) as OllamaChatResponse;
    const content = data.message?.content;
    if (typeof content !== "string" || !content.trim()) return candidates;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return candidates;
    }

    const order = parseOrder(parsed, candidates.length);
    if (!order || order.length === 0) return candidates;

    return applyOrder(candidates, order);
  } catch {
    // Timeout, aborted request, network error, or malformed JSON body — fall
    // back to the original order. Reranking is a best-effort enhancement.
    return candidates;
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
  }
}
