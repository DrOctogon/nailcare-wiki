export const runtime = "nodejs";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

const HEALTH_TIMEOUT_MS = 2500;
// Local generation is best-effort; if the model can't produce a short summary
// in time we return an empty summary rather than hanging the request.
const GENERATE_TIMEOUT_MS = 8000;
// The prompt lists note titles — cap so a bad/huge payload can't blow up the
// local model's context or the request body.
const MAX_TITLES = 40;
const NUM_PREDICT = 200;
const TEMPERATURE = 0.4;

/** Graceful response shape — `code` explains an empty summary to the client. */
interface SummaryResult {
  summary: string;
  code?: "unavailable" | "timeout" | "error";
}

interface OllamaTagsResponse {
  models?: { name?: string }[];
}

interface OllamaChatResponse {
  message?: { content?: string };
}

/** Probe the local Ollama instance: is it up, and does it have the chosen model? */
async function checkOllama(
  model: string,
): Promise<{ serving: boolean; hasModel: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { serving: false, hasModel: false };
    const data = (await res.json()) as OllamaTagsResponse;
    const models = Array.isArray(data.models)
      ? data.models
          .map((m) => (typeof m.name === "string" ? m.name : ""))
          .filter(Boolean)
      : [];
    return { serving: true, hasModel: models.includes(model) };
  } catch {
    // Unreachable, timed out, or malformed — treat as not serving.
    return { serving: false, hasModel: false };
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(titles: readonly string[]): string {
  const list = titles.map((t) => `- ${t}`).join("\n");
  return (
    "Here are the titles of notes recently added or updated in a personal " +
    "nail-care/salon-business research vault:\n\n" +
    `${list}\n\n` +
    "Write a 2-3 sentence summary of the themes the recent work is focused on. " +
    "Be concrete and specific; do not restate the instruction or list the titles back."
  );
}

/** POST { titles: string[], model?: string } → { summary, code? }. Never throws. */
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
    const rawTitles = record.titles;
    const rawModel = record.model;

    if (!Array.isArray(rawTitles)) {
      return Response.json(
        { error: "`titles` must be an array of strings." },
        { status: 400 },
      );
    }
    if (rawModel !== undefined && typeof rawModel !== "string") {
      return Response.json(
        { error: "`model` must be a string when provided." },
        { status: 400 },
      );
    }

    const titles = rawTitles
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TITLES);

    if (titles.length === 0) {
      return Response.json(
        { error: "`titles` must contain at least one non-empty string." },
        { status: 400 },
      );
    }

    const model = rawModel?.trim() || MODEL;

    const { serving, hasModel } = await checkOllama(model);
    if (!serving || !hasModel) {
      const result: SummaryResult = { summary: "", code: "unavailable" };
      return Response.json(result);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You summarize the themes of a personal research vault concisely and factually.",
            },
            { role: "user", content: buildPrompt(titles) },
          ],
          stream: false,
          options: { temperature: TEMPERATURE, num_predict: NUM_PREDICT },
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!upstream.ok) {
        const result: SummaryResult = { summary: "", code: "error" };
        return Response.json(result);
      }

      const data = (await upstream.json()) as OllamaChatResponse;
      const summary =
        typeof data.message?.content === "string"
          ? data.message.content.trim()
          : "";

      const result: SummaryResult = summary
        ? { summary }
        : { summary: "", code: "error" };
      return Response.json(result);
    } catch {
      // Aborted (timeout) or transport error — degrade gracefully.
      const result: SummaryResult = { summary: "", code: "timeout" };
      return Response.json(result);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Belt-and-suspenders: never let the digest summary throw a 500.
    const result: SummaryResult = { summary: "", code: "error" };
    return Response.json(result);
  }
}
