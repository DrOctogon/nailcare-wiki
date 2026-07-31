import { getContextChunks, type ContextChunk } from "@/lib/wiki/rag";

export const runtime = "nodejs";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

const MAX_SLUGS = 6;
const HEALTH_TIMEOUT_MS = 2500;

interface OllamaHealth {
  serving: boolean;
  models: string[];
  hasModel: boolean;
}

interface OllamaTagsResponse {
  models?: { name?: string }[];
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

function buildMessages(
  question: string,
  chunks: ContextChunk[],
): ChatMessage[] {
  const system =
    "You answer questions about a personal knowledge vault of nail-care and " +
    "salon-business research notes. Use ONLY the information in the provided " +
    "context notes to answer — do not rely on outside knowledge. Cite the note " +
    "titles inline (e.g. “According to ‘Gel vs Acrylic’ …”) " +
    "when you draw on them. If the context does not contain enough information " +
    "to answer, say so plainly rather than guessing. Be concise.";

  const contextBlocks = chunks.length
    ? chunks
        .map((chunk, i) => `${i + 1}. ### ${chunk.title}\n${chunk.text}`)
        .join("\n\n")
    : "(No matching notes were found in the vault.)";

  const user = `Context notes:\n\n${contextBlocks}\n\nQuestion: ${question}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Report Ollama availability + the configured model, for the client status pill. */
export async function GET(): Promise<Response> {
  const { serving, hasModel, models } = await checkOllama();
  return Response.json({ serving, model: MODEL, hasModel, models });
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
    const question = record.question;
    const slugs = record.slugs;

    if (typeof question !== "string" || !question.trim()) {
      return Response.json(
        { error: "`question` must be a non-empty string." },
        { status: 400 },
      );
    }
    if (
      !Array.isArray(slugs) ||
      slugs.length > 100 ||
      !slugs.every((s): s is string => typeof s === "string")
    ) {
      return Response.json(
        { error: "`slugs` must be an array of at most 100 strings." },
        { status: 400 },
      );
    }

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
    if (!health.hasModel) {
      return Response.json(
        {
          error: `Model \`${MODEL}\` is not installed. Run \`ollama pull ${MODEL}\`.`,
          code: "model_missing",
          model: MODEL,
        },
        { status: 503 },
      );
    }

    const chunks = await getContextChunks(slugs.slice(0, MAX_SLUGS));
    const messages = buildMessages(question.trim(), chunks);

    const upstream = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, stream: true }),
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
            message?: { content?: string };
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
            controller.enqueue(
              encoder.encode(`\n[error] ${json.error}`),
            );
            return true; // signal done
          }
          const content = json.message?.content;
          if (content) controller.enqueue(encoder.encode(content));
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
            encoder.encode(
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
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
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
