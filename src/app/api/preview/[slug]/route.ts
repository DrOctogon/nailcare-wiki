import { getPage } from "@/lib/wiki/vault";
import type { WikiType } from "@/lib/wiki/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** Compact payload for the wikilink hover preview — light on purpose. */
export interface PreviewPayload {
  slug: string;
  title: string;
  type: WikiType;
  dir: string;
  excerpt: string;
  backlinkCount: number;
}

/**
 * Return a small summary for a single note, used by the wikilink hover card.
 *
 * The slug only resolves through the server-built pages map, so there is no way
 * to reach an arbitrary file here. The full rendered HTML is deliberately left
 * out — the preview only needs the title, type/dir, excerpt, and backlink count,
 * which keeps the response tiny and cacheable.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const { slug } = await params;
    const page = await getPage(slug);
    if (!page) {
      return Response.json(
        { error: `No note found for "${slug}".` },
        { status: 404 },
      );
    }

    const payload: PreviewPayload = {
      slug: page.slug,
      title: page.title,
      type: page.type,
      dir: page.dir,
      excerpt: page.excerpt,
      backlinkCount: page.backlinkCount,
    };

    return Response.json(payload, {
      headers: {
        // The vault is local and static per build, so a short public cache is
        // safe and makes re-hovers across page loads instant.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to load preview.",
        code: "preview_error",
      },
      { status: 500 },
    );
  }
}
