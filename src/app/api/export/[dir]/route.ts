import fs from "node:fs/promises";

import JSZip from "jszip";

import { getPage, getPagesByDir } from "@/lib/wiki/vault";
import { BROWSE_DIRS, type BrowseDir } from "@/lib/wiki/config";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ dir: string }>;
}

function isBrowseDir(value: string): value is BrowseDir {
  return (BROWSE_DIRS as readonly string[]).includes(value);
}

/**
 * Bundle every note in a browsable collection into a downloadable `.zip`.
 *
 * `dir` is validated against the fixed BROWSE_DIRS allowlist, and each file is
 * read via a page's server-built `filePath` — unreadable notes are skipped
 * rather than failing the whole archive.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const { dir } = await params;
  if (!isBrowseDir(dir)) {
    return Response.json(
      { error: `"${dir}" is not a valid collection.` },
      { status: 400 },
    );
  }

  try {
    const metas = await getPagesByDir(dir);
    const zip = new JSZip();

    for (const meta of metas) {
      const page = await getPage(meta.slug);
      if (!page) continue;
      try {
        const markdown = await fs.readFile(page.filePath, "utf8");
        zip.file(`${meta.slug}.md`, markdown);
      } catch {
        // Skip notes whose backing file can't be read — a single bad file
        // shouldn't sink the whole export.
        continue;
      }
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${dir}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to build export.",
        code: "export_error",
      },
      { status: 500 },
    );
  }
}
