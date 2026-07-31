import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET, POST } from "./route";

// The default model the route probes for when none is explicitly requested.
const DEFAULT_MODEL = "llama3.2:3b";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- helpers ---------------------------------------------------------------

function postRequest(body: unknown, raw = false): Request {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

/** A well-formed `/api/tags` response listing the given model names. */
function tagsResponse(models: string[]): Response {
  return new Response(
    JSON.stringify({ models: models.map((name) => ({ name })) }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** A streaming `/api/chat` response emitting the given NDJSON lines. */
function chatStreamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

/** Route fetch by URL: tags vs chat. */
function routeFetch(handlers: {
  tags?: () => Response | Promise<Response>;
  chat?: (init?: RequestInit) => Response | Promise<Response>;
}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/api/tags")) {
      if (handlers.tags) return handlers.tags();
      return tagsResponse([DEFAULT_MODEL]);
    }
    if (String(url).endsWith("/api/chat")) {
      if (handlers.chat) return handlers.chat(init);
      return chatStreamResponse(['{"message":{"content":""},"done":true}\n']);
    }
    throw new Error(`unexpected fetch url: ${url}`);
  });
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  question: "What is gel polish?",
  history: [],
  context: [],
  ...overrides,
});

// --- GET -------------------------------------------------------------------

describe("GET /api/ask", () => {
  it("returns serving/model/hasModel/models from the tags probe", async () => {
    routeFetch({ tags: () => tagsResponse([DEFAULT_MODEL, "mistral:7b"]) });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      serving: true,
      model: DEFAULT_MODEL,
      hasModel: true,
    });
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models).toContain(DEFAULT_MODEL);
  });

  it("reports not serving when the probe fails", async () => {
    routeFetch({
      tags: () => Promise.reject(new Error("ECONNREFUSED")),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ serving: false, hasModel: false, models: [] });
    expect(body.model).toBe(DEFAULT_MODEL);
  });
});

// --- POST validation -------------------------------------------------------

describe("POST /api/ask — request validation", () => {
  it("400 on invalid JSON body", async () => {
    routeFetch({});
    const res = await POST(postRequest("this is not json{", true));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 on missing question", async () => {
    routeFetch({});
    const res = await POST(postRequest({ history: [], context: [] }));
    expect(res.status).toBe(400);
  });

  it("400 on empty / whitespace question", async () => {
    routeFetch({});
    const res = await POST(postRequest(validBody({ question: "   " })));
    expect(res.status).toBe(400);
  });

  it("400 when history is not an array", async () => {
    routeFetch({});
    const res = await POST(postRequest(validBody({ history: "nope" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/history/);
  });

  it("400 when history exceeds 40 turns", async () => {
    routeFetch({});
    const history = Array.from({ length: 41 }, () => ({
      role: "user",
      content: "hi",
    }));
    const res = await POST(postRequest(validBody({ history })));
    expect(res.status).toBe(400);
  });

  it("400 when a history element has the wrong shape", async () => {
    routeFetch({});
    const res = await POST(
      postRequest(validBody({ history: [{ role: "system", content: "x" }] })),
    );
    expect(res.status).toBe(400);
  });

  it("400 when a history element is missing content", async () => {
    routeFetch({});
    const res = await POST(
      postRequest(validBody({ history: [{ role: "user" }] })),
    );
    expect(res.status).toBe(400);
  });

  it("400 when context is not an array", async () => {
    routeFetch({});
    const res = await POST(postRequest(validBody({ context: {} })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/context/);
  });

  it("400 when context exceeds 12 notes", async () => {
    routeFetch({});
    const context = Array.from({ length: 13 }, (_v, i) => ({
      title: `t${i}`,
      text: "body",
    }));
    const res = await POST(postRequest(validBody({ context })));
    expect(res.status).toBe(400);
  });

  it("400 when a context element has the wrong shape", async () => {
    routeFetch({});
    const res = await POST(
      postRequest(validBody({ context: [{ title: "only title" }] })),
    );
    expect(res.status).toBe(400);
  });

  it("400 when model is not a string", async () => {
    routeFetch({});
    const res = await POST(postRequest(validBody({ model: 123 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/model/);
  });
});

// --- POST Ollama availability ----------------------------------------------

describe("POST /api/ask — Ollama availability", () => {
  it("503 ollama_unreachable when the probe throws", async () => {
    routeFetch({ tags: () => Promise.reject(new Error("down")) });
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("ollama_unreachable");
  });

  it("503 ollama_unreachable when tags returns a non-ok status", async () => {
    routeFetch({ tags: () => new Response("nope", { status: 500 }) });
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("ollama_unreachable");
  });

  it("503 model_missing when the default model is not installed", async () => {
    routeFetch({ tags: () => tagsResponse(["mistral:7b", "qwen:4b"]) });
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("model_missing");
    expect(body.model).toBe(DEFAULT_MODEL);
  });

  it("400 model_not_installed when an explicit model is absent", async () => {
    routeFetch({ tags: () => tagsResponse([DEFAULT_MODEL]) });
    const res = await POST(postRequest(validBody({ model: "ghost:70b" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("model_not_installed");
    expect(body.model).toBe("ghost:70b");
  });
});

// --- POST happy path -------------------------------------------------------

describe("POST /api/ask — streaming happy path", () => {
  it("streams concatenated NDJSON content as text/plain", async () => {
    routeFetch({
      tags: () => tagsResponse([DEFAULT_MODEL]),
      chat: () =>
        chatStreamResponse([
          '{"message":{"content":"Hello "}}\n',
          '{"message":{"content":"world"},"done":true}\n',
        ]),
    });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);

    const text = await res.text();
    expect(text).toBe("Hello world");
  });

  it("routes the chosen model into the chat request body with a signal", async () => {
    const requested = "llama3.2:1b";
    let chatInit: RequestInit | undefined;

    routeFetch({
      // Requested model must be installed to pass the availability check.
      tags: () => tagsResponse([DEFAULT_MODEL, requested]),
      chat: (init) => {
        chatInit = init;
        return chatStreamResponse([
          '{"message":{"content":"ok"},"done":true}\n',
        ]);
      },
    });

    const res = await POST(postRequest(validBody({ model: requested })));
    expect(res.status).toBe(200);
    await res.text();

    // Two fetches: tags probe then chat.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const chatCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/api/chat"),
    );
    expect(chatCall).toBeDefined();

    expect(chatInit).toBeDefined();
    const parsed = JSON.parse(String(chatInit!.body));
    expect(parsed.model).toBe(requested);
    expect(parsed.stream).toBe(true);
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(chatInit!.signal).toBeDefined();
  });

  it("defaults to the configured model when none is requested", async () => {
    let chatInit: RequestInit | undefined;
    routeFetch({
      tags: () => tagsResponse([DEFAULT_MODEL]),
      chat: (init) => {
        chatInit = init;
        return chatStreamResponse([
          '{"message":{"content":"hi"},"done":true}\n',
        ]);
      },
    });

    const res = await POST(postRequest(validBody()));
    await res.text();
    expect(JSON.parse(String(chatInit!.body)).model).toBe(DEFAULT_MODEL);
  });

  it("502 ollama_error when the chat call returns non-ok", async () => {
    routeFetch({
      tags: () => tagsResponse([DEFAULT_MODEL]),
      chat: () => new Response("boom", { status: 500 }),
    });
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("ollama_error");
  });
});
