// Pure text helpers shared by the standalone embedding script and the
// server-side freshness check. Keeping cleaning/chunking/hashing in one place
// guarantees the index manifest's content hashes line up byte-for-byte with
// what the live vault would produce — otherwise freshness would report drift
// that isn't real. No "server-only" import here: the tsx embed script imports
// this module directly.
import { createHash } from "node:crypto";

/** Strip markdown/wikilink noise to a compact text blob (full, untruncated). */
export function cleanBody(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#.*$/gm, (h) => h.replace(/^#+\s*/, ""))
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split cleaned text into ~`size`-char windows on word boundaries with
 * `overlap` chars of context carried between adjacent windows. Empty or
 * whitespace-only chunks are dropped; text at or under `size` returns as one
 * chunk (or nothing when empty).
 */
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= size) return [trimmed];

  const words = trimmed.split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + 1 + word.length > size) {
      chunks.push(current);
      // Carry the trailing `overlap` chars into the next window for context.
      const tail = current.slice(Math.max(0, current.length - overlap));
      const boundary = tail.indexOf(" ");
      current = boundary >= 0 ? tail.slice(boundary + 1) : "";
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);

  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

/** Stable content fingerprint for a note's cleaned body text. */
export function noteHash(cleanedText: string): string {
  return createHash("sha256").update(cleanedText).digest("hex");
}
