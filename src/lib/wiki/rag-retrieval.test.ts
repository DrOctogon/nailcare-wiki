import { describe, it, expect, beforeEach, vi } from "vitest";

// `retrieveChunks` reads `.index/vault-chunks.json` from disk and builds an
// Orama index + id→chunk map in a module-level singleton. We mock
// `node:fs/promises` so the test is independent of any real index file, and
// re-import the module fresh in each test (via vi.resetModules) so the singleton
// cache never leaks across cases.
const readFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  default: { readFile },
  readFile,
}));

// A tiny fixed index (dim 3, unit-ish vectors so dot == cosine). It deliberately
// contains:
//   - two NEAR-DUPLICATE chunks from the same slug ("dup") — identical vectors,
//     both highly relevant to a [1,0,0]/[0.8,0.6,0] query;
//   - a DIVERSE chunk ("div") that is relevant to [1,0,0] but points away from
//     the dupes (so MMR should prefer it over a second dupe);
//   - a KEYWORD-ONLY chunk ("kw") whose text holds a rare term but whose vector
//     is orthogonal to the query (only BM25 can surface it);
//   - a low-relevance filler ("fill").
const CHUNK_FILE = {
  model: "test-embed",
  dim: 3,
  chunks: [
    { id: "dup#0", slug: "dup", title: "Dup", dir: "concepts", text: "gel polish shine", vector: [0.8, 0.6, 0] },
    { id: "dup#1", slug: "dup", title: "Dup", dir: "concepts", text: "gel polish gloss", vector: [0.8, 0.6, 0] },
    { id: "div#0", slug: "div", title: "Div", dir: "concepts", text: "acrylic set", vector: [0.8, -0.6, 0] },
    { id: "kw#0", slug: "kw", title: "Kw", dir: "concepts", text: "the zorptastic technique", vector: [0, 0, 1] },
    { id: "fill#0", slug: "fill", title: "Fill", dir: "concepts", text: "beta note", vector: [0, 1, 0] },
  ],
};

/** Reset the module cache and re-import against the current readFile mock. */
async function freshModule() {
  vi.resetModules();
  return import("./rag-retrieval");
}

beforeEach(() => {
  readFile.mockReset();
});

describe("retrieveChunks — two-stage hybrid + MMR", () => {
  it("(a) ranks the exact-vector-match chunk's content highly", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks } = await freshModule();

    // Query == the dup vector, so its cosine relevance is ~1.
    const results = await retrieveChunks("gel polish", [0.8, 0.6, 0], 8);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("dup");
    expect(results[0].score).toBeCloseTo(1, 5);
    expect(results[0].text).toMatch(/gel polish/);
  });

  it("(b) MMR drops a near-duplicate in favor of a diverse chunk", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks } = await freshModule();

    // Both dupes and the diverse chunk are ~equally relevant to [1,0,0], but MMR
    // must not fill both top slots with the same-slug dupe.
    const results = await retrieveChunks("gel polish", [1, 0, 0], 2);

    expect(results).toHaveLength(2);
    // The diverse chunk earns a slot...
    expect(results.some((r) => r.slug === "div")).toBe(true);
    // ...and the near-duplicate pair does NOT occupy both slots.
    expect(results.filter((r) => r.slug === "dup").length).toBe(1);
  });

  it("(c) hybrid recall surfaces a keyword match whose vector is weak (BM25)", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks } = await freshModule();

    // Vector-only (empty question): the orthogonal "kw" chunk is below the
    // similarity floor and never surfaces.
    const vectorOnly = await retrieveChunks("", [1, 0, 0], 8);
    expect(vectorOnly.some((r) => r.slug === "kw")).toBe(false);

    // With the rare term in the question, BM25 rescues "kw" even though its
    // vector is orthogonal to the query.
    const hybrid = await retrieveChunks("zorptastic", [1, 0, 0], 8);
    expect(hybrid.some((r) => r.slug === "kw")).toBe(true);
  });

  it("(d) returns [] for an empty query vector without touching the file", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks } = await freshModule();

    const results = await retrieveChunks("anything", [], 8);
    expect(results).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("(e) degrades to [] (no throw) when the index file is unreadable", async () => {
    readFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const { retrieveChunks } = await freshModule();

    const results = await retrieveChunks("gel polish", [1, 0, 0], 8);
    expect(results).toEqual([]);
  });

  it("returns [] when the query dimension doesn't match the index", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks } = await freshModule();

    // Length 5 matches neither the index dim (3) nor any chunk.
    const results = await retrieveChunks("gel polish", [0.1, 0.2, 0.3, 0.4, 0.5], 8);
    expect(results).toEqual([]);
  });

  it("caps the number of results at `limit`", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks } = await freshModule();

    const results = await retrieveChunks("gel polish", [0.8, 0.6, 0], 2);
    expect(results).toHaveLength(2);
  });

  it("re-reads the index after invalidateChunks()", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const { retrieveChunks, invalidateChunks } = await freshModule();

    await retrieveChunks("gel polish", [1, 0, 0], 4);
    const callsAfterFirst = readFile.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Without invalidation, the cached index is reused (no extra read).
    await retrieveChunks("gel polish", [1, 0, 0], 4);
    expect(readFile.mock.calls.length).toBe(callsAfterFirst);

    // After invalidation, the next call re-reads from disk.
    invalidateChunks();
    await retrieveChunks("gel polish", [1, 0, 0], 4);
    expect(readFile.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("mmr — diversity rerank", () => {
  it("prefers a diverse item over a near-duplicate despite lower relevance", async () => {
    const { mmr } = await freshModule();

    const candidates = [
      { id: "a", vector: [1, 0, 0], rel: 1.0 },
      { id: "b", vector: [1, 0, 0], rel: 0.99 }, // near-duplicate of "a"
      { id: "c", vector: [0, 1, 0], rel: 0.9 }, // diverse, slightly lower rel
    ];

    // Pure relevance ordering would pick [a, b]; MMR trades a little relevance
    // for diversity and picks [a, c].
    const out = mmr(candidates, 2, 0.7);
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("returns everything when limit exceeds the candidate count", async () => {
    const { mmr } = await freshModule();
    const candidates = [
      { id: "a", vector: [1, 0, 0], rel: 1.0 },
      { id: "b", vector: [0, 1, 0], rel: 0.5 },
    ];
    expect(mmr(candidates, 8, 0.7)).toHaveLength(2);
  });
});
