"use client";

import * as React from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  Brain,
  CornerDownLeft,
  FileText,
  Loader2,
  RotateCcw,
  Send,
} from "lucide-react";

import { embedQuery, primeSemanticSearch } from "@/lib/wiki/semantic-search";
import { dirMeta } from "@/lib/wiki/labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DEFAULT_MODEL = "llama3.2:3b";

const EXAMPLE_QUESTIONS: readonly string[] = [
  "What's the difference between gel and acrylic nails?",
  "How should I price a nail salon service menu?",
  "What are the main risks of nail lamps and UV exposure?",
  "Which brands come up most in the research?",
];

/** A retrieved source note, surfaced by the server via the `X-Sources` header. */
interface Source {
  slug: string;
  title: string;
  dir: string;
  score: number;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Streamed reasoning ("thinking") phase from a reasoning model, if any. */
  reasoning?: string;
  sources?: Source[];
}

/** One decoded NDJSON stream event from the `/api/ask` response body. */
interface StreamEvent {
  t: "think" | "text";
  c: string;
}

interface IndexFreshness {
  builtAt: string | null;
  total: number;
  changed: number;
  removed: number;
  stale: boolean;
}

interface HealthState {
  serving: boolean;
  hasModel: boolean;
  model: string;
  models: string[];
  freshness?: IndexFreshness;
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
        message: `Model \`${body.model ?? DEFAULT_MODEL}\` not found. Run \`ollama pull ${body.model ?? DEFAULT_MODEL}\`, then retry.`,
      };
    case "model_not_installed":
      return {
        code,
        message: `Model \`${body.model ?? "selected"}\` isn't installed. Pick another or run \`ollama pull ${body.model ?? "selected"}\`.`,
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

/** Immutably drop a trailing assistant turn (used to undo a failed exchange). */
function dropTrailingAssistant(turns: readonly Turn[]): Turn[] {
  if (turns.length > 0 && turns[turns.length - 1].role === "assistant") {
    return turns.slice(0, -1);
  }
  return [...turns];
}

/** Model names that only produce embeddings can't answer chat prompts. */
function isChatModel(name: string): boolean {
  return !name.toLowerCase().includes("embed");
}

interface ReasoningDisclosureProps {
  text: string;
  /** True while the turn is actively streaming its reasoning and no answer
   *  has arrived yet — keeps the disclosure open so progress stays visible. */
  live: boolean;
}

/** Collapsible "Reasoning" section for a reasoning model's thinking phase. It
 *  auto-opens while thinking streams, then stays as-is so the user can collapse
 *  it once the answer appears. */
function ReasoningDisclosure({ text, live }: ReasoningDisclosureProps) {
  const [open, setOpen] = React.useState(live);
  React.useEffect(() => {
    // Force open whenever we (re)enter the live-thinking phase — an intentional
    // sync of local UI state to an incoming prop, not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (live) setOpen(true);
  }, [live]);

  return (
    <details
      open={open}
      onToggle={(e: React.SyntheticEvent<HTMLDetailsElement>) =>
        setOpen(e.currentTarget.open)
      }
      className="border-border/60 text-muted-foreground rounded-lg border px-3 py-2 text-xs"
    >
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium tracking-wide uppercase select-none">
        <Brain className="h-3.5 w-3.5" />
        Reasoning
      </summary>
      <div className="mt-2 whitespace-pre-wrap">{text}</div>
    </details>
  );
}

export function AskPanel() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<ErrorState | null>(null);
  const [health, setHealth] = React.useState<HealthState | null>(null);
  const [model, setModel] = React.useState("");

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  // Always-current view of `turns` so `ask` can read prior turns without
  // becoming a fresh callback on every streamed token.
  const turnsRef = React.useRef<Turn[]>([]);
  React.useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const busy = loading || streaming;

  React.useEffect(() => {
    let active = true;
    fetch("/api/ask")
      .then((res) => res.json() as Promise<HealthState>)
      .then((data) => {
        if (!active) return;
        setHealth(data);
        // Default the picker to the server's configured model, but never
        // override a choice the user already made.
        setModel((current) => current || data.model);
      })
      .catch(() => {
        if (active) {
          setHealth({
            serving: false,
            hasModel: false,
            model: "",
            models: [],
          });
        }
      });
    // Warm the in-browser query embedder ahead of the first question.
    primeSemanticSearch();
    return () => {
      active = false;
      // Abort any in-flight stream so it stops burning local-model compute.
      abortRef.current?.abort();
    };
  }, []);

  const ask = React.useCallback(
    async (rawQuestion: string) => {
      const q = rawQuestion.trim();
      if (!q || busy) return;

      // Cancel any prior in-flight stream, then track this one for cleanup.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // History is every completed turn that existed before this question.
      const history = turnsRef.current.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));

      setError(null);
      setInput("");
      setTurns((prev) => [...prev, { role: "user", content: q }]);
      setLoading(true);

      try {
        // Embed the query in-browser; the server holds the chunk vectors and
        // does retrieval, returning sources via the `X-Sources` header.
        const queryVector = await embedQuery(q);

        // Append the assistant turn to stream into; sources arrive via header.
        setTurns((prev) => [
          ...prev,
          { role: "assistant", content: "", sources: [] },
        ]);

        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Omit an unset model (health probe not yet resolved) so the server
            // falls back to its default instead of rejecting model: "".
            model: model || undefined,
            history,
            question: q,
            queryVector,
          }),
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
          // A failed turn shouldn't linger as an empty bubble.
          setTurns(dropTrailingAssistant);
          return;
        }

        if (!res.body) {
          setError({
            code: "no_body",
            message: "The response stream was empty. Please retry.",
          });
          setTurns(dropTrailingAssistant);
          return;
        }

        // The server already deduped by slug; patch the sources onto the turn.
        const rawSources = res.headers.get("X-Sources");
        const sources: Source[] = rawSources
          ? (JSON.parse(decodeURIComponent(rawSources)) as Source[])
          : [];
        setTurns((prev) => {
          if (prev.length === 0) return prev;
          const lastIndex = prev.length - 1;
          const last = prev[lastIndex];
          if (last.role !== "assistant") return prev;
          return [...prev.slice(0, lastIndex), { ...last, sources }];
        });

        setLoading(false);
        setStreaming(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        // Append a decoded event to the last (assistant) turn: text deltas grow
        // the answer, think deltas grow the collapsible reasoning section.
        const applyEvent = (event: StreamEvent) => {
          setTurns((prev) => {
            if (prev.length === 0) return prev;
            const lastIndex = prev.length - 1;
            const last = prev[lastIndex];
            if (last.role !== "assistant") return prev;
            const updated: Turn =
              event.t === "think"
                ? { ...last, reasoning: (last.reasoning ?? "") + event.c }
                : { ...last, content: last.content + event.c };
            return [...prev.slice(0, lastIndex), updated];
          });
        };

        // Parse one NDJSON line; ignore blanks and any non-`{t,c}` payloads.
        const flushLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            // Partial or malformed line — skip until the newline completes it.
            return;
          }
          if (!parsed || typeof parsed !== "object") return;
          const { t, c } = parsed as Partial<StreamEvent>;
          if ((t === "think" || t === "text") && typeof c === "string") {
            applyEvent({ t, c });
          }
        };

        // Buffer partial lines: NDJSON events are newline-delimited but a
        // single read may split one, or carry several.
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            flushLine(line);
            newlineIndex = buffer.indexOf("\n");
          }
        }
        // Flush any trailing line without a terminating newline.
        if (buffer.trim()) flushLine(buffer);
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
        setTurns(dropTrailingAssistant);
      } finally {
        // Only clear busy state if this run is still the active one — a
        // superseding submit has already taken over the flags otherwise.
        if (abortRef.current === controller) {
          setLoading(false);
          setStreaming(false);
        }
      }
    },
    [busy, model],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void ask(input);
    }
  };

  const fillExample = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const newChat = () => {
    if (busy) return;
    abortRef.current?.abort();
    setTurns([]);
    setError(null);
  };

  const ready = health?.serving && health.hasModel;
  const chatModels = (health?.models ?? []).filter(isChatModel);
  const lastIndex = turns.length - 1;

  return (
    <div className="space-y-6">
      {/* Header: new chat + model picker */}
      <div className="flex items-end justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={newChat}
          disabled={busy || turns.length === 0}
        >
          <RotateCcw className="h-4 w-4" />
          New chat
        </Button>

        <div className="flex flex-col items-end gap-1">
          <label
            htmlFor="ask-model"
            className="text-muted-foreground text-xs font-medium"
          >
            Model
          </label>
          <label htmlFor="ask-model" className="sr-only">
            Choose the local model to answer with
          </label>
          <select
            id="ask-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy || chatModels.length === 0}
            className="border-input bg-background rounded-md border px-2.5 py-1.5 text-sm disabled:opacity-50"
          >
            {chatModels.length === 0 ? (
              <option value={model}>{model || "No models"}</option>
            ) : (
              chatModels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Health status pill + index freshness badge */}
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
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
                  `Model \`${health.model || DEFAULT_MODEL}\` not installed — run \`ollama pull ${health.model || DEFAULT_MODEL}\``,
                )
              : renderMessage(
                  "Ollama isn't running — start it with `ollama serve`",
                )}
          </span>
        )}

        {health?.freshness &&
          (health.freshness.stale ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {renderMessage(
                `Index ${health.freshness.changed} note${
                  health.freshness.changed === 1 ? "" : "s"
                } behind — run \`pnpm embed\``,
              )}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Index current</span>
          ))}
      </div>

      {/* Conversation */}
      {turns.length > 0 && (
        <div className="space-y-6">
          {turns.map((turn, i) => {
            if (turn.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="bg-muted text-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {turn.content}
                  </div>
                </div>
              );
            }

            const isLastAssistant = i === lastIndex;
            const showCaret = isLastAssistant && streaming;
            const showThinking = isLastAssistant && loading && !turn.content;
            // Keep the reasoning open while it's actively streaming ahead of the
            // answer; collapse control passes to the user once content arrives.
            const reasoningLive =
              isLastAssistant && streaming && !turn.content;

            return (
              <div key={i} className="space-y-3">
                {turn.reasoning && (
                  <ReasoningDisclosure
                    text={turn.reasoning}
                    live={reasoningLive}
                  />
                )}
                <div className="wiki-prose">
                  {turn.content && <Streamdown>{turn.content}</Streamdown>}
                  {showCaret && (
                    <span className="bg-foreground ml-0.5 inline-block h-4 w-1.5 animate-pulse align-middle" />
                  )}
                  {showThinking && (
                    <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking…
                    </span>
                  )}
                </div>

                {turn.sources && turn.sources.length > 0 && (
                  <div>
                    <h2 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                      <FileText className="h-3.5 w-3.5" />
                      Retrieved from {turn.sources.length} note
                      {turn.sources.length === 1 ? "" : "s"}
                    </h2>
                    <ul className="grid gap-1.5">
                      {turn.sources.map((hit) => {
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
                              <Badge
                                variant="outline"
                                className="shrink-0 text-xs"
                              >
                                {Math.round(hit.score * 100)}%
                              </Badge>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error card */}
      {error && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-foreground/90">{renderMessage(error.message)}</p>
          </CardContent>
        </Card>
      )}

      {/* Composer */}
      <div>
        <label htmlFor="ask-input" className="sr-only">
          Ask a question about your vault
        </label>
        <div className="relative">
          <Textarea
            id="ask-input"
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder={
              turns.length === 0
                ? "Ask anything about your nail-care research notes…"
                : "Ask a follow-up…"
            }
            className="resize-none pr-28"
            aria-describedby="ask-hint"
          />
          <Button
            onClick={() => void ask(input)}
            disabled={busy || !input.trim()}
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

        {/* Example chips — only when the conversation is empty */}
        {turns.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => fillExample(ex)}
                className="border-border/60 hover:bg-accent text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
