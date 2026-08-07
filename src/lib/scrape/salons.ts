import "server-only";

import fs from "node:fs/promises";

import { NAIL_MASTER_FILE } from "./config";

/**
 * Public, normalized salon record. Two other agents (the UI and the map layer)
 * depend on this shape verbatim — do not rename or retype fields.
 */
export interface Salon {
  name: string;
  entityType: string; // "salon" | "tech" | other
  sources: string[];
  brands: string[];
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null; // NORMALIZED display name (see normalizeCountry)
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bookingUrl: string | null; // from booking_url
  rating: number | null;
  reviewCount: number | null; // from review_count
  confidence: number | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
}

export interface Facet {
  value: string;
  count: number;
}

export interface SalonFacets {
  total: number;
  withGeo: number;
  withRating: number;
  countries: Facet[]; // normalized, desc by count, top 40
  states: Facet[]; // desc, top 40
  sources: Facet[]; // desc, all
  brands: Facet[]; // desc, all
  entityTypes: Facet[]; // desc, all
}

export interface SalonQuery {
  q?: string;
  country?: string;
  state?: string;
  source?: string;
  brand?: string;
  entityType?: string;
  hasRating?: boolean;
  hasGeo?: boolean;
  sort?: "name" | "rating" | "reviewCount" | "confidence";
  dir?: "asc" | "desc";
  page?: number; // 1-based
  pageSize?: number; // default 50, max 200
}

export interface SalonQueryResult {
  total: number;
  page: number;
  pageSize: number;
  rows: Salon[];
}

/** Raw on-disk record shape. Every field may be absent, null, or messy. */
interface RawSalon {
  name?: unknown;
  entity_type?: unknown;
  sources?: unknown;
  brands?: unknown;
  street?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  country?: unknown;
  lat?: unknown;
  lng?: unknown;
  phone?: unknown;
  email?: unknown;
  website?: unknown;
  booking_url?: unknown;
  rating?: unknown;
  review_count?: unknown;
  confidence?: unknown;
  instagram?: unknown;
  facebook?: unknown;
  tiktok?: unknown;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const GEO_POINT_CAP = 60_000;
const TOP_FACET_LIMIT = 40;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Collapse internal whitespace and trim. */
function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Coerce an arbitrary value to a trimmed, whitespace-collapsed string, or null
 * for empty/absent/non-string input.
 */
function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanWhitespace(value);
  return cleaned.length > 0 ? cleaned : null;
}

/** Coerce to a finite number, or null. */
function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/** Coerce to a clean array of non-empty strings. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const cleaned = cleanWhitespace(item);
    if (cleaned.length > 0) out.push(cleaned);
  }
  return out;
}

/** Title-Case each whitespace-delimited word of an already-cleaned string. */
function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

const COUNTRY_ALIASES: Record<string, string> = {
  us: "United States",
  usa: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states": "United States",
  america: "United States",
  uk: "United Kingdom",
  gb: "United Kingdom",
  "g.b.": "United Kingdom",
  "great britain": "United Kingdom",
  "united kingdom": "United Kingdom",
  england: "United Kingdom",
  // The value lives in the COUNTRY field, so "ca" here means Canada (not
  // California — US states live in the `state` field).
  canada: "Canada",
  ca: "Canada",
};

/**
 * Normalize a raw country string to a canonical display name. Known aliases map
 * to their canonical form (case-insensitively); anything else is cleaned and
 * Title-Cased. Empty/absent input → null.
 */
function normalizeCountry(value: unknown): string | null {
  const cleaned = toStringOrNull(value);
  if (cleaned === null) return null;
  const alias = COUNTRY_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  return titleCase(cleaned);
}

/** Map one raw record to the normalized public Salon shape. */
function normalizeSalon(raw: RawSalon): Salon {
  return {
    name: toStringOrNull(raw.name) ?? "",
    entityType: toStringOrNull(raw.entity_type) ?? "",
    sources: toStringArray(raw.sources),
    brands: toStringArray(raw.brands),
    street: toStringOrNull(raw.street),
    city: toStringOrNull(raw.city),
    state: toStringOrNull(raw.state),
    country: normalizeCountry(raw.country),
    zip: toStringOrNull(raw.zip),
    lat: toNumberOrNull(raw.lat),
    lng: toNumberOrNull(raw.lng),
    phone: toStringOrNull(raw.phone),
    email: toStringOrNull(raw.email),
    website: toStringOrNull(raw.website),
    bookingUrl: toStringOrNull(raw.booking_url),
    rating: toNumberOrNull(raw.rating),
    reviewCount: toNumberOrNull(raw.review_count),
    confidence: toNumberOrNull(raw.confidence),
    instagram: toStringOrNull(raw.instagram),
    facebook: toStringOrNull(raw.facebook),
    tiktok: toStringOrNull(raw.tiktok),
  };
}

// ---------------------------------------------------------------------------
// Loader (parse the 33MB file ONCE, cache in module scope)
// ---------------------------------------------------------------------------

let salonsPromise: Promise<Salon[]> | null = null;

