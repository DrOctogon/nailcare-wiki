// Client-side reading queue / bookmarks, persisted to localStorage.
// No React here — pure, SSR-guarded functions plus a tiny subscription bus so
// multiple components (button + list) stay in sync, including across tabs.

export interface Bookmark {
  slug: string;
  title: string;
  dir: string;
  type: string;
  /** Epoch millis when the bookmark was added. */
  addedAt: number;
}

const STORAGE_KEY = "vault.bookmarks";
/** Hard cap so localStorage never grows unbounded; newest are kept. */
const MAX_BOOKMARKS = 500;

/** True only in a browser with a usable localStorage. */
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// --- Subscription bus -------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
let storageBound = false;

/** Notify every in-page subscriber that the queue changed. */
function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Wire the cross-tab `storage` event exactly once. */
function ensureStorageListener(): void {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) {
      emit();
    }
  });
}

/**
 * Subscribe to reading-queue changes (this tab's mutations + other tabs via
 * the `storage` event). Returns an unsubscribe function.
 */
export function subscribe(cb: Listener): () => void {
  ensureStorageListener();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// --- Persistence ------------------------------------------------------------

/** Tolerant type guard for a single stored record. */
function isBookmark(value: unknown): value is Bookmark {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.slug === "string" &&
    typeof record.title === "string" &&
    typeof record.dir === "string" &&
    typeof record.type === "string" &&
    typeof record.addedAt === "number"
  );
}

/** Read + parse the raw store, tolerating malformed data. */
function readAll(): Bookmark[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBookmark);
  } catch {
    return [];
  }
}

/** Persist the list (already newest-first) and notify subscribers. */
function writeAll(bookmarks: readonly Bookmark[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(bookmarks.slice(0, MAX_BOOKMARKS)),
    );
  } catch {
    // Quota / serialization failures are non-fatal for a bookmarks feature.
  }
  emit();
}

// --- Public API -------------------------------------------------------------

/** All saved bookmarks, newest first. */
export function listBookmarks(): Bookmark[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

/** Whether a given slug is currently in the reading queue. */
export function isBookmarked(slug: string): boolean {
  return readAll().some((b) => b.slug === slug);
}

/** Add a bookmark (no-op if already present). Stamps `addedAt`. */
export function addBookmark(bookmark: Omit<Bookmark, "addedAt">): void {
  const existing = readAll();
  if (existing.some((b) => b.slug === bookmark.slug)) return;
  const next: Bookmark[] = [{ ...bookmark, addedAt: Date.now() }, ...existing];
  writeAll(next);
}

/** Remove a bookmark by slug (no-op if absent). */
export function removeBookmark(slug: string): void {
  const existing = readAll();
  const next = existing.filter((b) => b.slug !== slug);
  if (next.length === existing.length) return;
  writeAll(next);
}

/** Remove every bookmark. */
export function clearBookmarks(): void {
  if (readAll().length === 0) return;
  writeAll([]);
}

/**
 * Toggle a slug's bookmarked state. Returns the new state:
 * `true` if it is now bookmarked, `false` if it was removed.
 */
export function toggleBookmark(bookmark: Omit<Bookmark, "addedAt">): boolean {
  if (isBookmarked(bookmark.slug)) {
    removeBookmark(bookmark.slug);
    return false;
  }
  addBookmark(bookmark);
  return true;
}
