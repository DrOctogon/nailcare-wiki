"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import Fuse from "fuse.js";
import {
  BarChart3,
  Clock,
  FileText,
  Loader2,
  type LucideIcon,
  MessageCircleQuestion,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  SunMoon,
} from "lucide-react";

import type { SearchDoc } from "@/lib/wiki/vault";
import { dirMeta } from "@/lib/wiki/labels";
import { logEvent } from "@/lib/analytics";
import {
  hybridSearch,
  primeHybrid,
  type HybridHit,
} from "@/lib/wiki/hybrid-search";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface SearchCommandProps {
  docs: SearchDoc[];
}

type Mode = "keyword" | "hybrid";

/** A runnable palette command — an action rather than a navigation result. */
interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Extra terms cmdk matches against, beyond the visible label. */
  keywords: string[];
  run: () => void;
}

export function SearchCommand({ docs }: SearchCommandProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("keyword");
  const [hybridHits, setHybridHits] = useState<HybridHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fuse = useMemo(
    () =>
      new Fuse(docs, {
        keys: [
          { name: "title", weight: 0.5 },
          { name: "tags", weight: 0.2 },
          { name: "excerpt", weight: 0.15 },
          { name: "body", weight: 0.15 },
        ],
        threshold: 0.38,
        ignoreLocation: true,
      }),
    [docs],
  );

  const keywordResults = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return docs
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 8);
    }
    return fuse
      .search(q)
      .slice(0, 20)
      .map((r) => r.item);
  }, [query, fuse, docs]);

  // ---- Search analytics: log once per distinct non-empty query. -------------
  // Debounced on a 600ms settle, and eagerly on result-select, guarded by a ref
  // so the same query never logs twice. Fire-and-forget via logEvent.
  const loggedQueryRef = useRef("");

  const logSearch = useCallback((raw: string): void => {
    const q = raw.trim();
    if (!q || q === loggedQueryRef.current) return;
    loggedQueryRef.current = q;
    logEvent("search", { query: q });
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const handle = setTimeout(() => logSearch(q), 600);
    return () => clearTimeout(handle);
  }, [query, logSearch]);

  // Debounced hybrid query when in hybrid mode.
  useEffect(() => {
    if (mode !== "hybrid") return;
    const q = query.trim();
    if (!q) {
      // Intentional reset: clear stale results when the query empties.
      /* eslint-disable react-hooks/set-state-in-effect */
      setHybridHits([]);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      hybridSearch(q, docs, 16)
        .then((hits) => {
          if (!cancelled) setHybridHits(hits);
        })
        .catch(() => {
          if (!cancelled) setError("Search index failed to load.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, mode, docs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        if (e.key === "/" && isTypingTarget(e.target)) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (slug: string) => {
    logSearch(query);
    setOpen(false);
    setQuery("");
    router.push(`/wiki/${slug}`);
  };

  const enableHybrid = () => {
    setMode("hybrid");
    primeHybrid(docs);
  };

  // ---- Palette commands (keyword mode only). --------------------------------
  const runReindex = useCallback((): void => {
    const id = toast.loading("Reindexing the vault…");
    // Fire-and-forget: draining the stream lets the completion toast reflect
    // the embed actually finishing, but we never block the UI on it.
    void fetch("/api/reindex", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`Reindex failed (${res.status})`);
        return res.text();
      })
      .then(() => {
        toast.success("Reindex complete", { id });
      })
      .catch(() => {
        toast.error("Reindex failed", { id });
      });
  }, []);

  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "toggle-theme",
        label: "Toggle theme",
        icon: SunMoon,
        keywords: ["dark", "light", "mode", "appearance"],
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "open-insights",
        label: "Open Insights",
        icon: BarChart3,
        keywords: ["dashboard", "analytics", "stats"],
        run: () => router.push("/insights"),
      },
      {
        id: "open-graph",
        label: "Open Knowledge Graph",
        icon: Network,
        keywords: ["graph", "network", "connections"],
        run: () => router.push("/graph"),
      },
      {
        id: "open-timeline",
        label: "Open Timeline",
        icon: Clock,
        keywords: ["history", "recent", "dates"],
        run: () => router.push("/timeline"),
      },
      {
        id: "ask-vault",
        label: "Ask the Vault",
        icon: MessageCircleQuestion,
        keywords: ["question", "chat", "rag", "ai"],
        run: () => router.push("/ask"),
      },
      {
        id: "reindex",
        label: "Reindex the vault",
        icon: RefreshCw,
        keywords: ["embed", "rebuild", "refresh", "index"],
        run: runReindex,
      },
    ],
    [router, theme, setTheme, runReindex],
  );

  const runAction = (action: PaletteAction) => {
    setOpen(false);
    setQuery("");
    action.run();
  };

  const showHybrid = mode === "hybrid";

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Search the vault"
        className="text-muted-foreground size-9 justify-center gap-2 px-0 sm:w-64 sm:justify-start sm:px-3"
      >
        <Search className="h-4 w-4" />
        <span className="hidden flex-1 text-left sm:inline">Search the vault…</span>
        <kbd className="bg-muted pointer-events-none hidden select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium sm:flex">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={!showHybrid}>
        <CommandInput
          placeholder={
            showHybrid ? "Describe what you're looking for…" : "Search pages, tags, text…"
          }
          value={query}
          onValueChange={setQuery}
        />

        {/* Mode toggle */}
        <div className="flex items-center gap-1 border-b px-2 py-1.5">
          <button
            type="button"
            onClick={() => setMode("keyword")}
            className={toggleClass(!showHybrid)}
          >
            <Search className="h-3.5 w-3.5" /> Keyword
          </button>
          <button type="button" onClick={enableHybrid} className={toggleClass(showHybrid)}>
            <Sparkles className="h-3.5 w-3.5" /> Hybrid
          </button>
          {showHybrid && loading && (
            <span className="text-muted-foreground ml-auto flex items-center gap-1.5 pr-1 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
            </span>
          )}
        </div>

        <CommandList>
          {showHybrid ? (
            <>
              {error && (
                <div className="text-muted-foreground px-4 py-6 text-center text-sm">
                  {error}
                </div>
              )}
              {!error && !loading && query.trim() && hybridHits.length === 0 && (
                <CommandEmpty>No matches.</CommandEmpty>
              )}
              {!error && !query.trim() && (
                <div className="text-muted-foreground px-4 py-6 text-center text-sm">
                  Blends keywords + meaning — try “why are salon margins thin?”
                </div>
              )}
              {hybridHits.length > 0 && (
                <CommandGroup
                  heading={<span className="catalog-meta">Closest in meaning</span>}
                >
                  {hybridHits.map((hit) => (
                    <CommandItem
                      key={hit.slug}
                      value={hit.slug}
                      onSelect={() => go(hit.slug)}
                      className="gap-2"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: dirMeta(hit.dir).accent }}
                      />
                      <span className="flex-1 truncate">{hit.title}</span>
                      <span className="text-muted-foreground tabular-nums text-xs">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup
                heading={
                  <span className="catalog-meta">{query ? "Results" : "Browse"}</span>
                }
              >
                {keywordResults.map((doc) => (
                  <CommandItem
                    key={doc.slug}
                    value={`${doc.title} ${doc.slug}`}
                    onSelect={() => go(doc.slug)}
                    className="gap-2"
                  >
                    <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{doc.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {dirMeta(doc.dir).singular}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>

              {/* Command actions — cmdk filters these by label/keywords, so the
                  group shows when the query is empty or matches a command. */}
              <CommandGroup heading={<span className="catalog-meta">Actions</span>}>
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      key={action.id}
                      value={action.label}
                      keywords={action.keywords}
                      onSelect={() => runAction(action)}
                      className="gap-2"
                    >
                      <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{action.label}</span>
                      <span className="text-muted-foreground text-xs">Action</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function toggleClass(active: boolean): string {
  return [
    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  ].join(" ");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