async function loadSalons(): Promise<Salon[]> {
  let text: string;
  try {
    text = await fs.readFile(NAIL_MASTER_FILE, "utf8");
  } catch {
    // File absent (build/CI): return empty rather than throw so pages render.
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const rows: Salon[] = [];
  for (const record of parsed) {
    if (record === null || typeof record !== "object") continue;
    rows.push(normalizeSalon(record as RawSalon));
  }
  return rows;
}

/**
 * Parsed + normalized salon array, cached in module scope. The 33MB file is
 * read and parsed at most once per process. Returns [] when the file is absent.
 */
export async function getSalons(): Promise<Salon[]> {
  if (salonsPromise === null) {
    salonsPromise = loadSalons().catch((error) => {
      // Reset so a transient failure can be retried on the next call.
      salonsPromise = null;
      throw error;
    });
  }
  return salonsPromise;
}

// ---------------------------------------------------------------------------
// Facets
// ---------------------------------------------------------------------------

/** Sort a count map into descending Facet[], optionally capped to `limit`. */
function toFacets(counts: Map<string, number>, limit?: number): Facet[] {
  const facets = Array.from(counts, ([value, count]) => ({ value, count }));
  facets.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return typeof limit === "number" ? facets.slice(0, limit) : facets;
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Aggregate facet counts and coverage stats across all salons. Returns
 * zeros/empty arrays when the dataset is absent.
 */
export async function getSalonFacets(): Promise<SalonFacets> {
  const all = await getSalons();

  const countries = new Map<string, number>();
  const states = new Map<string, number>();
  const sources = new Map<string, number>();
  const brands = new Map<string, number>();
  const entityTypes = new Map<string, number>();

  let withGeo = 0;
  let withRating = 0;

  for (const salon of all) {
    if (salon.lat !== null && salon.lng !== null) withGeo += 1;
    if (salon.rating !== null) withRating += 1;
    if (salon.country !== null) bump(countries, salon.country);
    if (salon.state !== null) bump(states, salon.state);
    if (salon.entityType.length > 0) bump(entityTypes, salon.entityType);
    for (const source of salon.sources) bump(sources, source);
    for (const brand of salon.brands) bump(brands, brand);
  }

  return {
    total: all.length,
    withGeo,
    withRating,
    countries: toFacets(countries, TOP_FACET_LIMIT),
    states: toFacets(states, TOP_FACET_LIMIT),
    sources: toFacets(sources),
    brands: toFacets(brands),
    entityTypes: toFacets(entityTypes),
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function hasGeo(salon: Salon): boolean {
  return salon.lat !== null && salon.lng !== null;
}

/** Apply all filters from a query to the full array (no pagination). */
function filterSalons(all: Salon[], query: SalonQuery): Salon[] {
  const q = query.q ? query.q.toLowerCase().trim() : "";

  return all.filter((salon) => {
    if (q.length > 0) {
      const name = salon.name.toLowerCase();
      const city = salon.city ? salon.city.toLowerCase() : "";
      if (!name.includes(q) && !city.includes(q)) return false;
    }
    if (query.country && salon.country !== query.country) return false;
    if (query.state && salon.state !== query.state) return false;
    if (query.entityType && salon.entityType !== query.entityType) return false;
    if (query.source && !salon.sources.includes(query.source)) return false;
    if (query.brand && !salon.brands.includes(query.brand)) return false;
    if (query.hasRating && salon.rating === null) return false;
    if (query.hasGeo && !hasGeo(salon)) return false;
    return true;
  });
}

/** Comparator that sorts nulls last regardless of direction. */
function compareNumberNullsLast(
  a: number | null,
  b: number | null,
  dir: "asc" | "desc",
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // a null → a last
  if (b === null) return -1; // b null → b last
  return dir === "asc" ? a - b : b - a;
}

function sortSalons(rows: Salon[], query: SalonQuery): Salon[] {
  const sort = query.sort ?? "name";
  const dir = query.dir ?? (sort === "name" ? "asc" : "desc");

  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === "name") {
      const cmp = a.name.localeCompare(b.name);
      return dir === "asc" ? cmp : -cmp;
    }
    const key = sort; // "rating" | "reviewCount" | "confidence"
    return compareNumberNullsLast(a[key], b[key], dir);
  });
  return sorted;
}

function clampPageSize(pageSize: number | undefined): number {
  const size = typeof pageSize === "number" && Number.isFinite(pageSize)
    ? Math.floor(pageSize)
    : DEFAULT_PAGE_SIZE;
  if (size < 1) return 1;
  if (size > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return size;
}

function clampPage(page: number | undefined): number {
  const p = typeof page === "number" && Number.isFinite(page) ? Math.floor(page) : 1;
  return p < 1 ? 1 : p;
}

/**
 * Filter → sort → paginate. `total` is the filtered count before pagination.
 * Pure and synchronous over an already-loaded array.
 */
export function querySalons(all: Salon[], query: SalonQuery): SalonQueryResult {
  const filtered = filterSalons(all, query);
  const sorted = sortSalons(filtered, query);

  const pageSize = clampPageSize(query.pageSize);
  const page = clampPage(query.page);
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  return { total: filtered.length, page, pageSize, rows };
}

// ---------------------------------------------------------------------------
// Geo (map points)
// ---------------------------------------------------------------------------

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function isValidLng(value: number): boolean {
  return value >= -180 && value <= 180;
}

function isValidLat(value: number): boolean {
  return value >= -90 && value <= 90;
}

/**
 * Map points for the filtered result set. Returns [lng, lat] pairs (GeoJSON
 * order) for rows with valid geo, rounded to 4 decimals, capped at 60,000.
 */
export async function getSalonGeo(
  query: SalonQuery,
): Promise<{ count: number; points: [number, number][] }> {
  const all = await getSalons();
  const filtered = filterSalons(all, query);

  const points: [number, number][] = [];
  for (const salon of filtered) {
    if (points.length >= GEO_POINT_CAP) break;
    const { lat, lng } = salon;
    if (lat === null || lng === null) continue;
    if (!isValidLat(lat) || !isValidLng(lng)) continue;
    points.push([round4(lng), round4(lat)]);
  }

  return { count: points.length, points };
}
