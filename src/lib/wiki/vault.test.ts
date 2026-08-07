import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { WIKI_DIR, BROWSE_DIRS } from "./config";
import {
  getAllPageMetas,
  getStats,
  getGrowthSeries,
  getConnectivityHistogram,
  getGraph,
  getSearchIndex,
  getActivityCalendar,
  getCollectionGrowth,
  getCollectionChords,
  getMaturityDistribution,
  getTopicClusters,
  getTopNotes,
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

  it("getSearchIndex: every doc carries a bounded, string body", async () => {
    const docs = await getSearchIndex();
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(typeof doc.body).toBe("string");
      // Cleaned + capped (~600 chars, plus a trailing ellipsis on truncation).
      expect(doc.body.length).toBeLessThanOrEqual(601);
    }
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

  it("getActivityCalendar: sparse ascending days summing to dated non-index pages", async () => {
    const calendar = await getActivityCalendar();
    const metas = await getAllPageMetas();

    // Recompute the expected total the same way the function does: non-index
    // pages with a parseable `updated ?? created` leading YYYY-MM-DD.
    const expectedSum = metas.filter((m) => {
      if (m.isIndex) return false;
      const date = m.updated ?? m.created;
      return date ? /^(\d{4}-\d{2}-\d{2})/.test(date) : false;
    }).length;

    let prev = "";
    let sum = 0;
    for (const day of calendar) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(day.count)).toBe(true);
      expect(day.count).toBeGreaterThan(0);
      // Strictly ascending and therefore unique.
      expect(day.date > prev).toBe(true);
      prev = day.date;
      sum += day.count;
    }

    expect(sum).toBe(expectedSum);
  });

  it("getCollectionGrowth: cumulative per-dir series over a well-formed day axis", async () => {
    const series = await getCollectionGrowth();
    const metas = await getAllPageMetas();
    const browsable = new Set<string>(BROWSE_DIRS);

    // dirs: non-empty, unique, and a subset of the browsable set.
    expect(series.dirs.length).toBeGreaterThan(0);
    expect(new Set(series.dirs).size).toBe(series.dirs.length);
    for (const dir of series.dirs) {
      expect(browsable.has(dir)).toBe(true);
    }

    // Recompute the expected grand total the same way the function counts:
    // non-index pages in browsable dirs with a parseable `created ?? updated`.
    const expectedSum = metas.filter((m) => {
      if (m.isIndex) return false;
      if (!browsable.has(m.dir)) return false;
      const date = m.created ?? m.updated;
      return date ? /^(\d{4}-\d{2}-\d{2})/.test(date) : false;
    }).length;

    let prev = "";
    const prevByDir = new Map<string, number>(
      series.dirs.map((d): [string, number] => [d, 0]),
    );
    for (const point of series.points) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Strictly ascending and therefore unique.
      expect(point.date > prev).toBe(true);
      prev = point.date;
      // Every dir carries a numeric, monotonic non-decreasing cumulative value.
      for (const dir of series.dirs) {
        const value = point.counts[dir];
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThanOrEqual(prevByDir.get(dir) ?? 0);
        prevByDir.set(dir, value);
      }
    }

    if (series.points.length > 0) {
      const last = series.points[series.points.length - 1];
      const total = series.dirs.reduce((acc, dir) => acc + last.counts[dir], 0);
      expect(total).toBe(expectedSum);
    }
  });

  it("getCollectionChords: square matrix summing to browsable-to-browsable links", async () => {
    const chords = await getCollectionChords();
    const graph = await getGraph();
    const browsable = new Set<string>(BROWSE_DIRS);

    // dirs are unique.
    expect(new Set(chords.dirs).size).toBe(chords.dirs.length);

    // Square: matrix.length === dirs.length and every row has the same width.
    expect(chords.matrix.length).toBe(chords.dirs.length);
    for (const row of chords.matrix) {
      expect(row.length).toBe(chords.dirs.length);
      for (const entry of row) {
        expect(Number.isInteger(entry)).toBe(true);
        expect(entry).toBeGreaterThanOrEqual(0);
      }
    }

    // Total sum equals the number of links whose BOTH endpoints map to a
    // browsable dir — recomputed the same way the function selects links.
    const dirBySlug = new Map(graph.nodes.map((n) => [n.id, n.dir]));
    const expectedSum = graph.links.filter((link) => {
      const s = dirBySlug.get(link.source);
      const t = dirBySlug.get(link.target);
      return (
        s !== undefined && browsable.has(s) && t !== undefined && browsable.has(t)
      );
    }).length;

    const sum = chords.matrix.reduce(
      (acc, row) => acc + row.reduce((a, b) => a + b, 0),
      0,
    );
    expect(sum).toBe(expectedSum);
  });

  it("getMaturityDistribution: ladder-ordered funnel with an optional trailing Other", async () => {
    const stages = await getMaturityDistribution();
    const metas = await getAllPageMetas();

    // First five entries are the canonical ladder, in order.
    const ladder = ["seed", "developing", "stable", "evergreen", "mature"];
    expect(stages.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < ladder.length; i++) {
      expect(stages[i].status).toBe(ladder[i]);
    }

    // Every stage count is non-negative.
    for (const stage of stages) {
      expect(stage.count).toBeGreaterThanOrEqual(0);
    }

    // A sixth entry, if present, is the non-empty "other" bucket.
    if (stages.length > 5) {
      expect(stages.length).toBe(6);
      expect(stages[5].status).toBe("other");
      expect(stages[5].count).toBeGreaterThan(0);
    }

    // Null-status pages are excluded, so the counts can't exceed non-index pages.
    const nonIndexCount = metas.filter((m) => !m.isIndex).length;
    const sum = stages.reduce((acc, s) => acc + s.count, 0);
    expect(sum).toBeLessThanOrEqual(nonIndexCount);
  });

  it("getTopicClusters: finite-coordinate nodes with a bounded community count", async () => {
    const clusters = await getTopicClusters();
    expect(clusters.nodes.length).toBeGreaterThan(0);

    for (const node of clusters.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(typeof node.pagerank).toBe("number");
      expect(node.pagerank).toBeGreaterThanOrEqual(0);
    }

    // Node ids are unique.
    const ids = clusters.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);

    // At least one community, at most one per node.
    expect(clusters.communities).toBeGreaterThanOrEqual(1);
    expect(clusters.communities).toBeLessThanOrEqual(clusters.nodes.length);
  });

  it("getTopNotes: pagerank-descending, unique slugs, respecting the limit", async () => {
    const notes = await getTopNotes();

    // Default limit caps the list at 15.
    expect(notes.length).toBeLessThanOrEqual(15);

    // PageRank is monotonic non-increasing; backlink counts are non-negative.
    let prev = Infinity;
    for (const note of notes) {
      expect(note.pagerank).toBeLessThanOrEqual(prev);
      expect(note.backlinkCount).toBeGreaterThanOrEqual(0);
      prev = note.pagerank;
    }

    // Slugs are unique.
    const slugs = notes.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    // An explicit smaller limit is honored.
    const limited = await getTopNotes(5);
    expect(limited.length).toBeLessThanOrEqual(5);
  });
});
