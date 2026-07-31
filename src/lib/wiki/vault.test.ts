import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { WIKI_DIR } from "./config";
import {
  getAllPageMetas,
  getStats,
  getGrowthSeries,
  getConnectivityHistogram,
  getGraph,
} from "./vault";

// Integration test against the real sibling vault. Skip cleanly when the vault
// checkout is absent so the suite still passes on machines without it. Assert
// STRUCTURAL INVARIANTS, not exact counts, so ordinary vault edits don't break
// the tests.
const hasVault = fs.existsSync(WIKI_DIR);
const suite = hasVault ? describe : describe.skip;

if (!hasVault) {
  console.warn(`[vault.test] WIKI_DIR not found at ${WIKI_DIR}; skipping.`);
}

suite("vault (real content invariants)", () => {
  it("getAllPageMetas: non-empty, well-formed, unique slugs", async () => {
    const metas = await getAllPageMetas();
    expect(metas.length).toBeGreaterThan(0);

    for (const meta of metas) {
      expect(typeof meta.slug).toBe("string");
      expect(meta.slug.length).toBeGreaterThan(0);
      expect(typeof meta.title).toBe("string");
      expect(meta.title.length).toBeGreaterThan(0);
    }

    const slugs = metas.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("getStats: totals and per-dir counts are consistent", async () => {
    const stats = await getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.totalTags).toBeGreaterThanOrEqual(0);
    expect(stats.totalLinks).toBeGreaterThanOrEqual(0);

    const byDirSum = stats.byDir.reduce((acc, d) => acc + d.count, 0);
    // Pages without a top-level dir aren't counted in byDir, so the sum can be
    // at most the total number of (non-index) pages.
    expect(byDirSum).toBeLessThanOrEqual(stats.total);
    for (const d of stats.byDir) {
      expect(d.count).toBeGreaterThan(0);
      expect(d.dir.length).toBeGreaterThan(0);
    }
  });

  it("getGrowthSeries: cumulative is monotonic and bounded by total pages", async () => {
    const series = await getGrowthSeries();
    const stats = await getStats();

    let prev = -1;
    for (const point of series) {
      expect(point.cumulative).toBeGreaterThanOrEqual(prev);
      expect(point.added).toBeGreaterThan(0);
      prev = point.cumulative;
    }

    if (series.length > 0) {
      const last = series[series.length - 1].cumulative;
      // Only dated non-index pages contribute, so the running total can't
      // exceed the count of all non-index pages.
      expect(last).toBeLessThanOrEqual(stats.total);
    }
  });

  it("getConnectivityHistogram: bin counts sum to the non-index page count", async () => {
    const histogram = await getConnectivityHistogram();
    const metas = await getAllPageMetas();
    const nonIndexCount = metas.filter((m) => !m.isIndex).length;

    const binSum = histogram.reduce((acc, bin) => acc + bin.count, 0);
    expect(binSum).toBe(nonIndexCount);
  });

  it("getGraph: links reference existing nodes with no self-loops", async () => {
    const graph = await getGraph();
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    // Node ids are unique.
    expect(nodeIds.size).toBe(graph.nodes.length);

    for (const link of graph.links) {
      expect(nodeIds.has(link.source)).toBe(true);
      expect(nodeIds.has(link.target)).toBe(true);
      expect(link.source).not.toBe(link.target);
    }
  });
});
