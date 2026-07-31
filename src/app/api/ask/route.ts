import { retrieveChunks, type RetrievedChunk } from "@/lib/wiki/rag-retrieval";
import { getIndexFreshness } from "@/lib/wiki/freshness";

export const runtime = "nodejs";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

const HEALTH_TIMEOUT_MS = 2500;
const MAX_HISTORY = 40;
const CONTEXT_CHAR_LIMIT = 2000;
const RETRIEVAL_LIMIT = 8;
// The client embeds the query with MiniLM (384 dims); bound generously so any
// reasonable sentence-embedding model is accepted but garbage is rejected.
const MIN_VECTOR_DIM = 128;
const MAX_VECTOR_DIM = 2048;

interface OllamaHealth {
  serving: boolean;
  models: string[];
  hasModel: boolean;
}

interface OllamaTagsResponse {
  models?: { name?: string }[];
}

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** A deduped source note surfaced to the client via the `X-Sources` header. */
interface Source {
  slug: string;
  title: string;
  dir: string;
  score: number;
}

/** Probe the local Ollama instance: is it up, and does it have our model? */
async function checkOllama(): Promise<OllamaHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { serving: false, models: [], hasModel: false };

    const data = (await res.json()) as OllamaTagsResponse;
    const models = Array.isArray(data.models)
      ? data.models
          .map((m) => (typeof m.name === "string" ? m.name : ""))
          .filter(Boolean)
      : [];
    const hasModel = models.some((name) => name === MODEL);
    return { serving: true, models, hasModel };
  } catch {
    // Unreachable, timed out, or malformed — treat as not serving.
    return { serving: false, models: [], hasModel: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Narrow an unknown array element to a well-formed history turn. */
function isHistoryTurn(value: unknown): value is HistoryTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return (
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.content === "string"
  );
}

/** Validate an unknown value as a query embedding vector. */
function isQueryVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= MIN_VECTOR_DIM &&
    value.length <= MAX_VECTOR_DIM &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** Keep the highest-ranked chunk per parent note for the source header. */
function dedupeSourcesBySlug(chunks: readonly RetrievedChunk[]): Source[] {
  const seen = new Set<string>();
  const unique: Source[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.slug)) continue;
    seen.add(chunk.slug);
    unique.push({
      slug: chunk.slug,
      title: chunk.title,
      dir: chunk.dir,
      score: Math.round(chunk.score * 100) / 100,
    });
  }
  return unique;
}

