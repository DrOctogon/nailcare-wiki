import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/** Event kinds we accept. Anything else is rejected at the boundary. */
const EVENT_TYPES = ["view", "search", "ask"] as const;
type EventType = (typeof EVENT_TYPES)[number];

/** One logged interaction. `ts` is always stamped server-side. */
export interface AnalyticsEvent {
  type: EventType;
  ts: string;
  path?: string;
  query?: string;
  meta?: Record<string, string | number>;
}

/** Shape returned by GET — pre-aggregated so the client stays dumb. */
export interface AnalyticsSummary {
  total: number;
  byType: Record<EventType, number>;
  topPaths: { path: string; count: number }[];
  topSearches: { query: string; count: number }[];
  recentAsks: { query: string; ts: string }[];
  perDay: { date: string; count: number }[];
}

const ANALYTICS_DIR = path.join(process.cwd(), ".analytics");
const EVENTS_FILE = path.join(ANALYTICS_DIR, "events.jsonl");

const MAX_QUERY_LEN = 200;
const MAX_PATH_LEN = 512;
const TOP_LIMIT = 10;

// NOTE: no rotation yet. The file grows unbounded; once it passes ~5MB we
// should add rotation/truncation, but appending stays correct until then.

function isEventType(value: unknown): value is EventType {
  return (
    typeof value === "string" && EVENT_TYPES.includes(value as EventType)
  );
}

/** Coerce a validated body into a clean event, dropping anything malformed. */
function sanitizeMeta(
  raw: unknown,
): Record<string, string | number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "string") {
      out[key] = val.slice(0, MAX_QUERY_LEN);
    } else if (typeof val === "number" && Number.isFinite(val)) {
      out[key] = val;
    }
    // Silently drop non-string/number meta values.
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Append one event to the JSONL log. Validates + stamps `ts`. Returns 204 on
 * success, 400 on a bad body. File errors are swallowed (still 204) — analytics
 * must never break the app that emits it.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (!isEventType(record.type)) {
    return Response.json(
      { error: `\`type\` must be one of: ${EVENT_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  if (record.path !== undefined && typeof record.path !== "string") {
    return Response.json(
      { error: "`path` must be a string when provided." },
      { status: 400 },
    );
  }
  if (record.query !== undefined && typeof record.query !== "string") {
    return Response.json(
      { error: "`query` must be a string when provided." },
      { status: 400 },
    );
  }

  const event: AnalyticsEvent = {
    type: record.type,
    ts: new Date().toISOString(),
  };
  if (typeof record.path === "string" && record.path.trim()) {
    event.path = record.path.slice(0, MAX_PATH_LEN);
  }
  if (typeof record.query === "string" && record.query.trim()) {
    event.query = record.query.slice(0, MAX_QUERY_LEN);
  }
  const meta = sanitizeMeta(record.meta);
  if (meta) event.meta = meta;

  try {
    await fs.mkdir(ANALYTICS_DIR, { recursive: true });
    await fs.appendFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Disk full, permissions, etc. — never surface to the caller.
  }

  return new Response(null, { status: 204 });
}

/** Narrow a tolerantly-parsed JSONL line to a usable event. */
function isLoggedEvent(value: unknown): value is AnalyticsEvent {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return isEventType(rec.type) && typeof rec.ts === "string";
}

/** Rank a count map, highest first, capped to `limit`. */
function topN(
  counts: Map<string, number>,
  limit: number,
): { key: string; count: number }[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

/**
 * Read the JSONL log and aggregate it. A missing file yields an empty summary;
 * malformed lines are skipped rather than aborting the whole read.
 */
export async function GET(): Promise<Response> {
  let raw = "";
  try {
    raw = await fs.readFile(EVENTS_FILE, "utf8");
  } catch {
    // Missing file (nothing logged yet) or unreadable — treat as empty.
    raw = "";
  }

  const byType: Record<EventType, number> = { view: 0, search: 0, ask: 0 };
  const pathCounts = new Map<string, number>();
  const searchCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const asks: { query: string; ts: string }[] = [];
  let total = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isLoggedEvent(parsed)) continue;

    total++;
    byType[parsed.type]++;

    const day = parsed.ts.slice(0, 10); // YYYY-MM-DD
    if (day) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);

    if (parsed.type === "view" && parsed.path) {
      pathCounts.set(parsed.path, (pathCounts.get(parsed.path) ?? 0) + 1);
    }
    if (parsed.type === "search" && parsed.query) {
      searchCounts.set(parsed.query, (searchCounts.get(parsed.query) ?? 0) + 1);
    }
    if (parsed.type === "ask" && parsed.query) {
      asks.push({ query: parsed.query, ts: parsed.ts });
    }
  }

  const topPaths = topN(pathCounts, TOP_LIMIT).map(({ key, count }) => ({
    path: key,
    count,
  }));
  const topSearches = topN(searchCounts, TOP_LIMIT).map(({ key, count }) => ({
    query: key,
    count,
  }));
  const recentAsks = asks.slice(-TOP_LIMIT).reverse();
  const perDay = [...dayCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, count]) => ({ date, count }));

  const summary: AnalyticsSummary = {
    total,
    byType,
    topPaths,
    topSearches,
    recentAsks,
    perDay,
  };

  return Response.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
