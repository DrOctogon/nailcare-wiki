import { spawn } from "node:child_process";

import { invalidateChunks } from "@/lib/wiki/rag-retrieval";

// Long-running, filesystem-writing incremental embed — must run on the Node
// runtime, and given a generous ceiling so a cold model download can finish.
export const runtime = "nodejs";
export const maxDuration = 300;

// Single-flight guard: only one embed may run per process at a time. Module
// scope survives across requests for the life of the server process.
let running = false;

/**
 * Kick off the incremental vault embed (`pnpm embed`) and stream its merged
 * stdout/stderr back to the caller as plain text. On a clean exit the server's
 * in-process chunk cache is invalidated so retrieval immediately sees the fresh
 * index. Local-only convenience endpoint — gate off in shared deployments via
 * `DISABLE_REINDEX=1`.
 */
export function POST(): Response {
  // Local-only convenience endpoint: refuse when explicitly disabled so it can't
  // be triggered in a shared/hosted deployment.
  if (process.env.DISABLE_REINDEX === "1") {
    return Response.json(
      { error: "Reindex is disabled in this environment." },
      { status: 403 },
    );
  }

  if (running) {
    return Response.json(
      { error: "Reindex already in progress." },
      { status: 409 },
    );
  }

  try {
    running = true;

    const child = spawn("node_modules/.bin/tsx", ["scripts/embed-vault.ts"], {
      cwd: process.cwd(),
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const close = (): void => {
          if (closed) return;
          closed = true;
          running = false;
          controller.close();
        };

        const onChunk = (buf: Buffer): void => {
          if (closed) return;
          controller.enqueue(encoder.encode(decoder.decode(buf)));
        };

        child.stdout.on("data", onChunk);
        child.stderr.on("data", onChunk);

        child.on("error", (err: Error) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`\n[error] failed to start embed: ${err.message}\n`),
          );
          close();
        });

        child.on("close", (code: number | null) => {
          if (closed) return;
          if (code === 0) {
            // Fresh chunks on disk — drop the server cache so the next question
            // retrieves against the newly embedded index.
            invalidateChunks();
            controller.enqueue(encoder.encode("\n[done] reindex complete\n"));
          } else {
            controller.enqueue(
              encoder.encode(`\n[error] embed exited with code ${code}\n`),
            );
          }
          close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    running = false;
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to start reindex: ${message}` },
      { status: 500 },
    );
  }
}
