import { describe, it, expect, beforeEach, vi } from "vitest";

// `retrieveChunks` reads `.index/vault-chunks.json` from disk and caches the
// parsed chunks in a module-level singleton. We mock `node:fs/promises` so the
// test is independent of any real index file, and re-import the module fresh in
// each test (via vi.resetModules) so the singleton cache never leaks across
// cases.
const readFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  default: { readFile },
  readFile,
}));

// A tiny fixed index: 3-dim unit vectors so cosine == dot product, plus one
// wrong-dimension chunk to exercise the length-mismatch skip.
const CHUNK_FILE = {
  model: "test-embed",
  dim: 3,
  chunks: [
    { id: "a#0", slug: "a", title: "A", dir: "concepts", text: "alpha", vector: [1, 0, 0] },
    { id: "b#0", slug: "b", title: "B", dir: "concepts", text: "beta", vector: [0, 1, 0] },
    { id: "c#0", slug: "c", title: "C", dir: "concepts", text: "gamma", vector: [0, 0, 1] },
    { id: "d#0", slug: "d", title: "D", dir: "concepts", text: "delta", vector: [0.6, 0.8, 0] },
    // Wrong dimensionality: must be skipped rather than crash.
    { id: "x#0", slug: "x", title: "X", dir: "concepts", text: "bad", vector: [1, 0] },
  ],
};

/** Reset the module cache and re-import against the current readFile mock. */
async function freshRetrieve() {
  vi.resetModules();
  const mod = await import("./rag-retrieval");
  return mod.retrieveChunks;
}

beforeEach(() => {
  readFile.mockReset();
});

describe("retrieveChunks", () => {
  it("ranks the exact-match chunk first with score ≈ 1", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const retrieveChunks = await freshRetrieve();

    const results = await retrieveChunks([1, 0, 0], 8);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe("a");
    expect(results[0].score).toBeCloseTo(1, 5);
    // "d" partially aligns ([0.6,0.8,0]·[1,0,0] = 0.6) and outranks the orthogonals.
    expect(results[1].slug).toBe("d");
    expect(results[1].score).toBeCloseTo(0.6, 5);
    // The wrong-dimension chunk "x" is skipped entirely.
    expect(results.some((r) => r.slug === "x")).toBe(false);
  });

  it("caps the number of results at `limit`", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const retrieveChunks = await freshRetrieve();

    const results = await retrieveChunks([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe("a");
  });

  it("returns [] when the query vector's length matches no chunk", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const retrieveChunks = await freshRetrieve();

    // Length 5 matches none of the fixture chunks (dims 3 and 2).
    const results = await retrieveChunks([0.1, 0.2, 0.3, 0.4, 0.5], 8);
    expect(results).toEqual([]);
  });

  it("returns [] for an empty query vector without touching the file", async () => {
    readFile.mockResolvedValue(JSON.stringify(CHUNK_FILE));
    const retrieveChunks = await freshRetrieve();

    const results = await retrieveChunks([], 8);
    expect(results).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("degrades to [] (no throw) when the index file is unreadable", async () => {
    readFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const retrieveChunks = await freshRetrieve();

    const results = await retrieveChunks([1, 0, 0], 8);
    expect(results).toEqual([]);
  });
});