function buildMessages(
  question: string,
  history: HistoryTurn[],
  context: readonly RetrievedChunk[],
): ChatMessage[] {
  const system =
    "You answer questions about a personal knowledge vault of nail-care and " +
    "salon-business research notes. Answer the LATEST question using ONLY the " +
    "information in the provided context notes — do not rely on outside " +
    "knowledge. Cite the note titles inline (e.g. “According to ‘Gel vs " +
    "Acrylic’ …”) when you draw on them. If the context does not contain " +
    "enough information to answer, say so plainly rather than guessing. This is " +
    "a multi-turn conversation, so use the prior turns for continuity. Be " +
    "concise. You may format your answer with Markdown — headings, lists, " +
    "bold, and code where it helps.";

  const contextBlocks =
    context
      .map(
        (note, i) => `${i + 1}. ### ${note.title}\n${note.text.slice(0, CONTEXT_CHAR_LIMIT)}`,
      )
      .join("\n\n") || "(no matching notes)";

  const user = `Context notes:\n\n${contextBlocks}\n\nQuestion: ${question}`;

  return [
    { role: "system", content: system },
    ...history.map((turn): ChatMessage => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user", content: user },
  ];
}

/** Report Ollama availability + the configured model, for the client status pill. */
export async function GET(): Promise<Response> {
  const { serving, hasModel, models } = await checkOllama();
  // Index freshness is best-effort — never let it break the health check.
  const freshness = await getIndexFreshness().catch(() => undefined);
  return Response.json({ serving, model: MODEL, hasModel, models, freshness });
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const record =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const rawQuestion = record.question;
    const rawHistory = record.history;
    const rawQueryVector = record.queryVector;
    const rawModel = record.model;

    if (typeof rawQuestion !== "string" || !rawQuestion.trim()) {
      return Response.json(
        { error: "`question` must be a non-empty string." },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(rawHistory) ||
      rawHistory.length > MAX_HISTORY ||
      !rawHistory.every(isHistoryTurn)
    ) {
      return Response.json(
        {
          error: `\`history\` must be an array of at most ${MAX_HISTORY} { role: "user" | "assistant", content: string } turns.`,
        },
        { status: 400 },
      );
    }
    if (!isQueryVector(rawQueryVector)) {
      return Response.json(
        {
          error: `\`queryVector\` must be an array of ${MIN_VECTOR_DIM}–${MAX_VECTOR_DIM} finite numbers.`,
        },
        { status: 400 },
      );
    }
    if (rawModel !== undefined && typeof rawModel !== "string") {
      return Response.json(
        { error: "`model` must be a string when provided." },
        { status: 400 },
      );
    }

    const question = rawQuestion.trim();
    const history: HistoryTurn[] = rawHistory;
    const queryVector: number[] = rawQueryVector;
    const requestedModel = rawModel;

    const health = await checkOllama();
    if (!health.serving) {
      return Response.json(
        {
          error: `Can't reach Ollama at ${OLLAMA_HOST}. Start it with \`ollama serve\`.`,
          code: "ollama_unreachable",
        },
        { status: 503 },
      );
    }

    const chosen = requestedModel ?? MODEL;
    if (!health.models.includes(chosen)) {
      // The default model missing is a setup problem (503); an explicitly
      // requested-but-absent model is a bad request (400).
      if (requestedModel === undefined) {
        return Response.json(
          {
            error: `Model \`${MODEL}\` is not installed. Run \`ollama pull ${MODEL}\`.`,
            code: "model_missing",
            model: MODEL,
          },
          { status: 503 },
        );
      }
      return Response.json(
        {
          error: `Model \`${chosen}\` is not installed. Run \`ollama pull ${chosen}\`.`,
          code: "model_not_installed",
          model: chosen,
        },
        { status: 400 },
      );
    }

    // Server-side retrieval: rank the on-disk chunk vectors against the
    // client-embedded query vector.
    const chunks = await retrieveChunks(question, queryVector, RETRIEVAL_LIMIT);
    const sources = dedupeSourcesBySlug(chunks);

    const messages = buildMessages(question, history, chunks);

    const upstream = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: chosen, messages, stream: true }),
      // Propagate client disconnects so Ollama stops generating for abandoned requests.
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        {
          error: `Ollama returned an error (HTTP ${upstream.status}).`,
          code: "ollama_error",
        },
        { status: 502 },
      );
    }

    const source = upstream.body;
    const encoder = new TextEncoder();
    // Encode one NDJSON event: `{"t":"think"|"text","c":"<delta>"}\n`.
    // JSON.stringify keeps newlines/quotes in the delta safely escaped.
    const encodeEvent = (t: "think" | "text", c: string): Uint8Array =>
      encoder.encode(`${JSON.stringify({ t, c })}\n`);
    let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = source.getReader();
        upstreamReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        const flushLine = (line: string): boolean => {
          const trimmed = line.trim();
          if (!trimmed) return false;
          let json: {
            message?: { content?: string; thinking?: string };
            error?: string;
            done?: boolean;
          };
          try {
            json = JSON.parse(trimmed);
          } catch {
            // Ignore any non-JSON line rather than aborting the stream.
            return false;
          }
          if (json.error) {
            controller.enqueue(encodeEvent("text", `\n[error] ${json.error}`));
            return true; // signal done
          }
          // Reasoning models emit a long `thinking` phase before any content;
          // forward both as typed events so the client can render them apart.
          const thinking = json.message?.thinking;
          if (thinking) controller.enqueue(encodeEvent("think", thinking));
          const content = json.message?.content;
          if (content) controller.enqueue(encodeEvent("text", content));
          return json.done === true;
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex = buffer.indexOf("\n");
            let finished = false;
            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              if (flushLine(line)) {
                finished = true;
                break;
              }
              newlineIndex = buffer.indexOf("\n");
            }
            if (finished) break;
          }
          // Flush any trailing buffered line.
          if (buffer.trim()) flushLine(buffer);
        } catch (err) {
          controller.enqueue(
            encodeEvent(
              "text",
              `\n[error] Stream interrupted: ${
                err instanceof Error ? err.message : "unknown error"
              }`,
            ),
          );
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
      // Client disconnected — stop pulling tokens from Ollama.
      cancel(reason) {
        upstreamReader?.cancel(reason).catch(() => {});
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Deduped sources travel out-of-band so the stream body stays pure text.
        "X-Sources": encodeURIComponent(JSON.stringify(sources)),
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Unexpected server error.",
        code: "internal_error",
      },
      { status: 500 },
    );
  }
}
