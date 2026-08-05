import fs from "node:fs/promises";

import { getPage } from "@/lib/wiki/vault";
import { safeWriteFile } from "@/lib/wiki/safe-write";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** Hard cap on note size accepted by PUT (~1 MB). */
const MAX_CONTENT_BYTES = 1_000_000;

/**
 * GET — return a note's raw Markdown for editing.
 *
 * The slug only resolves through the server-built pages map, so `page.filePath`
 * always points at a vetted vault file — there's no way to request an arbitrary
 * path here (same no-traversal guarantee the raw/RAG routes rely on).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) {
    return Response.json(
      { error: `No note found for "${slug}".` },
      { status: 404 },
    );
  }

  try {
    const [content, stat] = await Promise.all([
      fs.readFile(page.filePath, "utf8"),
      fs.stat(page.filePath),
    ]);
    return Response.json(
      // `mtimeMs` lets the editor detect if the file changed underneath it
      // (external Obsidian edit / another tab) before it overwrites — see PUT.
      { slug: page.slug, title: page.title, content, mtimeMs: stat.mtimeMs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to read note file.",
        code: "read_error",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT — safely overwrite a note's Markdown (backup + atomic rename, never
 * delete). Editing is a local-only feature; set `DISABLE_EDIT=1` to turn it off.
 *
 * NOTE ON STALE CACHE: the vault is parsed once per build worker into an
 * in-memory singleton (see vault.ts). After a successful write that singleton
 * is stale — the edit shows on the next full reload / dev restart. We do NOT
 * hot-invalidate the singleton (out of scope); the response says so instead.
 */
export async function PUT(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  // Opt-out: editing is a local-only feature.
  if (process.env.DISABLE_EDIT === "1") {
    return Response.json(
      { error: "Editing is disabled (DISABLE_EDIT=1)." },
      { status: 403 },
    );
  }

  const { slug } = await params;

  // ---- Parse + validate the body --------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return Response.json(
      { error: "Body must be `{ content: string }` with non-empty content." },
      { status: 400 },
    );
  }

  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_CONTENT_BYTES) {
    return Response.json(
      {
        error: `Content too large (${byteLength} bytes; max ${MAX_CONTENT_BYTES}).`,
      },
      { status: 413 },
    );
  }

  // ---- Resolve the slug to a REAL vault file (no traversal) ------------
  const page = await getPage(slug);
  if (!page) {
    return Response.json(
      { error: `No note found for "${slug}".` },
      { status: 404 },
    );
  }

  // ---- Conflict check: refuse to silently clobber an external edit -----
  // The editor sends the file's `mtimeMs` from when it loaded. If the file on
  // disk is newer (edited in Obsidian, another tab, etc.), reject with 409 so
  // the user's stale buffer can't overwrite fresher content. `overwrite:true`
  // forces past it (a backup is still taken either way).
  const record = body as { baseMtimeMs?: unknown; overwrite?: unknown } | null;
  const baseMtimeMs = record?.baseMtimeMs;
  const overwrite = record?.overwrite === true;
  if (!overwrite && typeof baseMtimeMs === "number") {
    try {
      const current = await fs.stat(page.filePath);
      // Allow a 1ms slop for filesystem timestamp rounding.
      if (current.mtimeMs - baseMtimeMs > 1) {
        return Response.json(
          {
            error:
              "This note changed on disk since you opened it. Reload to see the latest, or overwrite to keep your version (a backup is kept either way).",
            code: "conflict",
            currentMtimeMs: current.mtimeMs,
          },
          { status: 409 },
        );
      }
    } catch {
      // If we can't stat it, fall through — safeWriteFile re-guards the path.
    }
  }

  // ---- Safe write ------------------------------------------------------
  const result = await safeWriteFile(page.filePath, content);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  // The post-write mtime becomes the editor's new baseline for conflict checks.
  let newMtimeMs: number | null = null;
  try {
    newMtimeMs = (await fs.stat(page.filePath)).mtimeMs;
  } catch {
    // Non-fatal: the write succeeded; the editor just won't refresh its baseline.
  }

  return Response.json(
    {
      ok: true,
      backupPath: result.backupPath,
      mtimeMs: newMtimeMs,
      note: "Saved. A backup of the prior version was kept. The change appears after the page rebuilds or the dev server reloads (the in-memory vault cache is not hot-invalidated).",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
