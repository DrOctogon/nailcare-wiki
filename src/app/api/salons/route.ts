import { getSalons, querySalons, type SalonQuery } from "@/lib/scrape/salons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORT_KEYS = new Set(["name", "rating", "reviewCount", "confidence"]);

/** Read a trimmed non-empty param, else undefined. */
function str(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Boolean flag from "1"/"true" (case-insensitive); anything else → undefined. */
function bool(params: URLSearchParams, key: string): boolean | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" ? true : undefined;
}

/** Parse a positive integer param, else undefined. */
function int(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseSalonQuery(params: URLSearchParams): SalonQuery {
  const rawSort = str(params, "sort");
  const sort = rawSort && SORT_KEYS.has(rawSort) ? (rawSort as SalonQuery["sort"]) : undefined;
  const rawDir = str(params, "dir");
  const dir = rawDir === "asc" || rawDir === "desc" ? rawDir : undefined;

  return {
    q: str(params, "q"),
    country: str(params, "country"),
    state: str(params, "state"),
    source: str(params, "source"),
    brand: str(params, "brand"),
    entityType: str(params, "entityType"),
    hasRating: bool(params, "hasRating"),
    hasGeo: bool(params, "hasGeo"),
    sort,
    dir,
    page: int(params, "page"),
    pageSize: int(params, "pageSize"),
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const query = parseSalonQuery(searchParams);
    const all = await getSalons();
    const result = querySalons(all, query);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
