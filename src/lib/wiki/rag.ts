import "server-only";

import fs from "node:fs/promises";
import matter from "gray-matter";

import { getPage } from "./vault";

export interface ContextChunk {
  slug: string;
  title: string;
  dir: string;
  text: string;
}

const DEFAULT_MAX_CHARS = 1500;

/**
 * Strip markdown/wikilink noise to a compact text blob suitable for feeding an
 * LLM as retrieval context — mirrors the cleaning done at embed time so the
 * text the model reads matches what was indexed.
 */
function cleanMarkdown(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/^#.*$/gm, (h) => h.replace(/^#+\s*/, "")) // heading markers
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t) // wikilink → label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // md link → text
    .replace(/[*_`>#-]/g, " ") // stray md symbols
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Resolve a list of slugs to cleaned, length-capped context chunks in input
 * order. Missing pages and unreadable files are skipped (never thrown) so a
 * single bad note can't sink the whole retrieval.
 */
export async function getContextChunks(
  slugs: string[],
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<ContextChunk[]> {
  const chunks: ContextChunk[] = [];

  for (const slug of slugs) {
    const page = await getPage(slug);
    if (!page) continue;

    let source: string;
    try {
      source = await fs.readFile(page.filePath, "utf8");
    } catch {
      // Skip notes we can't read rather than aborting the whole answer.
      continue;
    }

    const body = matter(source).content;
    const text = cleanMarkdown(body).slice(0, maxChars);
    if (!text) continue;

    chunks.push({ slug: page.slug, title: page.title, dir: page.dir, text });
  }

  return chunks;
}
