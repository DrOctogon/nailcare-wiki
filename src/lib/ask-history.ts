// Client-side persistence for "Ask the Vault" conversation threads. Stores
// completed threads in localStorage so the user can resume prior chats. Pure
// functions only (no React) — every export is SSR-safe: when there's no
// `window` (server render), reads return empty and writes are no-ops.

/** A retrieved source note, mirrored from the ask panel's `Source` shape. */
export interface Source {
  slug: string;
  title: string;
  dir: string;
  score: number;
}

/** One conversation turn, mirrored from the ask panel's `Turn` shape. */
export interface Turn {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  sources?: Source[];
}

/** A persisted conversation thread. */
export interface SavedThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
}

const STORAGE_KEY = "vault.ask.threads";
const MAX_THREADS = 50;
const TITLE_MAX_CHARS = 60;

/** True only in a browser context where localStorage is usable. */
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Narrow an unknown value to a well-formed `Source`. */
function isSource(value: unknown): value is Source {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.slug === "string" &&
    typeof s.title === "string" &&
    typeof s.dir === "string" &&
    typeof s.score === "number"
  );
}

/** Narrow an unknown value to a well-formed `Turn`. */
function isTurn(value: unknown): value is Turn {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  if (t.role !== "user" && t.role !== "assistant") return false;
  if (typeof t.content !== "string") return false;
  if (t.reasoning !== undefined && typeof t.reasoning !== "string") return false;
  if (t.sources !== undefined && !(Array.isArray(t.sources) && t.sources.every(isSource))) {
    return false;
  }
  return true;
}

/** Narrow an unknown value to a well-formed `SavedThread`. */
function isSavedThread(value: unknown): value is SavedThread {
  if (!value || typeof value !== "object") return false;
  const th = value as Record<string, unknown>;
  return (
    typeof th.id === "string" &&
    typeof th.title === "string" &&
    typeof th.createdAt === "number" &&
    typeof th.updatedAt === "number" &&
    Array.isArray(th.turns) &&
    th.turns.every(isTurn)
  );
}

/** Read + tolerantly parse the raw thread list; never throws. */
function readAll(): SavedThread[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedThread);
  } catch {
    // Corrupt or unreadable store — treat as empty rather than crashing the UI.
    return [];
  }
}

/** Persist the thread list; failures (quota, disabled storage) are swallowed. */
function writeAll(threads: readonly SavedThread[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    // Best-effort — a failed write must never surface to the user.
  }
}

/** Derive a short thread title from the first user turn's content. */
function deriveTitle(turns: readonly Turn[]): string {
  const firstUser = turns.find((turn) => turn.role === "user");
  const text = firstUser?.content.trim();
  if (!text) return "Untitled";
  if (text.length <= TITLE_MAX_CHARS) return text;
  return `${text.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`;
}

/** All saved threads, newest first (by `updatedAt`). */
export function listThreads(): SavedThread[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Fetch a single thread by id, or null if absent. */
export function getThread(id: string): SavedThread | null {
  return readAll().find((thread) => thread.id === id) ?? null;
}

/**
 * Upsert a thread by id with the given turns. Preserves `createdAt` on update,
 * refreshes `updatedAt`, recomputes the title, and caps the store to the newest
 * MAX_THREADS. Returns the saved thread.
 */
export function saveThread(id: string, turns: readonly Turn[]): SavedThread {
  const now = Date.now();
  const existing = getThread(id);
  const saved: SavedThread = {
    id,
    title: deriveTitle(turns),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    turns: turns.map((turn) => ({ ...turn })),
  };

  const others = readAll().filter((thread) => thread.id !== id);
  const next = [saved, ...others]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);

  writeAll(next);
  return saved;
}

/** Remove a thread by id. No-op if it doesn't exist. */
export function deleteThread(id: string): void {
  const next = readAll().filter((thread) => thread.id !== id);
  writeAll(next);
}

/** Generate a fresh thread id. Runs only in the browser, so `randomUUID` is safe. */
export function newThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Extremely unlikely fallback for ancient browsers lacking crypto.randomUUID.
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
