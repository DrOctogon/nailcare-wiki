import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { NAIL_MASTER_FILE } from "./config";
import {
  getSalons,
  getSalonFacets,
  querySalons,
  getSalonGeo,
} from "./salons";

// Integration test against the real sibling dataset. Skip cleanly when the file
// is absent so the suite still passes on machines/CI without it. Assert
// STRUCTURAL INVARIANTS, not exact counts, so ordinary data refreshes don't
// break the tests.
const hasData = fs.existsSync(NAIL_MASTER_FILE);
const suite = hasData ? describe : describe.skip;

if (!hasData) {
  console.warn(`[salons.test] NAIL_MASTER_FILE not found at ${NAIL_MASTER_FILE}; skipping.`);
}

// Raw variants that country normalization must collapse away.
const US_RAW_VARIANTS = ["US", "USA", "U.S.", "U.S.A.", "united states", "AMERICA"];

suite("salons (real dataset invariants)", () => {
  it("getSalons: non-empty, well-formed rows", async () => {
    const rows = await getSalons();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.name).toBe("string");
      expect(Array.isArray(row.sources)).toBe(true);
      expect(Array.isArray(row.brands)).toBe(true);
    }
  });

  it("getSalonFacets: country normalization collapsed the US variants", async () => {
    const facets = await getSalonFacets();
    const countryValues = new Set(facets.countries.map((f) => f.value));
    // The canonical name is present...
    expect(countryValues.has("United States")).toBe(true);
    // ...and none of the raw US variants survive as distinct facet values.
    for (const variant of US_RAW_VARIANTS) {
      expect(countryValues.has(variant)).toBe(false);
    }
  });

  it("getSalonFacets: coverage counts are consistent and bounded", async () => {
    const facets = await getSalonFacets();
    expect(facets.total).toBeGreaterThan(0);
    expect(facets.withGeo).toBeLessThanOrEqual(facets.total);
    expect(facets.withRating).toBeLessThanOrEqual(facets.total);
    expect(facets.countries.length).toBeLessThanOrEqual(40);
    expect(facets.states.length).toBeLessThanOrEqual(40);
  });

  it("querySalons: respects pageSize cap and total >= rows.length", async () => {
    const all = await getSalons();
    const capped = querySalons(all, { pageSize: 9999 });
    expect(capped.pageSize).toBeLessThanOrEqual(200);
    expect(capped.rows.length).toBeLessThanOrEqual(200);
    expect(capped.total).toBeGreaterThanOrEqual(capped.rows.length);
    expect(capped.total).toBe(all.length); // no filters → total is the full set

    const page = querySalons(all, { pageSize: 25, page: 2 });
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(25);
    expect(page.rows.length).toBeLessThanOrEqual(25);
    expect(page.total).toBeGreaterThanOrEqual(page.rows.length);
  });

  it("getSalonGeo: points are [lng, lat] within valid ranges and capped", async () => {
    const { count, points } = await getSalonGeo({ hasGeo: true });
    expect(count).toBe(points.length);
    expect(count).toBeLessThanOrEqual(60000);
    for (const [lng, lat] of points) {
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });
});
