import fs from "node:fs/promises";

import { getPage } from "@/lib/wiki/vault";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * Stream a single note's raw Markdown as a download.
 *
 * The slug only resolves through the server-built pages map, so `page.filePath`
 * always points at a vetted vault file — there's no way to request an arbitrary
 * path here (same guarantee the RAG routes rely on).
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) {
    return Response.json({ error: `No note found for "${slug}".` }, { status: 404 });
  }

  try {
    const markdown = await fs.readFile(page.filePath, "utf8");
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.md"`,
        "Cache-Control": "no-store",
      },
    });
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
