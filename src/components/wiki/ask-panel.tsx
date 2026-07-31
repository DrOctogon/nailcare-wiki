"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CornerDownLeft,
  FileText,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";

import {
  semanticSearch,
  primeSemanticSearch,
  type SemanticHit,
} from "@/lib/wiki/semantic-search";
import { dirMeta } from "@/lib/wiki/labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const RETRIEVAL_LIMIT = 6;

const EXAMPLE_QUESTIONS: readonly string[] = [
  "What's the difference between gel and acrylic nails?",
  "How should I price a nail salon service menu?",
  "What are the main risks of nail lamps and UV exposure?",
  "Which brands come up most in the research?",
];

interface HealthState {
  serving: boolean;
  hasModel: boolean;
  model: string;
}

interface ErrorState {
  code: string;
  message: string;
}

interface ApiErrorBody {
  error?: string;
  code?: string;
  model?: string;
}

/** Map a structured API error to a friendly, actionable message. */
function friendlyError(status: number, body: ApiErrorBody): ErrorState {
  const code = body.code ?? "unknown";
  switch (code) {
    case "ollama_unreachable":
      return {
        code,
        message:
          "Ollama isn't running. Start it with `ollama serve`, then retry.",
      };
    case "model_missing":
      return {
        code,
        message: `Model \`${body.model ?? "llama3.2:3b"}\` not found. Run \`ollama pull ${body.model ?? "llama3.2:3b"}\`, then retry.`,
      };
    default:
      return {
        code,
        message:
          body.error ?? `Something went wrong (HTTP ${status}). Please retry.`,
      };
  }
}

/** Pull a `code` span out of a message so shell commands render monospaced. */
function renderMessage(message: string): React.ReactNode {
  const parts = message.split(/`([^`]+)`/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code
        key={i}
        className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]"
      >
        {part}
      </code>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

export function AskPanel() {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [sources, setSources] = React.useState<SemanticHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<ErrorState | null>(null);
  const [health, setHealth] = React.useState<HealthState | null>(null);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const busy = loading || streaming;

  React.useEffect(() => {
    let active = true;
    fetch("/api/ask")
      .then((res) => res.json() as Promise<HealthState>)
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch(() => {
        if (active) setHealth({ serving: false, hasModel: false, model: "" });
      });
    // Warm the in-browser retrieval model ahead of the first query.
    primeSemanticSearch();
    return () => {
      active = false;
      // Abort any in-flight stream so it stops burning local-model compute.
      abortRef.current?.abort();
    };
  }, []);

  const submit = React.useCallback(async () => {
    const q = question.trim();
    if (!q || busy) return;

    setError(null);
    setAnswer("");
    setSources([]);
    setLoading(true);

    // Cancel any prior in-flight stream, then track this one for unmount cleanup.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const hits = await semanticSearch(q, RETRIEVAL_LIMIT);
      setSources(hits);

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, slugs: hits.map((h) => h.slug) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let parsed: ApiErrorBody = {};
        try {
          parsed = (await res.json()) as ApiErrorBody;
        } catch {
          // fall through to generic message
        }
        setError(friendlyError(res.status, parsed));
        return;
      }

      if (!res.body) {
        setError({
          code: "no_body",
          message: "The response stream was empty. Please retry.",
        });
        return;
      }

      setLoading(false);
      setStreaming(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      // An intentional abort (new submit or unmount) isn't a user-facing error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError({
        code: "network",
        message:
          err instanceof Error
            ? err.message
            : "Network error while contacting the local model.",
      });
    } finally {
      // Only clear busy state if this run is still the active one — a superseding
      // submit has already taken over the flags otherwise.
      if (abortRef.current === controller) {
        setLoading(false);
        setStreaming(false);
      }
    }
  }, [question, busy]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const useExample = (text: string) => {
    setQuestion(text);
    textareaRef.current?.focus();
  };

  const ready = health?.serving && health.hasModel;

  return (
    <div className="space-y-6">
      {/* Health status pill */}
      <div aria-live="polite">
        {health == null ? (
          <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking local model…
          </span>
        ) : ready ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Local LLM ready
            <span className="text-muted-foreground font-normal">
              · {health.model}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {health.serving
              ? renderMessage(
                  `Model \`${health.model || "llama3.2:3b"}\` not installed — run \`ollama pull ${health.model || "llama3.2:3b"}\``,
                )
              : renderMessage(
                  "Ollama isn't running — start it with `ollama serve`",
                )}
          </span>
        )}
      </div>

      {/* Composer */}
      <div>
        <label htmlFor="ask-input" className="sr-only">
          Ask a question about your vault
        </label>
        <div className="relative">
          <Textarea
            id="ask-input"
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder="Ask anything about your nail-care research notes…"
            className="resize-none pr-28"
            aria-describedby="ask-hint"
          />
          <Button
            onClick={() => void submit()}
            disabled={busy || !question.trim()}
            size="sm"
            className="absolute right-2 bottom-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Ask
          </Button>
        </div>
        <p
          id="ask-hint"
          className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs"
        >
          <CornerDownLeft className="h-3 w-3" />
          Press ⌘/Ctrl + Enter to send. Retrieval and the model both run locally.
        </p>

        {/* Example chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => useExample(ex)}
              className="border-border/60 hover:bg-accent text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Error card */}
      {error && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-foreground/90">{renderMessage(error.message)}</p>
          </CardContent>
        </Card>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <FileText className="h-3.5 w-3.5" />
            Retrieved from {sources.length} note
            {sources.length === 1 ? "" : "s"}
          </h2>
          <ul className="grid gap-1.5">
            {sources.map((hit) => {
              const m = dirMeta(hit.dir);
              return (
                <li key={hit.slug}>
                  <Link
                    href={`/wiki/${hit.slug}`}
                    className="group hover:bg-accent flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: m.accent }}
                    />
                    <span className="group-hover:text-foreground min-w-0 flex-1 truncate text-sm">
                      {hit.title}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {Math.round(hit.score * 100)}%
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Answer */}
      {(answer || streaming || loading) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="text-chart-1 h-4 w-4" />
              Answer
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {answer}
              {streaming && (
                <span className="bg-foreground ml-0.5 inline-block h-4 w-1.5 animate-pulse align-middle" />
              )}
            </div>
            {loading && !answer && (
              <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </span>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
