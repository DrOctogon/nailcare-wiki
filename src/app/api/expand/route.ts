// HyDE (Hypothetical Document Embeddings) query expansion. Given a question,
// ask the local model to write a short hypothetical answer — the kind of
// passage a relevant note WOULD contain. The client embeds that passage
// instead of the raw question, which typically improves retrieval recall.
//
// This endpoint is best-effort by design: on ANY failure (Ollama down, timeout,
// bad model, malformed response) it returns `{ text: "" }` with a 200 so the
// client can transparently fall back to embedding the raw question. It never
// throws.

export const runtime = "nodejs";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

// Keep expansion snappy — the client waits on this before it can even embed, so
// a slow model must not stall the whole ask. If we can't get a hypothetical
// passage in ~4s, we bail and let the client use the raw question.
// Warm, the hypothetical passage returns in ~2.5s; allow headroom for a
// cold/just-loaded model before falling back to embedding the raw question.
const EXPAND_TIMEOUT_MS = 9000;

interface OllamaChatResponse {
  message?: { content?: string };
}

/** Build the HyDE prompt: a short, preamble-free hypothetical answer. */
function buildPrompt(question: string): string {
  return (
    "Write a short, hypothetical passage (2-3 sentences) that directly answers " +
    "the question below, as if it were an excerpt from a relevant reference " +
    "note. State it as fact in a confident, encyclopedic tone. Do NOT include " +
    "any preamble, disclaimers, or meta-commentary — output only the passage " +
    `itself.\n\nQuestion: ${question}`
  );
}

/**
 * Combine the client's request-abort signal with our own timeout so either can
 * cancel the upstream fetch. Returns the signal plus a cleanup for the timer.
 */
function withTimeout(
  requestSignal: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (requestSignal.aborted) {
    controller.abort();
  } else {
    requestSignal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      requestSignal.removeEventListener("abort", onAbort);
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  // Parse + validate the body. Bad input is a 400; everything downstream that
  // could go wrong instead degrades to `{ text: "" }`.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawQuestion = record.question;
  const rawModel = record.model;

  if (typeof rawQuestion !== "string" || !rawQuestion.trim()) {
    return Response.json(
      { error: "`question` must be a non-empty string." },
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
  const model = rawModel && rawModel.trim() ? rawModel : MODEL;

  const { signal, cancel } = withTimeout(request.signal, EXPAND_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildPrompt(question) }],
        stream: false,
        options: { temperature: 0.3, num_predict: 120 },
      }),
      signal,
    });

    if (!res.ok) return Response.json({ text: "" });

    const data = (await res.json()) as OllamaChatResponse;
    const text = data.message?.content?.trim() ?? "";
    return Response.json({ text });
  } catch {
    // Timeout, abort, unreachable Ollama, or malformed response — fall back to
    // the raw question on the client. Never throw.
    return Response.json({ text: "" });
  } finally {
    cancel();
  }
}
